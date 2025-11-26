/**
 * Servicio de WhatsApp Multi-Sesión COMPLETO
 * Integra toda la lógica del bot original para múltiples tiendas
 */

import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, jidDecode } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const STORE_FRONT_URL = process.env.STORE_FRONT_URL || 'https://elbuenmenu.site';
const API_URL = process.env.API_URL || 'https://api.elbuenmenu.site/api';

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
const CONFIG = {
  rateLimitWindow: 60000,
  maxMessagesPerWindow: 20,
  maxSessionAge: 1800000,
  retryAttempts: 3,
  retryDelay: 2000
};

// ---------------------------------------------------------------------------
// WHATSAPP TEMPLATES POR TIPO DE LOCAL
// ---------------------------------------------------------------------------
const WHATSAPP_TEMPLATES = {
  rotiseria: {
    welcome: '👋 ¡Hola! Somos {{storeName}}.\n\nHacé tu pedido directo desde nuestra carta:\n🔗 {{storeUrl}}\n\nY lo coordinamos por acá. 🍔',
    orderConfirm: '✅ *PEDIDO CONFIRMADO*\n\nPedido: #{{orderNumber}}\nLocal: {{storeName}}\nCódigo repartidor: {{deliveryCode}}\n\n📍 Seguimiento: {{trackingUrl}}',
    orderOnWay: '🚗 *PEDIDO EN CAMINO*\n\nTu pedido #{{orderNumber}} ya salió de {{storeName}}.\n\nCódigo: {{deliveryCode}}\n📍 Tracking: {{trackingUrl}}'
  },
  kiosco: {
    welcome: '🙌 ¡Hola! Bienvenido a {{storeName}}.\n\nPedí todo lo que necesitás en:\n🔗 {{storeUrl}}\n\nTe respondemos enseguida. 🛍️',
    orderConfirm: '🛍️ *PEDIDO CONFIRMADO*\n\nPedido: #{{orderNumber}}\nCódigo de retiro: {{deliveryCode}}\n\n¡Gracias por tu compra!',
    orderOnWay: '🚕 Tu pedido #{{orderNumber}} salió de {{storeName}}.\n\nMostrá el código {{deliveryCode}} al repartidor.\n📍 Tracking: {{trackingUrl}}'
  },
  tragos: {
    welcome: '🍹 ¡Hola! Estás en {{storeName}}.\n\nElegí tus tragos en:\n🔗 {{storeUrl}}\n\nTe confirmamos por WhatsApp. 🍾',
    orderConfirm: '🍾 *PEDIDO CONFIRMADO*\n\nPedido: #{{orderNumber}}\nCódigo bartender: {{deliveryCode}}\n\n¡Salud! 🥂',
    orderOnWay: '🛵 Tus tragos #{{orderNumber}} van en camino.\n\nCódigo: {{deliveryCode}}\n📍 Tracking: {{trackingUrl}}'
  }
};

// ---------------------------------------------------------------------------
// GREETING PATTERNS
// ---------------------------------------------------------------------------
const GREETING_PATTERNS = [
  /^hola$/i, /^hi$/i, /^hello$/i, /^buenas$/i, /^buenos días$/i, 
  /^buenas tardes$/i, /^buenas noches$/i, /^buen día$/i, /^que tal$/i,
  /^hey$/i, /^ey$/i, /^holis$/i, /^holaa+$/i, /^hola!+$/i
];

const MENU_PATTERNS = [
  /^menu$/i, /^menú$/i, /^carta$/i, /^ver menu$/i, /^ver menú$/i,
  /^1$/i, /^quiero pedir$/i, /^pedir$/i, /^pedido$/i
];

const HOURS_PATTERNS = [
  /^horarios?$/i, /^4$/i, /^que horario/i, /^a que hora/i, /^están abiertos/i, /^abren/i
];

const DELIVERY_PATTERNS = [
  /^delivery$/i, /^envío$/i, /^envio$/i, /^5$/i, /^hacen delivery/i, /^costo de envío/i
];

const LOCATION_PATTERNS = [
  /^ubicación$/i, /^ubicacion$/i, /^dirección$/i, /^direccion$/i, /^6$/i, /^donde están/i, /^donde quedan/i
];

