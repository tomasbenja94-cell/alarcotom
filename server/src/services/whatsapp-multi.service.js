/**
 * SERVICIO DE WHATSAPP MULTI-TIENDA
 * Versión simplificada basada en el bot original de rotisería
 * Soporta múltiples sesiones de WhatsApp (una por tienda)
 */

import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const STORE_FRONT_URL = process.env.STORE_FRONT_URL || 'https://elbuenmenu.site';
const API_URL = process.env.API_URL || 'https://api.elbuenmenu.site/api';

// ---------------------------------------------------------------------------
// DIRECTORIO DE SESIONES
// ---------------------------------------------------------------------------
const SESSIONS_DIR = path.join(__dirname, '../../whatsapp-sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// ALMACÉN GLOBAL POR TIENDA
// ---------------------------------------------------------------------------
const activeSessions = new Map();      // storeId -> { socket, storeId, createdAt }
const pendingQRs = new Map();          // storeId -> { qr, timestamp, expires }
const userSessionsPerStore = new Map(); // storeId -> Map(userId -> session)
const storeConfigs = new Map();        // storeId -> { store, settings }
const connectionStates = new Map();    // storeId -> lastConnectionState (para evitar procesamiento duplicado)

// Sistema de logs del bot
const botLogs = new Map(); // storeId -> Array<{timestamp, level, message, meta}>
const MAX_LOGS_PER_STORE = 500; // Mantener solo los últimos 500 logs por tienda

function addBotLog(storeId, level, message, meta = {}) {
  if (!botLogs.has(storeId)) {
    botLogs.set(storeId, []);
  }
  const logs = botLogs.get(storeId);
  logs.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    meta
  });
  
  // Mantener solo los últimos MAX_LOGS_PER_STORE logs
  if (logs.length > MAX_LOGS_PER_STORE) {
    logs.shift();
  }
  
  // También loggear en consola
  const logMessage = `[WhatsApp] [${storeId}] ${message}`;
  if (level === 'error') {
    console.error(logMessage, meta);
  } else if (level === 'warn') {
    console.warn(logMessage, meta);
  } else {
    console.log(logMessage, meta);
  }
}

export function getBotLogs(storeId, limit = 50) {
  const logs = botLogs.get(storeId) || [];
  return logs.slice(-limit); // Devolver los últimos N logs
}

// Logger silencioso para Baileys
const logger = pino({ level: 'silent' });

