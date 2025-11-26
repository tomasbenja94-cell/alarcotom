/**
 * SERVICIO DE WHATSAPP MULTI-TIENDA COMPLETO
 * Basado en el bot original de El Buen Menú
 * Soporta múltiples sesiones de WhatsApp (una por tienda)
 */

import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  jidDecode
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
const rateLimitMaps = new Map();       // storeId -> Map(userId -> stats)
const messageQueues = new Map();       // storeId -> array de mensajes
const processingFlags = new Map();     // storeId -> boolean

// Logger silencioso para Baileys
const logger = pino({ level: 'silent' });

// ---------------------------------------------------------------------------
// PATRONES DE DETECCIÓN
// ---------------------------------------------------------------------------
const GREETING_PATTERNS = [
  /^hola$/i, /^hi$/i, /^hello$/i, /^buenas$/i, /^buenos días$/i, 
  /^buenas tardes$/i, /^buenas noches$/i, /^buen día$/i, /^que tal$/i,
  /^hey$/i, /^ey$/i, /^holis$/i, /^holaa+$/i, /^hola!+$/i, /^wenas$/i,
  /^epa$/i, /^eu$/i, /^onda$/i
];

const MENU_PATTERNS = [
  /^menu$/i, /^menú$/i, /^carta$/i, /^ver menu$/i, /^ver menú$/i,
  /^1$/i, /^quiero pedir$/i, /^pedir$/i, /^pedido$/i
];

const HOURS_PATTERNS = [
  /^horarios?$/i, /^8$/i, /^que horario/i, /^a que hora/i, /^están abiertos/i, /^abren/i
];

const ORDER_QUERY_PATTERNS = [
  /^2$/i, /^consultar$/i, /^mi pedido$/i, /^estado$/i
];

const MY_ORDERS_PATTERNS = [
  /^3$/i, /^mis pedidos$/i, /^pedidos$/i
];

const HELP_PATTERNS = [
  /^9$/i, /^ayuda$/i, /^help$/i, /^\?$/i, /^como funciona/i
];

// Patrón para detectar pedidos entrantes desde checkout
const ORDER_INCOMING_PATTERN = /(?:pedido|orden|order).*(?:es|is|:)\s*#*(\d+)\s*[-–]\s*(\d+)/i;

// ---------------------------------------------------------------------------
// SPAM DETECTION
// ---------------------------------------------------------------------------
const spamPatterns = [
  /ganar dinero/i, /trabajo desde casa/i, /inversión/i, /bitcoin/i,
  /forex/i, /casino/i, /apuesta/i, /préstamo/i, /crédito fácil/i,
];

function isSpamMessage(text) {
  if (!text) return false;
  return spamPatterns.some(pattern => pattern.test(text));
}

// ---------------------------------------------------------------------------
// RATE LIMITING PER STORE
// ---------------------------------------------------------------------------
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
      waitingForAddress: false,
      deliveryAddress: null
    });
  }
  
  const session = storeSessions.get(userId);
  session.lastActivity = Date.now();
  return session;
}

// ---------------------------------------------------------------------------
// HELPER: Match patterns
// ---------------------------------------------------------------------------
function matchesPattern(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

// ---------------------------------------------------------------------------
// HELPER: Get store context
// ---------------------------------------------------------------------------
async function getStoreContext(storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const settings = await prisma.storeSettings.findUnique({ where: { storeId } });
  const storeUrl = `${STORE_FRONT_URL}/menu?store=${storeId}`;
  return { store, settings, storeUrl };
}

// ---------------------------------------------------------------------------
// HELPER: Format price
// ---------------------------------------------------------------------------
function formatPrice(amount) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(amount || 0);
}