// ---------------------------------------------------------------------------
// SPAM DETECTION
// ---------------------------------------------------------------------------
const spamPatterns = [
  /ganar dinero/i, /trabajo desde casa/i, /inversión/i, /bitcoin/i,
  /forex/i, /casino/i, /apuesta/i, /préstamo/i, /crédito fácil/i,
  /http[s]?:\/\/[^\s]+/i, // URLs sospechosas
];

function isSpamMessage(text) {
  if (!text) return false;
  return spamPatterns.some(pattern => pattern.test(text));
}

// ---------------------------------------------------------------------------
// RATE LIMITING PER STORE
// ---------------------------------------------------------------------------
const rateLimitMaps = new Map(); // storeId -> Map(userId -> stats)

function checkRateLimit(storeId, userId) {
  if (!rateLimitMaps.has(storeId)) {
    rateLimitMaps.set(storeId, new Map());
  }
  
  const storeRateLimit = rateLimitMaps.get(storeId);
  const now = Date.now();
  
  if (!storeRateLimit.has(userId)) {
    storeRateLimit.set(userId, { messages: [], lastMessage: 0, blocked: false, blockUntil: 0 });
  }
  
  const stats = storeRateLimit.get(userId);
  
  if (stats.blocked && now < stats.blockUntil) {
    return { allowed: false, reason: 'rate_limit', waitSeconds: Math.ceil((stats.blockUntil - now) / 1000) };
  }
  
  if (stats.blocked && now >= stats.blockUntil) {
    stats.blocked = false;
    stats.blockUntil = 0;
    stats.messages = [];
  }
  
  stats.messages = stats.messages.filter(time => now - time < CONFIG.rateLimitWindow);
  
  if (stats.messages.length >= CONFIG.maxMessagesPerWindow) {
    stats.blocked = true;
    stats.blockUntil = now + CONFIG.rateLimitWindow;
    return { allowed: false, reason: 'rate_limit', waitSeconds: Math.ceil(CONFIG.rateLimitWindow / 1000) };
  }
  
  // Anti-flood: mínimo 2 segundos entre mensajes
  if (now - stats.lastMessage < 2000) {
    return { allowed: false, reason: 'too_fast' };
  }
  
  stats.messages.push(now);
  stats.lastMessage = now;
  
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// USER SESSIONS PER STORE
// ---------------------------------------------------------------------------
const userSessionsPerStore = new Map(); // storeId -> Map(userId -> session)

function getUserSession(storeId, userId) {
  if (!userSessionsPerStore.has(storeId)) {
    userSessionsPerStore.set(storeId, new Map());
  }
  
  const storeSessions = userSessionsPerStore.get(storeId);
  
  if (!storeSessions.has(userId)) {
    storeSessions.set(userId, {
      step: 'welcome',
      lastActivity: Date.now(),
      pendingOrder: null,
      paymentMethod: null,
      waitingForConfirmation: false,
      waitingForPayment: false,
      waitingForTransferProof: false,
      waitingForAddress: false
    });
  }
  
  const session = storeSessions.get(userId);
  session.lastActivity = Date.now();
  return session;
}

// ---------------------------------------------------------------------------
// DIRECTORIO DE SESIONES
// ---------------------------------------------------------------------------
const SESSIONS_DIR = path.join(__dirname, '../../whatsapp-sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Almacén de sesiones activas
const activeSessions = new Map();
const pendingQRs = new Map();

// Logger silencioso para Baileys
const logger = pino({ level: 'silent' });

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------
function getTemplateByPanel(panelType = 'rotiseria') {
  return WHATSAPP_TEMPLATES[panelType] || WHATSAPP_TEMPLATES.rotiseria;
}

function applyPlaceholders(message, context = {}) {
  if (!message) return '';
  let result = message;
  Object.entries({
    storeName: context.storeName || 'nuestro local',
    storeUrl: context.storeUrl || STORE_FRONT_URL,
    orderNumber: context.orderNumber || '',
    deliveryCode: context.deliveryCode || '',
    trackingUrl: context.trackingUrl || '',
  }).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  });
  return result;
}

async function getStoreContext(storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const settings = await prisma.storeSettings.findUnique({ where: { storeId } });
  const template = getTemplateByPanel(store?.panelType || 'rotiseria');
  const storeUrl = `${STORE_FRONT_URL}/menu?store=${storeId}`;
  return { store, settings, template, storeUrl };
}