// ---------------------------------------------------------------------------
// CARGAR CONFIGURACIÓN DE TIENDA
// ---------------------------------------------------------------------------
async function loadStoreConfig(storeId) {
  try {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    const settings = await prisma.storeSettings.findUnique({ where: { storeId } });
    
    if (!store) {
      console.log(`[WhatsApp] [${storeId}] Store no encontrado`);
      return null;
    }
    
    const config = { store, settings };
    storeConfigs.set(storeId, config);
    console.log(`[WhatsApp] [${storeId}] Config cargada: ${store.name}`);
    return config;
  } catch (error) {
    console.error(`[WhatsApp] [${storeId}] Error cargando config:`, error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// OBTENER SESIÓN DE USUARIO
// ---------------------------------------------------------------------------
function getUserSession(storeId, jid) {
  if (!userSessionsPerStore.has(storeId)) {
    userSessionsPerStore.set(storeId, new Map());
  }
  const storeUsers = userSessionsPerStore.get(storeId);
  
  if (!storeUsers.has(jid)) {
    storeUsers.set(jid, {
      step: 'welcome',
      pendingOrder: null,
      waitingForPayment: false,
      waitingForTransferProof: false,
      waitingForConfirmation: false,
      waitingForAddress: false,
      paymentMethod: null,
      deliveryAddress: null,
      currentOrder: null,
      lastActivity: Date.now()
    });
  }
  
  const session = storeUsers.get(jid);
  session.lastActivity = Date.now();
  return session;
}

// ---------------------------------------------------------------------------
// Límite de sesiones simultáneas (hasta 10)
const MAX_SESSIONS = 10;

// INICIAR SESIÓN DE WHATSAPP PARA UNA TIENDA
// ---------------------------------------------------------------------------
export async function startWhatsAppSession(storeId) {
  // Verificar límite de sesiones
  if (activeSessions.size >= MAX_SESSIONS && !activeSessions.has(storeId)) {
    console.log(`[WhatsApp] [${storeId}] Límite de sesiones alcanzado (${MAX_SESSIONS})`);
    return { status: 'error', message: `Límite de ${MAX_SESSIONS} sesiones simultáneas alcanzado` };
  }
  
  if (activeSessions.has(storeId)) {
    const session = activeSessions.get(storeId);
    // Verificar que la sesión esté realmente activa
    if (session.socket && session.socket.user) {
      console.log(`[WhatsApp] [${storeId}] Sesión ya activa`);
      return { status: 'already_connected' };
    } else {
      // Sesión inactiva, limpiarla
      activeSessions.delete(storeId);
    }
  }

  const config = await loadStoreConfig(storeId);
  if (!config) {
    return { status: 'error', message: 'Store no encontrado' };
  }

  const sessionPath = path.join(SESSIONS_DIR, storeId);
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ['Negocios App', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      emitOwnEvents: false,
      markOnlineOnConnect: true
    });

    // Manejar actualizaciones de conexión
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        addBotLog(storeId, 'info', 'QR generado');
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { 
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 512
          });
          pendingQRs.set(storeId, {
            qr: qrDataUrl,
            timestamp: Date.now(),
            expires: Date.now() + 300000 // 5 minutos en lugar de 1 minuto
          });
          
          // Actualizar estado en BD
          await prisma.storeSettings.upsert({
            where: { storeId },
            update: { whatsappSessionStatus: 'pending_qr' },
            create: { storeId, whatsappSessionStatus: 'pending_qr' }
          });
        } catch (error) {
          console.error(`[WhatsApp] [${storeId}] Error generando QR:`, error);
        }
      }

      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        addBotLog(storeId, 'warn', `Conexión cerrada, razón: ${reason}`, { reason });
        
        // Limpiar estado de conexión
        connectionStates.delete(storeId);
        
        // Limpiar sesión
        const session = activeSessions.get(storeId);
        if (session?.socket) {
          try {
            session.socket.end();
          } catch (e) {
            // Ignorar errores al cerrar
          }
        }
        activeSessions.delete(storeId);
        // No eliminar QR inmediatamente, puede regenerarse
        
        await prisma.storeSettings.upsert({
          where: { storeId },
          update: { whatsappSessionStatus: 'disconnected' },
          create: { storeId, whatsappSessionStatus: 'disconnected' }
        }).catch(() => {
          // Ignorar errores de BD
        });

        // Reconectar si no fue logout manual y no es error 401 (no autorizado)
        if (reason !== DisconnectReason.loggedOut && reason !== 401) {
          console.log(`[WhatsApp] [${storeId}] Reconectando en 5s...`);
          setTimeout(() => {
            // Verificar que no haya otra sesión activa antes de reconectar
            if (!activeSessions.has(storeId)) {
              startWhatsAppSession(storeId).catch(err => {
                console.error(`[WhatsApp] [${storeId}] Error en reconexión:`, err.message);
              });
            }
          }, 5000);
        } else if (reason === 401) {
          // Error 401: sesión inválida, limpiar credenciales
          addBotLog(storeId, 'error', 'Sesión inválida (401), limpiando credenciales...');
          const sessionPath = path.join(SESSIONS_DIR, storeId);
          if (fs.existsSync(sessionPath)) {
            try {
              fs.rmSync(sessionPath, { recursive: true, force: true });
              addBotLog(storeId, 'info', 'Credenciales eliminadas');
            } catch (e) {
              addBotLog(storeId, 'error', `Error eliminando credenciales: ${e.message}`);
            }
          }
        }
      }

      if (connection === 'open') {
        // Evitar procesar múltiples veces el mismo evento
        const lastState = connectionStates.get(storeId);
        if (lastState === 'open') {
          addBotLog(storeId, 'warn', "Evento 'open' ya procesado, ignorando duplicado");
          return;
        }
        
        addBotLog(storeId, 'info', '✅ Conectado exitosamente');
        connectionStates.set(storeId, 'open');
        pendingQRs.delete(storeId);
        
        const phoneNumber = socket.user?.id?.split(':')[0] || socket.user?.id?.split('@')[0];
        
        await prisma.storeSettings.upsert({
          where: { storeId },
          update: { 
            whatsappSessionStatus: 'connected',
            whatsappConnectedNumber: phoneNumber,
            whatsappLastConnected: new Date()
          },
          create: { 
            storeId, 
            whatsappSessionStatus: 'connected',
            whatsappConnectedNumber: phoneNumber,
            whatsappLastConnected: new Date()
          }
        });
        
        addBotLog(storeId, 'info', `Número conectado: ${phoneNumber}`);
      }
    });

    // Manejar mensajes entrantes
    const processedMessages = new Set(); // Para evitar procesar mensajes duplicados
    socket.ev.on('messages.upsert', async (m) => {
      try {
        const message = m.messages[0];
        if (!message || !message.key || !message.message) return;
        if (message.key.fromMe) return;
        if (message.key.remoteJid?.includes('@g.us')) return; // Ignorar grupos

        // Crear un ID único para el mensaje
        const messageId = `${message.key.remoteJid}_${message.key.id}_${message.messageTimestamp || Date.now()}`;
        
        // Evitar procesar el mismo mensaje múltiples veces
        if (processedMessages.has(messageId)) {
          console.log(`[WhatsApp] [${storeId}] ⚠️ Mensaje duplicado ignorado: ${messageId}`);
          return;
        }
        
        // Solo procesar mensajes recientes (últimos 5 minutos) para evitar procesar mensajes antiguos al reconectar
        const messageAge = Date.now() - (message.messageTimestamp * 1000 || Date.now());
        if (messageAge > 5 * 60 * 1000) {
          console.log(`[WhatsApp] [${storeId}] ⚠️ Mensaje antiguo ignorado (${Math.round(messageAge / 1000)}s de antigüedad)`);
          return;
        }
        
        processedMessages.add(messageId);
        
        // Limpiar mensajes procesados antiguos (mantener solo los últimos 1000)
        if (processedMessages.size > 1000) {
          const firstEntry = processedMessages.values().next().value;
          processedMessages.delete(firstEntry);
        }

        const from = message.key.remoteJid;
        addBotLog(storeId, 'info', `Mensaje recibido de ${from}`, { 
          messageId: message.key.id,
          messageType: Object.keys(message.message || {})[0] 
        });
        await handleMessage(storeId, socket, from, message, config);
      } catch (error) {
        console.error(`[WhatsApp] [${storeId}] Error procesando mensaje:`, error.message);
      }
    });

    // Guardar credenciales
    socket.ev.on('creds.update', saveCreds);

    // Manejar errores no capturados
    socket.ev.on('error', (error) => {
      console.error(`[WhatsApp] [${storeId}] Error en socket:`, error);
    });

    activeSessions.set(storeId, { socket, storeId, createdAt: Date.now() });
    
    console.log(`[WhatsApp] [${storeId}] Sesión iniciada. Total activas: ${activeSessions.size}/${MAX_SESSIONS}`);
    
    return { status: 'connecting' };

  } catch (error) {
    console.error(`[WhatsApp] [${storeId}] Error iniciando sesión:`, error);
    // Limpiar en caso de error
    activeSessions.delete(storeId);
    pendingQRs.delete(storeId);
    return { status: 'error', message: error.message };
  }
}

