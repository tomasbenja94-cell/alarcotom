/**
 * Servicio de WhatsApp Multi-Sesión
 * Permite manejar múltiples cuentas de WhatsApp (una por tienda)
 */

import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
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

const WHATSAPP_TEMPLATES = {
  rotiseria: {
    welcome: '👋 ¡Hola! Somos {{storeName}}. Hacé tu pedido directo desde {{storeUrl}} y lo coordinamos por acá.',
    orderConfirm: '✅ Pedido {{orderNumber}} confirmado en {{storeName}}. Código repartidor: {{deliveryCode}}. Seguimiento: {{trackingUrl}}',
    orderOnWay: '🚗 Tu pedido {{orderNumber}} ya está en camino desde {{storeName}}. Código: {{deliveryCode}}. Tracking: {{trackingUrl}}'
  },
  kiosco: {
    welcome: '🙌 Bienvenido a {{storeName}}. Pedí todo lo que necesitás en {{storeUrl}} y te respondemos enseguida.',
    orderConfirm: '🛍️ Pedido {{orderNumber}} confirmado. Código de retiro/repartidor: {{deliveryCode}}.',
    orderOnWay: '🚕 Tu pedido {{orderNumber}} salió de {{storeName}}. Mostrá el código {{deliveryCode}}. Tracking: {{trackingUrl}}'
  },
  tragos: {
    welcome: '🍹 Estás en {{storeName}}. Elegí tus tragos en {{storeUrl}} y te confirmamos por WhatsApp.',
    orderConfirm: '🍾 Pedido {{orderNumber}} confirmado. Código bartender/repartidor: {{deliveryCode}}.',
    orderOnWay: '🛵 Tus tragos {{orderNumber}} van en camino. Código: {{deliveryCode}}. Tracking: {{trackingUrl}}'
  }
};

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
  const template = getTemplateByPanel(store?.panelType || 'rotiseria');
  const storeUrl = `${STORE_FRONT_URL}/menu?store=${storeId}`;
  return { store, template, storeUrl };
}

// Directorio para guardar las sesiones
const SESSIONS_DIR = path.join(__dirname, '../../whatsapp-sessions');

// Asegurar que existe el directorio de sesiones
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Almacén de sesiones activas
const activeSessions = new Map();

// Almacén de QR codes pendientes
const pendingQRs = new Map();

// Logger silencioso para Baileys
const logger = pino({ level: 'silent' });

/**
 * Obtiene o crea una sesión de WhatsApp para una tienda
 */
export async function getOrCreateSession(storeId) {
  // Si ya existe una sesión activa, retornarla
  if (activeSessions.has(storeId)) {
    const session = activeSessions.get(storeId);
    if (session.socket && session.socket.user) {
      return { status: 'connected', session };
    }
  }

  // Crear nueva sesión
  return await createSession(storeId);
}