function matchesPattern(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

// ---------------------------------------------------------------------------
// GET OR CREATE SESSION
// ---------------------------------------------------------------------------
export async function getOrCreateSession(storeId) {
  if (activeSessions.has(storeId)) {
    const session = activeSessions.get(storeId);
    if (session.socket && session.socket.user) {
      return { status: 'connected', session };
    }
  }
  return await createSession(storeId);
}

// ---------------------------------------------------------------------------
// CREATE SESSION
// ---------------------------------------------------------------------------
async function createSession(storeId) {
  const sessionPath = path.join(SESSIONS_DIR, storeId);
  
  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ['NegociosApp', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
    });

    // Manejar actualizaciones de conexión
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrBase64 = await QRCode.toDataURL(qr);
        pendingQRs.set(storeId, {
          qr: qrBase64,
          timestamp: Date.now(),
          expires: Date.now() + 60000
        });
        console.log(`[WhatsApp] QR generado para tienda: ${storeId}`);
        
        // Guardar QR en la base de datos
        try {
          await prisma.storeSettings.upsert({
            where: { storeId },
            update: { whatsappSessionStatus: 'pending_qr' },
            create: { storeId, whatsappSessionStatus: 'pending_qr' }
          });
        } catch (e) {
          console.error('[WhatsApp] Error guardando estado en BD:', e);
        }
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;

        console.log(`[WhatsApp] Conexión cerrada para ${storeId}. Reconectar: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          setTimeout(() => createSession(storeId), 5000);
        } else {
          activeSessions.delete(storeId);
          pendingQRs.delete(storeId);
          await updateSessionStatus(storeId, 'disconnected');
        }
      }

      if (connection === 'open') {
        console.log(`[WhatsApp] ✅ Conectado para tienda: ${storeId}`);
        pendingQRs.delete(storeId);
        
        const phoneNumber = socket.user?.id?.split(':')[0] || '';
        await updateSessionStatus(storeId, 'connected', phoneNumber);
        
        // Limpiar QR de la BD
        // QR ya no se guarda en BD, solo en memoria (pendingQRs)
      }
    });

    socket.ev.on('creds.update', saveCreds);

    // HANDLER PRINCIPAL DE MENSAJES
    socket.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key.fromMe && msg.message) {
          await handleIncomingMessage(storeId, socket, msg);
        }
      }
    });

    activeSessions.set(storeId, { socket, storeId, createdAt: Date.now() });
    return { status: 'pending_qr', storeId };

  } catch (error) {
    console.error(`[WhatsApp] Error creando sesión para ${storeId}:`, error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// HANDLE INCOMING MESSAGE - LÓGICA COMPLETA
// ---------------------------------------------------------------------------
async function handleIncomingMessage(storeId, socket, msg) {
  try {
    const from = msg.key.remoteJid;
    const messageText = msg.message?.conversation || 
                        msg.message?.extendedTextMessage?.text || 
                        '';
    const body = messageText.trim().toLowerCase();
    const pushName = msg.pushName || '';

    // Ignorar grupos y broadcasts
    if (from.includes('@g.us') || from.includes('@broadcast')) {
      return;
    }

    console.log(`[WhatsApp] [${storeId}] Mensaje de ${from}: ${messageText}`);

    // Obtener configuración de la tienda
    const { store, settings, template, storeUrl } = await getStoreContext(storeId);

    if (!settings || !settings.whatsappBotEnabled) {
      console.log(`[WhatsApp] Bot deshabilitado para ${storeId}`);
      return;
    }

    // RATE LIMITING
    const rateCheck = checkRateLimit(storeId, from);
    if (!rateCheck.allowed) {
      if (rateCheck.reason === 'rate_limit') {
        await socket.sendMessage(from, { 
          text: `⚠️ Estás enviando mensajes muy rápido. Por favor esperá ${Math.ceil(rateCheck.waitSeconds / 60)} minutos.` 
        });
      }
      return;
    }

    // SPAM DETECTION
    if (isSpamMessage(messageText)) {
      console.log(`[WhatsApp] [${storeId}] SPAM detectado de ${from}`);
      return;
    }

    // Obtener sesión del usuario
    const userSession = getUserSession(storeId, from);

    // DETECTAR TIPO DE MENSAJE Y RESPONDER
    
    // 0. DETECTAR PEDIDO ENTRANTE (prioridad máxima)
    const orderPattern = /(?:pedido|orden|order).*(?:es|is|:)\s*#*(\d+)\s*[-–]\s*(\d+)/i;
    const orderMatch = messageText.match(orderPattern);
    if (orderMatch) {
      const orderNum = orderMatch[1];
      const orderCode = orderMatch[2];
      console.log(`[WhatsApp] [${storeId}] 📦 PEDIDO DETECTADO: #${orderNum} - ${orderCode}`);
      
      // Confirmar recepción del pedido
      const confirmMsg = `✅ *PEDIDO RECIBIDO*\n\n📋 Pedido: #${orderNum}\n🔐 Código: ${orderCode}\n\n⏳ Estamos preparando tu pedido.\nTe avisamos cuando esté listo. ¡Gracias!`;
      await socket.sendMessage(from, { text: confirmMsg });
      return;
    }
    
    // 1. SALUDOS -> Mensaje de bienvenida (solo si NO es un pedido)
    if (matchesPattern(body, GREETING_PATTERNS)) {
      const welcomeMsg = applyPlaceholders(
        settings.welcomeMessage || template.welcome,
        { storeName: store?.name, storeUrl }
      );
      await socket.sendMessage(from, { text: welcomeMsg });
      userSession.step = 'welcome';
      return;
    }

    // 2. MENÚ
    if (matchesPattern(body, MENU_PATTERNS)) {
      const menuMsg = `📋 *NUESTRO MENÚ*\n\nMirá toda nuestra carta acá:\n🔗 ${storeUrl}\n\n¡Hacé tu pedido online y te lo enviamos! 🚀`;
      await socket.sendMessage(from, { text: menuMsg });
      return;
    }

    // 3. HORARIOS
    if (matchesPattern(body, HOURS_PATTERNS)) {
      let hoursText = '🕐 *HORARIOS*\n\n';
      if (settings.hours) {
        try {
          const hours = JSON.parse(settings.hours);
          const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
          days.forEach((day, i) => {
            if (hours[day]) {
              hoursText += `${dayNames[i]}: ${hours[day].open} - ${hours[day].close}\n`;
            }
          });
        } catch (e) {
          hoursText += 'Consultá nuestros horarios en la web.';
        }
      } else {
        hoursText += 'Consultá nuestros horarios en la web.';
      }
      hoursText += `\n🔗 ${storeUrl}`;
      await socket.sendMessage(from, { text: hoursText });
      return;
    }

    // 4. DELIVERY
    if (matchesPattern(body, DELIVERY_PATTERNS)) {
      let deliveryMsg = '🚚 *DELIVERY*\n\n';
      if (settings.deliveryEnabled) {
        deliveryMsg += `✅ Hacemos delivery\n`;
        if (settings.baseDeliveryFee) {
          deliveryMsg += `💰 Costo: $${settings.baseDeliveryFee}\n`;
        }
        if (settings.estimatedDeliveryTime) {
          deliveryMsg += `⏱️ Tiempo estimado: ${settings.estimatedDeliveryTime}\n`;
        }
      } else {
        deliveryMsg += '❌ Por el momento no hacemos delivery.';
      }
      if (settings.pickupEnabled) {
        deliveryMsg += '\n\n🏪 También podés retirar en el local.';
      }
      deliveryMsg += `\n\n🔗 Pedí online: ${storeUrl}`;
      await socket.sendMessage(from, { text: deliveryMsg });
      return;
    }

    // 5. UBICACIÓN
    if (matchesPattern(body, LOCATION_PATTERNS)) {
      let locationMsg = '📍 *UBICACIÓN*\n\n';
      if (store?.address) {
        locationMsg += `${store.address}\n`;
      }
      if (settings.contactPhone) {
        locationMsg += `📞 ${settings.contactPhone}\n`;
      }
      locationMsg += `\n🔗 ${storeUrl}`;
      await socket.sendMessage(from, { text: locationMsg });
      return;
    }

    // 6. COMPROBANTE DE PAGO (imagen)
    if (msg.message?.imageMessage && userSession.waitingForTransferProof) {
      await handleTransferProof(storeId, socket, from, msg, userSession, store);
      return;
    }

    // 7. CONFIRMACIÓN DE PEDIDO
    if (userSession.waitingForConfirmation) {
      if (body === 'si' || body === 'sí' || body === 'yes' || body === 'ok') {
        userSession.waitingForConfirmation = false;
        userSession.waitingForPayment = true;
        await socket.sendMessage(from, { 
          text: `✅ ¡Pedido confirmado!\n\n💳 *MÉTODO DE PAGO*\n\n1️⃣ Mercado Pago\n2️⃣ Transferencia\n3️⃣ Efectivo\n\nEscribí el número de tu opción.` 
        });
        return;
      } else if (body === 'no' || body === 'cancelar') {
        userSession.waitingForConfirmation = false;
        userSession.pendingOrder = null;
        await socket.sendMessage(from, { text: '❌ Pedido cancelado.\n\nEscribí "hola" para ver las opciones.' });
        return;
      }
    }

    // 8. SELECCIÓN DE PAGO
    if (userSession.waitingForPayment) {
      await handlePaymentSelection(storeId, socket, from, body, userSession, settings, store);
      return;
    }

    // 9. MENSAJE NO ENTENDIDO -> Enviar bienvenida
    const defaultMsg = applyPlaceholders(
      settings.welcomeMessage || template.welcome,
      { storeName: store?.name, storeUrl }
    );
    await socket.sendMessage(from, { text: defaultMsg });

  } catch (error) {
    console.error(`[WhatsApp] Error manejando mensaje:`, error);
  }
}