// ---------------------------------------------------------------------------
// MANEJAR MENSAJE ENTRANTE
// ---------------------------------------------------------------------------
async function handleMessage(storeId, socket, from, msg, config) {
  const { store, settings } = config;
  const storeName = store?.name || 'Nuestro local';
  const storeUrl = `${STORE_FRONT_URL}/menu?store=${store?.slug || storeId}`;
  
  // Extraer texto del mensaje
  const body = msg.message?.conversation || 
               msg.message?.extendedTextMessage?.text || 
               msg.message?.imageMessage?.caption || '';
  const messageText = body.trim();
  const lowerText = messageText.toLowerCase();
  
  const userSession = getUserSession(storeId, from);
  
  console.log(`[WhatsApp] [${storeId}] 📩 De: ${from.split('@')[0]} | Texto: "${messageText.substring(0, 50)}"`);

  // =========================================================================
  // DETECTAR PEDIDO ENTRANTE (desde checkout web) - PRIORIDAD MÁXIMA
  // =========================================================================
  const orderMatch = messageText.match(/pedido.*(?:es|:)\s*#*(\d+)\s*[-–]\s*(\d+)/i);
  if (orderMatch) {
    const orderNum = orderMatch[1];
    const orderCode = orderMatch[2];
    console.log(`[WhatsApp] [${storeId}] 📦 PEDIDO DETECTADO: #${orderNum} - ${orderCode}`);
    
    // Buscar el pedido en la base de datos
    try {
      const order = await prisma.order.findFirst({
        where: {
          storeId: storeId,
          OR: [
            { orderNumber: orderNum },
            { uniqueCode: orderCode }
          ]
        },
        include: { items: true }
      });

      if (order) {
        userSession.currentOrder = {
          id: order.id,
          orderNumber: order.orderNumber,
          uniqueCode: order.uniqueCode || orderCode,
          total: order.total,
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          items: order.items,
          customerName: order.customerName,
          customerAddress: order.customerAddress
        };
        
        // Mostrar resumen del pedido
        let itemsList = order.items.map(item => 
          `• ${item.quantity}x ${item.productName} - $${item.subtotal.toLocaleString('es-AR')}`
        ).join('\n');

        const orderSummary = `✅ *PEDIDO #${order.orderNumber}*

📋 *Detalle:*
${itemsList}

${order.deliveryFee > 0 ? `🚚 Envío: $${order.deliveryFee.toLocaleString('es-AR')}` : '🏪 Retiro en local'}
💰 *Total: $${order.total.toLocaleString('es-AR')}*

🔐 Código: ${orderCode}`;

        await socket.sendMessage(from, { text: orderSummary });
        
        // Mostrar opciones de pago
        userSession.waitingForPayment = true;
        userSession.step = 'checkout_payment';
        await showPaymentOptions(storeId, socket, from, userSession, settings);
      } else {
        await socket.sendMessage(from, { 
          text: `✅ *PEDIDO RECIBIDO*\n\n📋 Pedido: #${orderNum}\n🔐 Código: ${orderCode}\n\n⏳ Estamos procesando tu pedido.\n\n¡Gracias por elegirnos! ❤️` 
        });
      }
    } catch (err) {
      console.error(`[WhatsApp] [${storeId}] Error buscando pedido:`, err);
      await socket.sendMessage(from, { 
        text: `✅ *PEDIDO RECIBIDO*\n\n📋 Pedido: #${orderNum}\n🔐 Código: ${orderCode}\n\n⏳ Estamos procesando tu pedido.\n\n¡Gracias por elegirnos! ❤️` 
      });
    }
    return;
  }

  // =========================================================================
  // SI ESTÁ EN FLUJO DE PAGO
  // =========================================================================
  if (userSession.waitingForPayment) {
    await handlePaymentSelection(storeId, socket, from, lowerText, userSession, settings);
    return;
  }

  if (userSession.waitingForTransferProof) {
    if (msg.message?.imageMessage) {
      await handleTransferProof(storeId, socket, from, msg, userSession, settings);
    } else if (lowerText === '09') {
      userSession.waitingForTransferProof = false;
      userSession.waitingForPayment = true;
      await showPaymentOptions(storeId, socket, from, userSession, settings);
    } else {
      await socket.sendMessage(from, { 
        text: `📸 Por favor, enviá una FOTO del comprobante de pago.\n\n🔄 Escribí "09" si querés cambiar el método de pago.` 
      });
    }
    return;
  }

  // =========================================================================
  // SALUDOS -> Menú principal
  // =========================================================================
  const greetings = ['hola', 'hi', 'hello', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'buen dia', 'que tal', 'hey'];
  if (greetings.some(g => lowerText === g || lowerText.startsWith(g + ' ') || lowerText.startsWith(g + '!'))) {
    await showMainMenu(storeId, socket, from, storeName, storeUrl);
    return;
  }

  // =========================================================================
  // VER MENÚ (1 o "menu")
  // =========================================================================
  if (lowerText === '1' || lowerText === 'menu' || lowerText === 'menú' || lowerText === 'carta' || lowerText === 'pedir') {
    await socket.sendMessage(from, { 
      text: `📋 *NUESTRO MENÚ*\n\nMirá toda nuestra carta acá:\n🔗 ${storeUrl}\n\n¡Elegí tus productos favoritos y hacé tu pedido! 🛒` 
    });
    return;
  }

  // =========================================================================
  // CONSULTAR PEDIDO (2)
  // =========================================================================
  if (lowerText === '2' || lowerText === 'consultar' || lowerText === 'mi pedido' || lowerText === 'estado') {
    await socket.sendMessage(from, { 
      text: `🔍 *CONSULTAR PEDIDO*\n\nPara consultar el estado de tu pedido, necesito el código de 4 dígitos que te dimos.\n\n📝 Escribí el código (ej: 1234)` 
    });
    userSession.step = 'waiting_order_code';
    return;
  }

  // =========================================================================
  // MI LINK DE INVITACIÓN (3)
  // =========================================================================
  if (lowerText === '3' || lowerText === 'invitacion' || lowerText === 'link') {
    // Generar código de referido único para este usuario
    const phone = from.split('@')[0];
    try {
      const response = await fetch(`${API_URL}/referrals/${storeId}/my-code?phone=${phone}`);
      if (response.ok) {
        const data = await response.json();
        await socket.sendMessage(from, { 
          text: `🔗 *TU LINK DE INVITACIÓN*\n\n📱 Tu código: *${data.code}*\n\n🎁 Compartí este link con tus amigos y ganá puntos cuando hagan su primer pedido:\n\n${data.link}\n\n¡Gracias por recomendarnos! ❤️` 
        });
      } else {
        await socket.sendMessage(from, { 
          text: `🔗 *TU LINK DE INVITACIÓN*\n\nCompartí este link con tus amigos:\n${storeUrl}\n\n¡Gracias por recomendarnos! ❤️` 
        });
      }
    } catch (error) {
      console.error(`[WhatsApp] [${storeId}] Error generando link de referido:`, error);
      await socket.sendMessage(from, { 
        text: `🔗 *TU LINK DE INVITACIÓN*\n\nCompartí este link con tus amigos:\n${storeUrl}\n\n¡Gracias por recomendarnos! ❤️` 
      });
    }
    return;
  }

  // =========================================================================
  // HORARIOS (8)
  // =========================================================================
  if (lowerText === '8' || lowerText === 'horarios' || lowerText === 'horario') {
    let hoursText = `🕐 *HORARIOS DE ${storeName.toUpperCase()}*\n\n`;
    
    if (settings?.hours) {
      try {
        const hours = typeof settings.hours === 'string' ? JSON.parse(settings.hours) : settings.hours;
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        
        days.forEach((day, i) => {
          if (hours[day]?.enabled !== false && hours[day]?.open && hours[day]?.close) {
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

  // =========================================================================
  // CÓDIGO DE PEDIDO (si está esperando)
  // =========================================================================
  if (userSession.step === 'waiting_order_code' && /^\d{4}$/.test(lowerText)) {
    try {
      const order = await prisma.order.findFirst({
        where: {
          storeId: storeId,
          OR: [
            { uniqueCode: lowerText },
            { deliveryCode: lowerText }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });

      if (order) {
        const statusMap = {
          'pending': '⏳ Pendiente',
          'confirmed': '✅ Confirmado',
          'preparing': '👨‍🍳 En preparación',
          'ready': '📦 Listo',
          'in_transit': '🚚 En camino',
          'delivered': '✅ Entregado',
          'cancelled': '❌ Cancelado'
        };
        
        await socket.sendMessage(from, { 
          text: `📋 *PEDIDO #${order.orderNumber}*\n\n📍 Estado: ${statusMap[order.status] || order.status}\n💰 Total: $${order.total?.toLocaleString('es-AR')}\n📅 Fecha: ${new Date(order.createdAt).toLocaleDateString('es-AR')}` 
        });
      } else {
        await socket.sendMessage(from, { 
          text: `❌ No encontramos ningún pedido con ese código.\n\nVerificá el código e intentá de nuevo.` 
        });
      }
    } catch (error) {
      console.error(`[WhatsApp] [${storeId}] Error buscando pedido:`, error);
      await socket.sendMessage(from, { text: `❌ Error al buscar el pedido. Intentá de nuevo.` });
    }
    userSession.step = 'welcome';
    return;
  }

  // =========================================================================
  // MENSAJE NO RECONOCIDO -> Mostrar menú
  // =========================================================================
  await showMainMenu(storeId, socket, from, storeName, storeUrl);
}

// ---------------------------------------------------------------------------
// MOSTRAR MENÚ PRINCIPAL
// ---------------------------------------------------------------------------
async function showMainMenu(storeId, socket, from, storeName, storeUrl) {
  const menuMsg = `¡Bienvenido a ${storeName}!

📌 ¿Qué necesitás hacer?

1️⃣ Hacer pedido / Ver menú 📋
2️⃣ Consultar un Pedido 🔍
3️⃣ Mi Link de Invitación 🔗
8️⃣ Ver Horarios 🕒

💡 Podés responder con el número o la palabra clave.

🔗 Carta: ${storeUrl}`;

  await socket.sendMessage(from, { text: menuMsg });
}

// ---------------------------------------------------------------------------
// MOSTRAR OPCIONES DE PAGO
// ---------------------------------------------------------------------------
async function showPaymentOptions(storeId, socket, from, userSession, settings) {
  let options = [];
  
  if (settings?.mercadoPagoEnabled && settings?.mercadoPagoLink) {
    options.push('1️⃣ Mercado Pago');
  }
  if (settings?.transferEnabled !== false) {
    options.push('2️⃣ Transferencia');
  }
  if (settings?.cashEnabled !== false) {
    options.push('3️⃣ Efectivo');
  }
  options.push('4️⃣ Cancelar');
  
  await socket.sendMessage(from, { 
    text: `💳 *MÉTODO DE PAGO*

Elegí cómo querés pagar:

${options.join('\n')}

Escribí el número de tu opción.` 
  });
}

// ---------------------------------------------------------------------------
// MANEJAR SELECCIÓN DE PAGO
// ---------------------------------------------------------------------------
async function handlePaymentSelection(storeId, socket, from, body, userSession, settings) {
  // Cancelar (4)
  if (body === '4' || body.includes('cancelar')) {
    userSession.waitingForPayment = false;
    userSession.currentOrder = null;
    userSession.step = 'welcome';
    await socket.sendMessage(from, { text: `❌ Pago cancelado.\n\nEscribí "hola" para ver opciones.` });
    return;
  }
  
  // Mercado Pago (1)
  if (body === '1' || body.includes('mercado')) {
    userSession.paymentMethod = 'mercadopago';
    userSession.waitingForPayment = false;
    userSession.waitingForTransferProof = true;
    
    const mpLink = settings?.mercadoPagoLink || 'Contactanos para el link de pago';
    
    await socket.sendMessage(from, { 
      text: `💳 *MERCADO PAGO*

🔗 Link de pago:
${mpLink}

📸 Una vez que pagues, enviá una captura del comprobante acá.

🔄 Escribí "09" si querés cambiar el método de pago.` 
    });
    return;
  }
  
  // Transferencia (2)
  if (body === '2' || body.includes('transferencia') || body.includes('transfer')) {
    userSession.paymentMethod = 'transferencia';
    userSession.waitingForPayment = false;
    userSession.waitingForTransferProof = true;
    
    const alias = settings?.transferAlias || 'No configurado';
    const cvu = settings?.transferCvu || '';
    const titular = settings?.transferTitular || '';
    
    let transferInfo = `🏦 *TRANSFERENCIA BANCARIA*\n\n`;
    transferInfo += `📝 Alias: *${alias}*\n`;
    if (cvu) transferInfo += `💳 CVU: ${cvu}\n`;
    if (titular) transferInfo += `👤 Titular: ${titular}\n`;
    if (userSession.currentOrder?.total) {
      transferInfo += `\n💰 *Total a transferir: $${userSession.currentOrder.total.toLocaleString('es-AR')}*\n`;
    }
    transferInfo += `\n📸 Una vez que transfieras, enviá una foto del comprobante acá.\n\n🔄 Escribí "09" si querés cambiar el método de pago.`;
    
    await socket.sendMessage(from, { text: transferInfo });
    return;
  }
  
  // Efectivo (3)
  if (body === '3' || body.includes('efectivo') || body.includes('cash')) {
    userSession.paymentMethod = 'efectivo';
    userSession.waitingForPayment = false;
    userSession.step = 'welcome';
    
    // Actualizar pedido en BD
    if (userSession.currentOrder?.id) {
      try {
        await prisma.order.update({
          where: { id: userSession.currentOrder.id },
          data: { 
            paymentMethod: 'efectivo',
            paymentStatus: 'pending',
            status: 'confirmed'
          }
        });
      } catch (error) {
        console.error(`[WhatsApp] [${storeId}] Error actualizando pedido:`, error);
      }
    }
    
    const isPickup = userSession.currentOrder?.deliveryFee === 0;
    
    await socket.sendMessage(from, { 
      text: `💵 *PAGO EN EFECTIVO*

✅ Tu pedido está confirmado.

${isPickup ? '🏪 Pagás al retirar en el local.' : '🚚 Pagás al recibir tu pedido.'}

${userSession.currentOrder?.total ? `💰 Total a pagar: $${userSession.currentOrder.total.toLocaleString('es-AR')}` : ''}

⏱️ Tiempo estimado: 30-45 minutos

📱 Te avisamos cuando esté ${isPickup ? 'listo para retirar' : 'en camino'}.

¡Gracias por tu pedido! ❤️` 
    });
    
    userSession.currentOrder = null;
    return;
  }
  
  // Opción no válida
  await socket.sendMessage(from, { 
    text: `❓ No entendí tu respuesta.\n\nEscribí el número de la opción:\n1️⃣ Mercado Pago\n2️⃣ Transferencia\n3️⃣ Efectivo\n4️⃣ Cancelar` 
  });
}

// ---------------------------------------------------------------------------
// MANEJAR COMPROBANTE DE TRANSFERENCIA
// ---------------------------------------------------------------------------
async function handleTransferProof(storeId, socket, from, message, userSession, settings) {
  console.log(`[WhatsApp] [${storeId}] 📸 Comprobante recibido de ${from.split('@')[0]}`);
  
  let proofImageUrl = null;
  
  // Descargar y guardar imagen
  try {
    const session = activeSessions.get(storeId);
    if (session?.socket && message.message?.imageMessage) {
      const stream = await downloadMediaMessage(
        message,
        'buffer',
        {},
        { logger }
      );
      
      if (stream) {
        // Guardar en la carpeta correcta del whatsapp-bot
        const proofDir = path.join(__dirname, '../../../whatsapp-bot/proofs');
        if (!fs.existsSync(proofDir)) {
          fs.mkdirSync(proofDir, { recursive: true });
        }
        
        const fileName = `proof_${Date.now()}_${message.key.id}.jpg`;
        const filePath = path.join(proofDir, fileName);
        fs.writeFileSync(filePath, stream);
        proofImageUrl = `/api/proofs/${fileName}`;
        console.log(`[WhatsApp] [${storeId}] 📂 Ruta de guardado: ${filePath}`);
        console.log(`[WhatsApp] [${storeId}] ✅ Comprobante guardado: ${proofImageUrl}`);
      }
    }
  } catch (error) {
    console.error(`[WhatsApp] [${storeId}] Error guardando comprobante:`, error.message);
  }
  
  // Actualizar pedido en BD
  if (userSession.currentOrder?.id) {
    try {
      await prisma.order.update({
        where: { id: userSession.currentOrder.id },
        data: { 
          paymentMethod: userSession.paymentMethod || 'transferencia',
          paymentStatus: 'pending',
          customerPhone: from
        }
      });
      
      // Crear registro de transferencia pendiente
      await prisma.pendingTransfer.create({
        data: {
          orderId: userSession.currentOrder.id,
          storeId: storeId,
          amount: userSession.currentOrder.total || 0,
          status: 'pending',
          proofImageUrl: proofImageUrl
        }
      });
      
      console.log(`[WhatsApp] [${storeId}] ✅ Transferencia pendiente creada`);
    } catch (error) {
      console.error(`[WhatsApp] [${storeId}] Error actualizando pedido:`, error);
    }
  }
  
  // Resetear sesión
  userSession.waitingForTransferProof = false;
  userSession.waitingForPayment = false;
  userSession.currentOrder = null;
  userSession.paymentMethod = null;
  userSession.step = 'welcome';
  
  await socket.sendMessage(from, { 
    text: `✅ Comprobante recibido correctamente.

🔄 Estamos verificando el pago. Te notificaremos cuando esté confirmado.

⏳ Tu pedido está en espera de aprobación.

💡 Si necesitás algo más, escribí "hola" para ver las opciones.

¡Gracias por tu paciencia! ❤️` 
  });
}

// ---------------------------------------------------------------------------
// ENVIAR MENSAJE A CLIENTE
// ---------------------------------------------------------------------------
export async function sendMessageToClient(storeId, phoneNumber, message) {
  const session = activeSessions.get(storeId);
  if (!session?.socket) {
    console.log(`[WhatsApp] [${storeId}] No hay sesión activa`);
    return { success: false, error: 'No hay sesión activa' };
  }
  
  try {
    const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
    await session.socket.sendMessage(jid, { text: message });
    console.log(`[WhatsApp] [${storeId}] ✅ Mensaje enviado a ${phoneNumber}`);
    return { success: true };
  } catch (error) {
    console.error(`[WhatsApp] [${storeId}] Error enviando mensaje:`, error);
    return { success: false, error: error.message };
  }
}

// ---------------------------------------------------------------------------
// NOTIFICAR PEDIDO AL CLIENTE
// ---------------------------------------------------------------------------
export async function notifyOrderStatus(storeId, orderId, status, extraInfo = {}) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true }
    });
    
    if (!order || !order.customerPhone) {
      console.log(`[WhatsApp] [${storeId}] Pedido sin teléfono de cliente`);
      return { success: false, error: 'Sin teléfono de cliente' };
    }
    
    const storeName = order.store?.name || 'Nuestro local';
    let message = '';
    
    switch (status) {
      case 'confirmed':
        message = `✅ *PEDIDO CONFIRMADO*\n\n📋 Pedido #${order.orderNumber}\n\n🍳 Tu pedido está siendo preparado.\n\n⏱️ Tiempo estimado: 30-45 minutos\n\n¡Gracias por tu compra! ❤️`;
        break;
      case 'preparing':
        message = `👨‍🍳 *EN PREPARACIÓN*\n\n📋 Pedido #${order.orderNumber}\n\nTu pedido está siendo preparado con mucho cariño.\n\n⏱️ Pronto estará listo.`;
        break;
      case 'ready':
        message = order.deliveryFee > 0 
          ? `📦 *PEDIDO LISTO*\n\n📋 Pedido #${order.orderNumber}\n\nTu pedido está listo y pronto saldrá a delivery.\n\n🚚 Te avisamos cuando esté en camino.`
          : `📦 *PEDIDO LISTO PARA RETIRAR*\n\n📋 Pedido #${order.orderNumber}\n\n🏪 Ya podés pasar a retirarlo por ${storeName}.\n\n🔐 Código: ${order.deliveryCode || order.uniqueCode}`;
        break;
      case 'in_transit':
        message = `🚚 *EN CAMINO*\n\n📋 Pedido #${order.orderNumber}\n\nTu pedido está en camino.\n\n📍 Dirección: ${order.customerAddress || 'No especificada'}\n\n🔐 Código de entrega: ${order.deliveryCode || order.uniqueCode}\n\n${extraInfo.trackingUrl ? `📍 Seguí tu pedido: ${extraInfo.trackingUrl}` : ''}`;
        break;
      case 'delivered':
        message = `✅ *ENTREGADO*\n\n📋 Pedido #${order.orderNumber}\n\n¡Tu pedido fue entregado!\n\n⭐ Esperamos que lo disfrutes.\n\n¡Gracias por elegirnos! ❤️`;
        break;
      case 'cancelled':
        message = `❌ *PEDIDO CANCELADO*\n\n📋 Pedido #${order.orderNumber}\n\nTu pedido fue cancelado.\n\n${extraInfo.reason ? `📝 Motivo: ${extraInfo.reason}` : ''}\n\nSi tenés dudas, contactanos.`;
        break;
      case 'payment_approved':
        message = `✅ *PAGO APROBADO*\n\n📋 Pedido #${order.orderNumber}\n\n💰 Tu pago fue verificado correctamente.\n\n🍳 Tu pedido está en preparación.\n\n⏱️ Tiempo estimado: 30-45 minutos\n\n¡Gracias! ❤️`;
        break;
      default:
        message = `📋 *ACTUALIZACIÓN DE PEDIDO*\n\nPedido #${order.orderNumber}\n\nEstado: ${status}`;
    }
    
    return await sendMessageToClient(storeId, order.customerPhone, message);
  } catch (error) {
    console.error(`[WhatsApp] [${storeId}] Error notificando:`, error);
    return { success: false, error: error.message };
  }
}

// ---------------------------------------------------------------------------
// FUNCIONES DE ADMINISTRACIÓN
// ---------------------------------------------------------------------------
export function getSessionStatus(storeId) {
  const session = activeSessions.get(storeId);
  const qr = pendingQRs.get(storeId);
  
  if (session?.socket) {
    return {
      status: 'connected',
      connectedAt: session.createdAt,
      phoneNumber: session.socket.user?.id?.split(':')[0]
    };
  }
  
  if (qr && qr.expires > Date.now()) {
    return {
      status: 'pending_qr',
      qr: qr.qr,
      expiresAt: qr.expires
    };
  }
  
  return { status: 'disconnected' };
}

export function getPendingQR(storeId) {
  const qr = pendingQRs.get(storeId);
  if (qr) {
    // Si el QR expiró, limpiarlo pero no devolver null inmediatamente
    // para dar tiempo a que se regenere
    if (qr.expires > Date.now()) {
      return qr.qr;
    } else {
      // QR expirado, limpiarlo
      pendingQRs.delete(storeId);
    }
  }
  return null;
}

export async function disconnectSession(storeId) {
  const session = activeSessions.get(storeId);
  if (session?.socket) {
    try {
      await session.socket.logout();
    } catch (e) {
      console.log(`[WhatsApp] [${storeId}] Error en logout:`, e.message);
    }
    activeSessions.delete(storeId);
    pendingQRs.delete(storeId);
    connectionStates.delete(storeId); // Limpiar estado de conexión
    
    // Limpiar archivos de sesión
    const sessionPath = path.join(SESSIONS_DIR, storeId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    
    await prisma.storeSettings.upsert({
      where: { storeId },
      update: { whatsappSessionStatus: 'disconnected', whatsappConnectedNumber: null },
      create: { storeId, whatsappSessionStatus: 'disconnected' }
    });
    
    return { success: true };
  }
  // Limpiar estado incluso si no hay sesión activa
  connectionStates.delete(storeId);
  return { success: false, error: 'No hay sesión activa' };
}

export async function reloadStoreConfig(storeId) {
  const config = await loadStoreConfig(storeId);
  return config ? { success: true } : { success: false };
}

// ---------------------------------------------------------------------------
// INICIALIZAR TODAS LAS TIENDAS ACTIVAS
// ---------------------------------------------------------------------------
export async function initializeAllStores() {
  try {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      include: { settings: true }
    });
    
    console.log(`[WhatsApp] Inicializando ${stores.length} tiendas...`);
    
    for (const store of stores) {
      if (store.settings?.whatsappBotEnabled) {
        console.log(`[WhatsApp] Iniciando bot para: ${store.name}`);
        await startWhatsAppSession(store.id);
      }
    }
  } catch (error) {
    console.error('[WhatsApp] Error inicializando tiendas:', error);
  }
}

export default {
  startWhatsAppSession,
  sendMessageToClient,
  notifyOrderStatus,
  getSessionStatus,
  getPendingQR,
  disconnectSession,
  reloadStoreConfig,
  initializeAllStores
};

export { getBotLogs };