/**
 * Crea una nueva sesión de WhatsApp
 */
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
    });

    // Manejar actualizaciones de conexión
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Generar QR como base64
        const qrBase64 = await QRCode.toDataURL(qr);
        pendingQRs.set(storeId, {
          qr: qrBase64,
          timestamp: Date.now(),
          expires: Date.now() + 60000 // 60 segundos
        });
        console.log(`[WhatsApp] QR generado para tienda: ${storeId}`);
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;

        console.log(`[WhatsApp] Conexión cerrada para ${storeId}. Reconectar: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          // Intentar reconectar después de 5 segundos
          setTimeout(() => createSession(storeId), 5000);
        } else {
          // Sesión cerrada por logout, limpiar
          activeSessions.delete(storeId);
          pendingQRs.delete(storeId);
          
          // Actualizar estado en BD
          await updateSessionStatus(storeId, 'disconnected');
        }
      }

      if (connection === 'open') {
        console.log(`[WhatsApp] ✅ Conectado para tienda: ${storeId}`);
        pendingQRs.delete(storeId);
        
        // Guardar info de conexión
        const phoneNumber = socket.user?.id?.split(':')[0] || '';
        await updateSessionStatus(storeId, 'connected', phoneNumber);
      }
    });

    // Guardar credenciales cuando cambien
    socket.ev.on('creds.update', saveCreds);

    // Manejar mensajes entrantes
    socket.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key.fromMe && msg.message) {
          await handleIncomingMessage(storeId, socket, msg);
        }
      }
    });

    // Guardar sesión
    activeSessions.set(storeId, {
      socket,
      storeId,
      createdAt: Date.now()
    });

    return { status: 'pending_qr', storeId };

  } catch (error) {
    console.error(`[WhatsApp] Error creando sesión para ${storeId}:`, error);
    throw error;
  }
}

/**
 * Maneja mensajes entrantes
 */
async function handleIncomingMessage(storeId, socket, msg) {
  try {
    const from = msg.key.remoteJid;
    const messageText = msg.message?.conversation || 
                        msg.message?.extendedTextMessage?.text || 
                        '';

    console.log(`[WhatsApp] Mensaje recibido en ${storeId} de ${from}: ${messageText}`);

    // Obtener configuración de la tienda
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    if (!settings || !settings.whatsappBotEnabled) {
      return;
    }

    const { store, template, storeUrl } = await getStoreContext(storeId);

    const welcomeMessage = applyPlaceholders(
      settings.welcomeMessage || template.welcome,
      {
        storeName: store?.name,
        storeUrl
      }
    );

    await socket.sendMessage(from, { text: welcomeMessage });

  } catch (error) {
    console.error(`[WhatsApp] Error manejando mensaje:`, error);
  }
}

/**
 * Actualiza el estado de la sesión en la BD
 */
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

/**
 * Obtiene el QR pendiente para una tienda
 */
export function getPendingQR(storeId) {
  const qrData = pendingQRs.get(storeId);
  if (!qrData) return null;
  
  // Verificar si expiró
  if (Date.now() > qrData.expires) {
    pendingQRs.delete(storeId);
    return null;
  }
  
  return qrData.qr;
}

/**
 * Obtiene el estado de conexión de una tienda
 */
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

/**
 * Desconecta una sesión de WhatsApp
 */
export async function disconnectSession(storeId) {
  const session = activeSessions.get(storeId);
  
  if (session?.socket) {
    await session.socket.logout();
    session.socket.end();
  }
  
  activeSessions.delete(storeId);
  pendingQRs.delete(storeId);
  
  // Eliminar archivos de sesión
  const sessionPath = path.join(SESSIONS_DIR, storeId);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
  
  await updateSessionStatus(storeId, 'disconnected');
  
  return { success: true };
}

/**
 * Envía un mensaje de WhatsApp
 */
export async function sendMessage(storeId, to, message) {
  const session = activeSessions.get(storeId);
  
  if (!session?.socket?.user) {
    throw new Error('Sesión de WhatsApp no conectada');
  }

  // Formatear número
  let phoneNumber = to.replace(/\D/g, '');
  if (!phoneNumber.includes('@')) {
    phoneNumber = `${phoneNumber}@s.whatsapp.net`;
  }

  await session.socket.sendMessage(phoneNumber, { text: message });
  
  return { success: true };
}

/**
 * Envía notificación de nuevo pedido
 */
export async function sendOrderNotification(storeId, order) {
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    if (!settings?.whatsappBotEnabled || !settings?.whatsappBotNumber) {
      return;
    }

    const session = activeSessions.get(storeId);
    if (!session?.socket?.user) {
      console.log(`[WhatsApp] No hay sesión activa para ${storeId}`);
      return;
    }

    // Construir mensaje de pedido
    const items = order.items?.map(i => `• ${i.quantity}x ${i.name}`).join('\n') || '';
    const message = `🔔 *NUEVO PEDIDO #${order.orderNumber || order.id.slice(-6)}*

📦 *Productos:*
${items}

💰 *Total:* $${order.total?.toLocaleString('es-AR') || 0}
📍 *Tipo:* ${order.deliveryType === 'delivery' ? 'Envío a domicilio' : 'Retiro en local'}
${order.deliveryType === 'delivery' ? `🏠 *Dirección:* ${order.address || 'No especificada'}` : ''}

👤 *Cliente:* ${order.customerName || 'No especificado'}
📱 *Teléfono:* ${order.customerPhone || 'No especificado'}

⏰ ${new Date().toLocaleString('es-AR')}`;

    await sendMessage(storeId, settings.whatsappBotNumber, message);
    console.log(`[WhatsApp] ✅ Notificación de pedido enviada para ${storeId}`);

  } catch (error) {
    console.error(`[WhatsApp] Error enviando notificación:`, error);
  }
}

/**
 * Envía confirmación de pedido al cliente
 */
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

/**
 * Envía notificación de pedido en camino
 */
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

/**
 * Inicializa todas las sesiones guardadas al arrancar el servidor
 */
export async function initializeAllSessions() {
  try {
    // Buscar tiendas con WhatsApp habilitado
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