// ---------------------------------------------------------------------------
// HANDLE PAYMENT SELECTION
// ---------------------------------------------------------------------------
async function handlePaymentSelection(storeId, socket, from, body, userSession, settings, store) {
  try {
    if (body === '1' || body.includes('mercado')) {
      userSession.paymentMethod = 'mercadopago';
      userSession.waitingForPayment = false;
      userSession.waitingForTransferProof = true;
      
      // TODO: Generar link de MP dinámicamente si está configurado
      const mpMsg = `💳 *MERCADO PAGO*\n\nRealizá el pago y enviá el comprobante acá.\n\n📸 Podés enviar captura o foto del pago.\n\n🔄 Escribí "09" para cambiar método de pago.`;
      await socket.sendMessage(from, { text: mpMsg });
      
    } else if (body === '2' || body.includes('transfer')) {
      userSession.paymentMethod = 'transfer';
      userSession.waitingForPayment = false;
      userSession.waitingForTransferProof = true;
      
      let transferMsg = `💵 *TRANSFERENCIA*\n\n`;
      if (settings.transferAlias) {
        transferMsg += `🏦 Alias: ${settings.transferAlias}\n`;
      }
      if (settings.transferCvu) {
        transferMsg += `💳 CVU: ${settings.transferCvu}\n`;
      }
      if (settings.transferTitular) {
        transferMsg += `👤 Titular: ${settings.transferTitular}\n`;
      }
      transferMsg += `\n📸 Enviá el comprobante de pago acá.\n\n🔄 Escribí "09" para cambiar método.`;
      await socket.sendMessage(from, { text: transferMsg });
      
    } else if (body === '3' || body.includes('efectivo') || body.includes('cash')) {
      userSession.paymentMethod = 'cash';
      userSession.waitingForPayment = false;
      userSession.waitingForTransferProof = false;
      
      await socket.sendMessage(from, { 
        text: `💵 *EFECTIVO*\n\n✅ Perfecto, pagás al recibir el pedido.\n\n🍳 Tu pedido está en preparación.\n\n📱 Te avisamos cuando esté listo.` 
      });
      userSession.step = 'welcome';
      
    } else if (body === '09') {
      userSession.paymentMethod = null;
      userSession.waitingForTransferProof = false;
      userSession.waitingForPayment = true;
      
      await socket.sendMessage(from, { 
        text: `🔄 *CAMBIAR MÉTODO*\n\n1️⃣ Mercado Pago\n2️⃣ Transferencia\n3️⃣ Efectivo\n\nEscribí el número.` 
      });
      
    } else {
      await socket.sendMessage(from, { 
        text: `🤔 No entendí.\n\nElegí tu método de pago:\n\n1️⃣ Mercado Pago\n2️⃣ Transferencia\n3️⃣ Efectivo` 
      });
    }
  } catch (error) {
    console.error('[WhatsApp] Error en selección de pago:', error);
  }
}