// ---------------------------------------------------------------------------
// SEND MESSAGE (wrapper)
// ---------------------------------------------------------------------------
async function sendMessageToUser(storeId, to, message) {
  const session = activeSessions.get(storeId);
  if (!session?.socket?.user) {
    console.error(`[WhatsApp] [${storeId}] No hay sesión activa para enviar mensaje`);
    return false;
  }

  let jid = to;
  if (!to.includes('@')) {
    jid = `${to.replace(/\D/g, '')}@s.whatsapp.net`;
  }

  try {
    await session.socket.sendMessage(jid, { text: message });
    return true;
  } catch (error) {
    console.error(`[WhatsApp] [${storeId}] Error enviando mensaje:`, error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// HANDLE INCOMING MESSAGE - LÓGICA PRINCIPAL
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

    console.log(`[WhatsApp] [${storeId}] Mensaje de ${from}: ${messageText.substring(0, 100)}`);

    // Obtener configuración de la tienda
    const { store, settings, storeUrl } = await getStoreContext(storeId);

    if (!settings?.whatsappBotEnabled) {
      console.log(`[WhatsApp] [${storeId}] Bot deshabilitado`);
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
    const storeName = store?.name || settings?.commercialName || 'Nuestro local';

    // =========================================================================
    // 0. DETECTAR PEDIDO ENTRANTE (desde checkout web) - PRIORIDAD MÁXIMA
    // =========================================================================
    const orderMatch = messageText.match(ORDER_INCOMING_PATTERN);
    if (orderMatch) {
      const orderNum = orderMatch[1];
      const orderCode = orderMatch[2];
      console.log(`[WhatsApp] [${storeId}] 📦 PEDIDO DETECTADO: #${orderNum} - ${orderCode}`);
      
      // Confirmar recepción del pedido
      const confirmMsg = `✅ *PEDIDO RECIBIDO*

📋 Pedido: #${orderNum}
🔐 Código: ${orderCode}

⏳ Estamos preparando tu pedido.
Te avisamos cuando esté listo.

¡Gracias por elegirnos! ❤️`;
      await socket.sendMessage(from, { text: confirmMsg });
      userSession.step = 'order_received';
      return;
    }

    // =========================================================================
    // 1. SI ESTÁ EN FLUJO DE PAGO - Manejar primero
    // =========================================================================
    if (userSession.waitingForPayment) {
      await handlePaymentSelection(storeId, socket, from, body, userSession, settings, store);
      return;
    }

    if (userSession.waitingForTransferProof) {
      // Verificar si es imagen
      if (msg.message?.imageMessage) {
        await handleTransferProof(storeId, socket, from, msg, userSession, store);
      } else if (body === '09') {
        // Cambiar método de pago
        userSession.paymentMethod = null;
        userSession.waitingForTransferProof = false;
        userSession.waitingForPayment = true;
        await showPaymentOptions(storeId, socket, from, userSession, true);
      } else {
        await socket.sendMessage(from, { 
          text: `📸 Por favor, enviá una FOTO del comprobante de pago.\n\n🔄 Escribí "09" si querés cambiar el método de pago.` 
        });
      }
      return;
    }

    if (userSession.waitingForConfirmation) {
      await handleOrderConfirmation(storeId, socket, from, body, userSession);
      return;
    }

    if (userSession.waitingForAddress) {
      await handleAddressInput(storeId, socket, from, messageText, userSession);
      return;
    }

    // =========================================================================
    // 2. SALUDOS -> Menú principal
    // =========================================================================
    if (matchesPattern(body, GREETING_PATTERNS) || body === 'hola' || isGreetingMessage(body)) {
      await showMainMenu(storeId, socket, from, storeName, storeUrl, settings);
      userSession.step = 'main_menu';
      return;
    }

    // =========================================================================
    // 3. VER MENÚ
    // =========================================================================
    if (matchesPattern(body, MENU_PATTERNS)) {
      const menuMsg = `📋 *NUESTRO MENÚ*

Mirá toda nuestra carta acá:
🔗 ${storeUrl}

¡Elegí tus productos favoritos y hacé tu pedido! 🛒`;
      await socket.sendMessage(from, { text: menuMsg });
      return;
    }

    // =========================================================================
    // 4. CONSULTAR PEDIDO
    // =========================================================================
    if (matchesPattern(body, ORDER_QUERY_PATTERNS)) {
      await socket.sendMessage(from, { 
        text: `🔍 *CONSULTAR PEDIDO*

Para consultar el estado de tu pedido, necesito el código de 4 dígitos que te dimos.

📝 Escribí el código (ej: 1234)` 
      });
      userSession.step = 'waiting_order_code';
      return;
    }

    // =========================================================================
    // 5. MIS PEDIDOS
    // =========================================================================
    if (matchesPattern(body, MY_ORDERS_PATTERNS)) {
      await socket.sendMessage(from, { 
        text: `📦 *MIS PEDIDOS*

Para ver tus pedidos anteriores, ingresá a:
🔗 ${storeUrl}

Ahí podés ver el historial completo.` 
      });
      return;
    }

    // =========================================================================
    // 6. HORARIOS
    // =========================================================================
    if (matchesPattern(body, HOURS_PATTERNS)) {
      let hoursText = `🕐 *HORARIOS DE ${storeName.toUpperCase()}*\n\n`;
      
      if (settings?.hours) {
        try {
          const hours = typeof settings.hours === 'string' ? JSON.parse(settings.hours) : settings.hours;
          const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
          
          days.forEach((day, i) => {
            if (hours[day]?.enabled) {
              hoursText += `${dayNames[i]}: ${hours[day].open} - ${hours[day].close}\n`;
            } else if (hours[day]?.open && hours[day]?.close) {
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
    // 7. AYUDA
    // =========================================================================
    if (matchesPattern(body, HELP_PATTERNS)) {
      const helpMsg = `❓ *CÓMO USAR EL BOT*

1️⃣ Escribí "hola" para ver el menú principal
2️⃣ Escribí "menú" o "1" para ver la carta
3️⃣ Hacé tu pedido desde la web
4️⃣ Cuando confirmes, te pedimos el método de pago
5️⃣ Te avisamos cuando tu pedido esté listo

💡 *Comandos útiles:*
• "menú" - Ver carta
• "horarios" - Ver horarios
• "ayuda" - Ver esta ayuda

🔗 Carta: ${storeUrl}`;
      await socket.sendMessage(from, { text: helpMsg });
      return;
    }

    // =========================================================================
    // 8. CÓDIGO DE PEDIDO (si está esperando)
    // =========================================================================
    if (userSession.step === 'waiting_order_code' && /^\d{4}$/.test(body)) {
      // Buscar pedido por código
      try {
        const orders = await prisma.order.findMany({
          where: {
            storeId: storeId,
            OR: [
              { uniqueCode: body },
              { deliveryCode: body }
            ]
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        });

        if (orders.length > 0) {
          const order = orders[0];
          const statusMap = {
            'pending': '⏳ Pendiente',
            'confirmed': '✅ Confirmado',
            'preparing': '👨‍🍳 En preparación',
            'ready': '📦 Listo',
            'on_way': '🚗 En camino',
            'delivered': '✅ Entregado',
            'cancelled': '❌ Cancelado'
          };
          
          const statusText = statusMap[order.status] || order.status;
          
          await socket.sendMessage(from, { 
            text: `📋 *ESTADO DEL PEDIDO #${order.orderNumber || body}*

${statusText}

💰 Total: ${formatPrice(order.total)}
📅 Fecha: ${new Date(order.createdAt).toLocaleDateString('es-AR')}

¿Necesitás algo más? Escribí "hola"` 
          });
        } else {
          await socket.sendMessage(from, { 
            text: `❌ No encontré ningún pedido con el código ${body}.\n\nVerificá el código e intentá de nuevo.` 
          });
        }
      } catch (error) {
        console.error(`[WhatsApp] [${storeId}] Error buscando pedido:`, error);
        await socket.sendMessage(from, { 
          text: `❌ Hubo un error al buscar tu pedido. Intentá de nuevo más tarde.` 
        });
      }
      
      userSession.step = 'welcome';
      return;
    }

    // =========================================================================
    // 9. MENSAJE NO ENTENDIDO -> Mostrar menú
    // =========================================================================
    await showMainMenu(storeId, socket, from, storeName, storeUrl, settings);

  } catch (error) {
    console.error(`[WhatsApp] [${storeId}] Error manejando mensaje:`, error);
  }
}

// ---------------------------------------------------------------------------
// SHOW MAIN MENU
// ---------------------------------------------------------------------------
async function showMainMenu(storeId, socket, from, storeName, storeUrl, settings) {
  const welcomeMsg = settings?.welcomeMessage || `👋 *¡Bienvenido a ${storeName}!*

📌 *¿Qué necesitás hacer?*

1️⃣ Hacer pedido / Ver menú 📋
2️⃣ Consultar un Pedido 🔍
3️⃣ Mi Link de Invitación 🔗
8️⃣ Ver Horarios 🕒

💡 Podés responder con el *número* o la *palabra clave*.

🔗 Carta: ${storeUrl}`;

  await socket.sendMessage(from, { text: welcomeMsg });
}

// ---------------------------------------------------------------------------
// HANDLE ORDER CONFIRMATION
// ---------------------------------------------------------------------------
async function handleOrderConfirmation(storeId, socket, from, body, userSession) {
  if (body === 'si' || body === 'sí' || body === 'yes' || body === 'ok') {
    userSession.waitingForConfirmation = false;
    
    if (userSession.pendingOrder?.orderId) {
      // Pedido web, ir directo a pago
      userSession.waitingForPayment = true;
      await showPaymentOptions(storeId, socket, from, userSession, false);
    } else {
      // Pedido WhatsApp, pedir dirección
      userSession.waitingForAddress = true;
      await socket.sendMessage(from, { 
        text: `✅ ¡Perfecto! Tu pedido está confirmado.

📍 *DIRECCIÓN DE ENTREGA*

Por favor, enviá tu dirección completa:

📝 Ejemplo: "Av. San Martín 123, entre X e Y"` 
      });
    }
  } else if (body === 'no' || body === 'cancelar') {
    userSession.pendingOrder = null;
    userSession.waitingForConfirmation = false;
    userSession.step = 'welcome';
    await socket.sendMessage(from, { 
      text: `❌ Pedido cancelado.\n\n¿Querés hacer otro pedido? Escribí "menú"` 
    });
  } else {
    await socket.sendMessage(from, { 
      text: `🤔 No entendí.\n\nEscribí:\n✅ "SÍ" para confirmar\n❌ "NO" para cancelar` 
    });
  }
}

// ---------------------------------------------------------------------------
// HANDLE ADDRESS INPUT
// ---------------------------------------------------------------------------
async function handleAddressInput(storeId, socket, from, messageText, userSession) {
  if (!messageText || messageText.trim().length < 10) {
    await socket.sendMessage(from, { 
      text: `📍 La dirección parece muy corta.\n\nPor favor, enviá una dirección más completa.` 
    });
    return;
  }
  
  userSession.deliveryAddress = messageText.trim();
  userSession.waitingForAddress = false;
  userSession.waitingForPayment = true;
  
  await socket.sendMessage(from, { text: `📍 Dirección guardada: ${messageText}\n` });
  await showPaymentOptions(storeId, socket, from, userSession, false);
}

// ---------------------------------------------------------------------------
// SHOW PAYMENT OPTIONS
// ---------------------------------------------------------------------------
async function showPaymentOptions(storeId, socket, from, userSession, isChange = false) {
  const { settings } = await getStoreContext(storeId);
  
  let options = [];
  if (settings?.mercadoPagoEnabled) options.push('1️⃣ Mercado Pago');
  if (settings?.transferEnabled !== false) options.push('2️⃣ Transferencia');
  if (settings?.cashEnabled !== false) options.push('3️⃣ Efectivo');
  options.push('4️⃣ Cancelar');
  
  const title = isChange ? '🔄 *CAMBIAR MÉTODO DE PAGO*' : '💳 *MÉTODO DE PAGO*';
  
  await socket.sendMessage(from, { 
    text: `${title}

Elegí cómo querés pagar:

${options.join('\n')}

Escribí el número de tu opción.` 
  });
}

// ---------------------------------------------------------------------------
// HANDLE PAYMENT SELECTION
// ---------------------------------------------------------------------------
async function handlePaymentSelection(storeId, socket, from, body, userSession, settings, store) {
  const storeName = store?.name || 'Nuestro local';
  
  // Cambiar método (09)
  if (body === '09') {
    userSession.paymentMethod = null;
    userSession.waitingForTransferProof = false;
    userSession.waitingForPayment = true;
    await showPaymentOptions(storeId, socket, from, userSession, true);
    return;
  }
  
  // Cancelar (4)
  if (body === '4' || body.includes('cancelar')) {
    userSession.paymentMethod = null;
    userSession.waitingForPayment = false;
    userSession.pendingOrder = null;
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

📸 Una vez realizado el pago, enviá el comprobante acá.

🔄 Escribí "09" para cambiar método.` 
    });
    return;
  }
  
  // Transferencia (2)
  if (body === '2' || body.includes('transfer')) {
    userSession.paymentMethod = 'transfer';
    userSession.waitingForPayment = false;
    userSession.waitingForTransferProof = true;
    
    let transferInfo = '💵 *DATOS PARA TRANSFERENCIA*\n\n';
    if (settings?.transferAlias) transferInfo += `🏦 Alias: ${settings.transferAlias}\n`;
    if (settings?.transferCvu) transferInfo += `💳 CVU: ${settings.transferCvu}\n`;
    if (settings?.transferTitular) transferInfo += `👤 Titular: ${settings.transferTitular}\n`;
    transferInfo += `\n📸 Enviá el comprobante acá.\n\n🔄 Escribí "09" para cambiar método.`;
    
    await socket.sendMessage(from, { text: transferInfo });
    return;
  }
  
  // Efectivo (3)
  if (body === '3' || body.includes('efectivo')) {
    userSession.paymentMethod = 'cash';
    userSession.waitingForPayment = false;
    
    const total = userSession.pendingOrder?.total || 0;
    
    await socket.sendMessage(from, { 
      text: `✅ *PAGO EN EFECTIVO CONFIRMADO*

💰 Monto a pagar: ${formatPrice(total)}

💵 El pago se realiza al recibir el pedido.

🍳 Tu pedido está en preparación.

⏱️ Tiempo estimado: 30-45 minutos

¡Gracias por tu pedido! ❤️` 
    });
    
    // Limpiar sesión
    userSession.pendingOrder = null;
    userSession.paymentMethod = null;
    userSession.step = 'welcome';
    return;
  }
  
  // Opción inválida
  await socket.sendMessage(from, { 
    text: `🤔 No entendí.\n\nElegí:\n1️⃣ Mercado Pago\n2️⃣ Transferencia\n3️⃣ Efectivo\n4️⃣ Cancelar` 
  });
}

// ---------------------------------------------------------------------------
// HANDLE TRANSFER PROOF
// ---------------------------------------------------------------------------
async function handleTransferProof(storeId, socket, from, msg, userSession, store) {
  console.log(`[WhatsApp] [${storeId}] 📸 Comprobante recibido de ${from}`);
  
  // Marcar como recibido
  userSession.waitingForTransferProof = false;
  userSession.step = 'welcome';
  
  await socket.sendMessage(from, { 
    text: `✅ *COMPROBANTE RECIBIDO*

🔄 Estamos verificando el pago.

⏳ Tu pedido está en espera de aprobación.

📱 Te notificaremos cuando esté confirmado.

¡Gracias! ❤️` 
  });
  
  // Limpiar sesión
  userSession.pendingOrder = null;
  userSession.paymentMethod = null;
}

// ---------------------------------------------------------------------------
// IS GREETING MESSAGE (extended)
// ---------------------------------------------------------------------------
function isGreetingMessage(message) {
  if (!message) return false;
  
  const normalized = message.trim().toLowerCase()
    .replace(/[✨🤙😄👋😎🙌👀🤝💪👑🔥😁🫡🫶]/g, '')
    .trim();
  
  const greetings = [
    'hola', 'holaa', 'holaaa', 'ola', 'olaa', 'holis', 'holiii',
    'buenas', 'wenas', 'buen dia', 'buenas tardes', 'buenas noches',
    'epa', 'eu', 'hey', 'que onda', 'q onda', 'como va'
  ];
  
  return greetings.some(g => normalized.startsWith(g) || normalized === g);
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
        console.log(`[WhatsApp] [${storeId}] QR generado`);
        
        // Guardar estado en BD
        try {
          await prisma.storeSettings.upsert({
            where: { storeId },
            update: { whatsappSessionStatus: 'pending_qr' },
            create: { storeId, whatsappSessionStatus: 'pending_qr' }
          });
        } catch (e) {
          console.error('[WhatsApp] Error guardando estado QR:', e.message);
        }
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;

        console.log(`[WhatsApp] [${storeId}] Conexión cerrada. Reconectar: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          setTimeout(() => createSession(storeId), 5000);
        } else {
          activeSessions.delete(storeId);
          pendingQRs.delete(storeId);
          await updateSessionStatus(storeId, 'disconnected');
        }
      }

      if (connection === 'open') {
        console.log(`[WhatsApp] [${storeId}] ✅ CONECTADO`);
        pendingQRs.delete(storeId);
        
        const phoneNumber = socket.user?.id?.split(':')[0] || '';
        await updateSessionStatus(storeId, 'connected', phoneNumber);
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
    console.error(`[WhatsApp] [${storeId}] Error creando sesión:`, error);
    throw error;
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
    console.error(`[WhatsApp] [${storeId}] Error actualizando estado:`, error.message);
  }
}

// ---------------------------------------------------------------------------
// PUBLIC API
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

export function getPendingQR(storeId) {
  const qrData = pendingQRs.get(storeId);
  if (!qrData) return null;
  
  if (Date.now() > qrData.expires) {
    pendingQRs.delete(storeId);
    return null;
  }
  
  return qrData.qr;
}

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

export async function sendMessage(storeId, to, message) {
  return await sendMessageToUser(storeId, to, message);
}

export async function sendOrderNotification(storeId, order) {
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { storeId } });
    if (!settings?.whatsappBotEnabled || !settings?.whatsappBotNumber) {
      return;
    }

    const { store } = await getStoreContext(storeId);
    const storeName = store?.name || settings.commercialName || 'Negocios App';
    const orderCode = order.deliveryCode || order.uniqueCode || order.orderNumber || '0000';

    const message = `🔔 *NUEVO PEDIDO*

📋 Pedido: #${order.orderNumber || orderCode}
🏪 Local: ${storeName}
🔐 Código: ${orderCode}

💰 Total: ${formatPrice(order.total)}
📍 ${order.customerAddress || 'Retiro en local'}

⚡ Revisá el panel de admin.`;

    await sendMessageToUser(storeId, settings.whatsappBotNumber, message);
    console.log(`[WhatsApp] [${storeId}] ✅ Notificación enviada`);
  } catch (error) {
    console.error(`[WhatsApp] [${storeId}] Error enviando notificación:`, error.message);
  }
}

export async function sendOrderConfirmation(storeId, order, customerPhone) {
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { storeId } });
    if (!settings?.whatsappBotEnabled) return;

    const { store, storeUrl } = await getStoreContext(storeId);
    const storeName = store?.name || 'Nuestro local';
    const orderCode = order.deliveryCode || order.uniqueCode || order.orderNumber || '0000';
    
    const message = settings?.orderConfirmMessage || `✅ *PEDIDO CONFIRMADO*

📋 Pedido: #${order.orderNumber || orderCode}
🏪 ${storeName}
🔐 Código: ${orderCode}

⏳ Estamos preparando tu pedido.
Te avisamos cuando esté listo.

🔗 ${storeUrl}`;

    await sendMessageToUser(storeId, customerPhone, message);
  } catch (error) {
    console.error(`[WhatsApp] [${storeId}] Error enviando confirmación:`, error.message);
  }
}

export async function sendOrderOnWay(storeId, order, customerPhone) {
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { storeId } });
    if (!settings?.whatsappBotEnabled) return;

    const { store } = await getStoreContext(storeId);
    const storeName = store?.name || 'Nuestro local';
    const orderCode = order.deliveryCode || order.uniqueCode || '0000';
    
    const message = settings?.orderOnWayMessage || `🚗 *PEDIDO EN CAMINO*

Tu pedido #${order.orderNumber || orderCode} ya salió de ${storeName}.

🔐 Código: ${orderCode}

📍 Llegará en aproximadamente 15-20 minutos.

¡Gracias por tu compra! ❤️`;

    await sendMessageToUser(storeId, customerPhone, message);
  } catch (error) {
    console.error(`[WhatsApp] [${storeId}] Error enviando notificación en camino:`, error.message);
  }
}

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