// ---------------------------------------------------------------------------
// HANDLE TRANSFER PROOF
// ---------------------------------------------------------------------------
async function handleTransferProof(storeId, socket, from, msg, userSession, store) {
  try {
    console.log(`[WhatsApp] [${storeId}] Comprobante recibido de ${from}`);
    
    userSession.waitingForTransferProof = false;
    userSession.step = 'welcome';
    
    await socket.sendMessage(from, { 
      text: `✅ *COMPROBANTE RECIBIDO*\n\n🔄 Estamos verificando el pago.\n\n⏳ Tu pedido está en espera de aprobación.\n\n📱 Te notificaremos cuando esté confirmado.\n\n¡Gracias! ❤️` 
    });
    
    // Notificar al admin
    const settings = await prisma.storeSettings.findUnique({ where: { storeId } });
    if (settings?.whatsappBotNumber) {
      await socket.sendMessage(`${settings.whatsappBotNumber}@s.whatsapp.net`, {
        text: `📸 *NUEVO COMPROBANTE*\n\nCliente: ${from}\nLocal: ${store?.name || storeId}\n\n⚠️ Verificar pago en el panel de admin.`
      });
    }
    
  } catch (error) {
    console.error('[WhatsApp] Error procesando comprobante:', error);
  }
}

// ---------------------------------------------------------------------------
// UPDATE SESSION STATUS
// ---------------------------------------------------------------------------
async function updateSessionStatus(storeId, status, phoneNumber = null) {
  try {
    await prisma.storeSettings.upsert({
      where: { storeId },
      update: {
        whatsappSessionStatus: status,
        whatsappConnectedNumber: phoneNumber,
        whatsappLastConnected: status === 'connected' ? new Date() : undefined
      },
      create: {
        storeId,
        whatsappSessionStatus: status,
        whatsappConnectedNumber: phoneNumber,
        whatsappLastConnected: status === 'connected' ? new Date() : undefined
      }
    });
  } catch (error) {
    console.error(`[WhatsApp] Error actualizando estado:`, error);
  }
}

// ---------------------------------------------------------------------------
// GET PENDING QR
// ---------------------------------------------------------------------------
export function getPendingQR(storeId) {
  const qrData = pendingQRs.get(storeId);
  if (!qrData) return null;
  
  if (Date.now() > qrData.expires) {
    pendingQRs.delete(storeId);
    return null;
  }
  
  return qrData.qr;
}

// ---------------------------------------------------------------------------
// GET SESSION STATUS
// ---------------------------------------------------------------------------
export function getSessionStatus(storeId) {
  const session = activeSessions.get(storeId);
  
  if (!session) {
    return { status: 'disconnected' };
  }

  if (session.socket?.user) {
    return {
      status: 'connected',
      phoneNumber: session.socket.user.id?.split(':')[0] || 'Desconocido',
      name: session.socket.user.name || ''
    };
  }

  if (pendingQRs.has(storeId)) {
    return { status: 'pending_qr' };
  }

  return { status: 'connecting' };
}

// ---------------------------------------------------------------------------
// DISCONNECT SESSION
// ---------------------------------------------------------------------------
export async function disconnectSession(storeId) {
  const session = activeSessions.get(storeId);
  
  if (session?.socket) {
    await session.socket.logout();
    session.socket.end();
  }
  
  activeSessions.delete(storeId);
  pendingQRs.delete(storeId);
  
  const sessionPath = path.join(SESSIONS_DIR, storeId);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
  
  await updateSessionStatus(storeId, 'disconnected');
  
  return { success: true };
}

// ---------------------------------------------------------------------------
// SEND MESSAGE
// ---------------------------------------------------------------------------
export async function sendMessage(storeId, to, message) {
  const session = activeSessions.get(storeId);
  
  if (!session?.socket?.user) {
    throw new Error('Sesión de WhatsApp no conectada');
  }

  let phoneNumber = to.replace(/\D/g, '');
  if (!phoneNumber.includes('@')) {
    phoneNumber = `${phoneNumber}@s.whatsapp.net`;
  }

  await session.socket.sendMessage(phoneNumber, { text: message });
  
  return { success: true };
}

// ---------------------------------------------------------------------------
// SEND ORDER NOTIFICATION (al admin/local)
// ---------------------------------------------------------------------------
export async function sendOrderNotification(storeId, order) {
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    if (!settings?.whatsappBotEnabled || !settings?.whatsappBotNumber) {
      console.log(`[WhatsApp] Bot deshabilitado o sin número para ${storeId}`);
      return;
    }

    const session = activeSessions.get(storeId);
    if (!session?.socket?.user) {
      console.log(`[WhatsApp] No hay sesión activa para ${storeId}`);
      return;
    }

    const { store } = await getStoreContext(storeId);
    const storeName = store?.name || settings.commercialName || 'Negocios App';
    const confirmationCode = order.deliveryCode || order.uniqueCode || order.orderNumber || (order.id ? order.id.slice(-6) : '0000');
    const orderNumberLine = order.orderNumber || confirmationCode;

    const message = `🔔 *NUEVO PEDIDO*

📋 Pedido: #${orderNumberLine}
🏪 Local: ${storeName}
🔐 Código: ${confirmationCode}

💰 Total: $${order.total || 0}
📍 ${order.customerAddress || 'Retiro en local'}

⚡ Revisá el panel de admin para más detalles.`;

    await sendMessage(storeId, settings.whatsappBotNumber, message);
    console.log(`[WhatsApp] ✅ Notificación de pedido enviada para ${storeId}`);

  } catch (error) {
    console.error(`[WhatsApp] Error enviando notificación:`, error);
  }
}

// ---------------------------------------------------------------------------
// SEND ORDER CONFIRMATION (al cliente)
// ---------------------------------------------------------------------------
export async function sendOrderConfirmation(storeId, order, customerPhone) {
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    if (!settings?.whatsappBotEnabled) {
      return;
    }

    const session = activeSessions.get(storeId);
    if (!session?.socket?.user) {
      return;
    }

    const { store, template, storeUrl } = await getStoreContext(storeId);
    const trackingUrl = order.trackingToken ? `${STORE_FRONT_URL}/track/${order.trackingToken}` : '';
    const message = applyPlaceholders(
      settings.orderConfirmMessage || template.orderConfirm,
      {
        storeName: store?.name,
        storeUrl,
        orderNumber: order.orderNumber || order.id.slice(-6),
        deliveryCode: order.deliveryCode || order.uniqueCode || '',
        trackingUrl
      }
    );

    await sendMessage(storeId, customerPhone, message);

  } catch (error) {
    console.error(`[WhatsApp] Error enviando confirmación:`, error);
  }
}

// ---------------------------------------------------------------------------
// SEND ORDER ON WAY (al cliente)
// ---------------------------------------------------------------------------
export async function sendOrderOnWay(storeId, order, customerPhone) {
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    if (!settings?.whatsappBotEnabled) {
      return;
    }

    const session = activeSessions.get(storeId);
    if (!session?.socket?.user) {
      return;
    }

    const { store, template, storeUrl } = await getStoreContext(storeId);
    const trackingUrl = order.trackingToken ? `${STORE_FRONT_URL}/track/${order.trackingToken}` : '';
    const message = applyPlaceholders(
      settings.orderOnWayMessage || template.orderOnWay,
      {
        storeName: store?.name,
        storeUrl,
        orderNumber: order.orderNumber || order.id.slice(-6),
        deliveryCode: order.deliveryCode || order.uniqueCode || '',
        trackingUrl
      }
    );

    await sendMessage(storeId, customerPhone, message);

  } catch (error) {
    console.error(`[WhatsApp] Error enviando notificación en camino:`, error);
  }
}

// ---------------------------------------------------------------------------
// INITIALIZE ALL SESSIONS
// ---------------------------------------------------------------------------
export async function initializeAllSessions() {
  try {
    const stores = await prisma.storeSettings.findMany({
      where: {
        whatsappBotEnabled: true,
        whatsappSessionStatus: 'connected'
      },
      select: { storeId: true }
    });

    console.log(`[WhatsApp] Inicializando ${stores.length} sesiones guardadas...`);

    for (const store of stores) {
      const sessionPath = path.join(SESSIONS_DIR, store.storeId);
      if (fs.existsSync(sessionPath)) {
        await createSession(store.storeId);
      }
    }

  } catch (error) {
    console.error('[WhatsApp] Error inicializando sesiones:', error);
  }
}

export default {
  getOrCreateSession,
  getPendingQR,
  getSessionStatus,
  disconnectSession,
  sendMessage,
  sendOrderNotification,
  sendOrderConfirmation,
  sendOrderOnWay,
  initializeAllSessions
};
