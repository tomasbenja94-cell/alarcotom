import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    downloadMediaMessage,
    jidDecode
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeMessage as analyzeSpam } from './utils/spam-detector.utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
const CONFIG = {
    adminNumbers: process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : ['5493487207406'],
    sessionPath: path.join(__dirname, '../auth'),
    logLevel: 'info',
    maxConcurrentMessages: 50,
    messageQueueSize: 1000,
    rateLimitWindow: 60000,
    maxMessagesPerWindow: 20,
    sessionCleanupInterval: 300000,
    maxSessionAge: 1800000,
    retryAttempts: 3,
    retryDelay: 2000
};

// ---------------------------------------------------------------------------
// API LOCAL CONFIG (Base de datos local)
// ---------------------------------------------------------------------------
const API_CONFIG = {
    url: process.env.API_URL || 'https://api.elbuenmenu.site/api'
};

// Función para hacer requests a la API local con retry y mejor manejo de errores
async function apiRequest(endpoint, options = {}) {
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const url = `${API_CONFIG.url}${endpoint}`;
            logger.debug(`📡 [API Request] ${options.method || 'GET'} ${url} (intento ${attempt}/${maxRetries})`);
            
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            logger.debug(`📡 [API Response] Status: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`❌ [API Error] HTTP ${response.status} para ${endpoint}: ${errorText.substring(0, 200)}`);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            // Si la respuesta es 204 No Content, response.json() would fail; handle that
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                logger.debug(`✅ [API Success] ${endpoint} devolvió:`, typeof data, Array.isArray(data) ? `array[${data.length}]` : 'objeto');
                return data;
            } else {
                logger.warn(`⚠️ [API Warning] ${endpoint} no devolvió JSON, Content-Type: ${contentType}`);
                return null; // No JSON body
            }
        } catch (error) {
            lastError = error;
            
            // SILENCIAR ERRORES PARA ENDPOINTS ESPECÍFICOS
            if (endpoint.includes('bot-messages') || endpoint.includes('whatsapp-messages')) {
                logger.debug(`⚠️ Intento ${attempt}/${maxRetries} falló para ${endpoint}:`, error.message);
            } else {
                logger.error(`❌ Intento ${attempt}/${maxRetries} falló para ${endpoint}:`, error.message);
            }
            
            if (attempt < maxRetries) {
                const delay = attempt * 1000; // 1s, 2s, 3s
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
}

// ---------------------------------------------------------------------------
// LOGGER
// ---------------------------------------------------------------------------
// Logger personalizado que filtra mensajes de error Bad MAC
const baseLogger = pino({ 
    level: 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname' // Ignorar campos innecesarios
        }
    }
});

// Wrapper del logger que filtra mensajes Bad MAC antes de loguearlos
const logger = {
    ...baseLogger,
    error: (...args) => {
        const message = args.join(' ').toString();
        // Filtrar mensajes Bad MAC, Failed to decrypt, Session error
        if (message.includes('Failed to decrypt message with any known session') ||
            message.includes('Bad MAC') ||
            message.includes('Session error:Error: Bad MAC') ||
            message.includes('MessageCounterError') ||
            message.includes('Key used already') ||
            message.includes('never filled') ||
            (message.includes('verifyMAC') && message.includes('Bad MAC'))) {
            // Silenciar completamente estos errores
            return;
        }
        return baseLogger.error(...args);
    },
    warn: (...args) => {
        const message = args.join(' ').toString();
        // Filtrar warnings relacionados con Bad MAC
        if (message.includes('Failed to decrypt message with any known session') ||
            message.includes('Bad MAC') ||
            message.includes('Session error:Error: Bad MAC') ||
            message.includes('MessageCounterError')) {
            // Silenciar completamente estos warnings
            return;
        }
        return baseLogger.warn(...args);
    },
    info: baseLogger.info.bind(baseLogger),
    debug: baseLogger.debug.bind(baseLogger),
    trace: baseLogger.trace.bind(baseLogger),
    fatal: baseLogger.fatal.bind(baseLogger)
};

// Interceptar stderr y stdout para filtrar mensajes Bad MAC antes de que se muestren
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

function shouldFilterMessage(message) {
    return message.includes('Failed to decrypt message with any known session') ||
           message.includes('Session error:Error: Bad MAC') ||
           message.includes('Bad MAC Error: Bad MAC') ||
           message.includes('Error: Bad MAC') ||
           (message.includes('Bad MAC') && (message.includes('verifyMAC') || message.includes('Session error'))) ||
           message.includes('MessageCounterError: Key used already') ||
           message.includes('MessageCounterError') && message.includes('never filled');
}

process.stderr.write = function(chunk, encoding, fd) {
    if (chunk) {
        const message = chunk.toString();
        if (shouldFilterMessage(message)) {
            // Silenciar completamente estos mensajes
            return true;
        }
    }
    return originalStderrWrite(chunk, encoding, fd);
};

process.stdout.write = function(chunk, encoding, fd) {
    if (chunk) {
        const message = chunk.toString();
        if (shouldFilterMessage(message)) {
            // Silenciar completamente estos mensajes
            return true;
        }
    }
    return originalStdoutWrite(chunk, encoding, fd);
};

// ---------------------------------------------------------------------------
// GLOBAL STATE
// ---------------------------------------------------------------------------
let sock;
let allChats = new Map(); // Map para mantener todos los chats registrados
let clientsBeingCreated = new Set(); // Set para evitar creación duplicada de clientes
let userSessions = new Map();
let botMessages = {};
let isConnecting = false;
let connectionAttempts = 0;
let qrGenerated = false;
let reconnectTimeout = null;
let consecutiveErrors = 0;
let lastErrorType = null;
let botNumber = null;
let messageQueue = [];
let isProcessingQueue = false;
let messageStats = new Map();
let processingMessages = new Set();
let sessionLocks = new Map();
let globalMessageCounter = 0;
let rateLimitMap = new Map();
let userLastMessage = new Map();
let badMacErrorCount = 0;
const maxBadMacErrors = 50; // Limpiar sesión solo después de 50 errores (errores Bad MAC son comunes y esperados ocasionalmente)
let badMacErrorHandlerInitialized = false;
let lastBadMacLogTime = 0;
const BAD_MAC_LOG_INTERVAL = 60000; // Solo loguear Bad MAC cada 60 segundos máximo

// ---------------------------------------------------------------------------
// BAD MAC ERROR HANDLER - MEJORADO
// ---------------------------------------------------------------------------
function handleSessionError(error) {
    const errorMessage = error?.message || error?.toString() || '';
    const errorStack = error?.stack || '';
    
    // Detectar diferentes tipos de errores de sesión
    const isBadMac = errorMessage.includes('Bad MAC') || 
                     errorMessage.includes('verifyMAC') ||
                     errorStack.includes('Bad MAC') ||
                     errorStack.includes('verifyMAC');
    
    const isMessageCounter = errorMessage.includes('MessageCounterError') ||
                            errorMessage.includes('Key used already') ||
                            errorMessage.includes('never filled');
    
    const isSessionError = errorMessage.includes('Session error') ||
                          errorMessage.includes('Failed to decrypt');
    
    if (isBadMac || isMessageCounter || isSessionError) {
        badMacErrorCount++;
        const now = Date.now();
        const errorType = isBadMac ? 'Bad MAC' : isMessageCounter ? 'MessageCounter' : 'Session';
        
        // Solo mostrar warning cada cierto tiempo para no saturar los logs
        if (now - lastBadMacLogTime > BAD_MAC_LOG_INTERVAL) {
            if (badMacErrorCount > 5) { // Solo loguear si hay más de 5 errores acumulados
                logger.warn(`⚠️ Errores de sesión detectados (${errorType}): ${badMacErrorCount} errores (esto es normal ocasionalmente)`);
            }
            lastBadMacLogTime = now;
        }
        
        // Silenciar el error "Failed to decrypt message with any known session" - es común y esperado ocasionalmente
        // No hacer nada más a menos que haya demasiados errores consecutivos
        
        if (badMacErrorCount >= maxBadMacErrors) {
            logger.error('🔴 Demasiados errores de sesión consecutivos - limpiando sesión...');
            badMacErrorCount = 0;
            
            // Limpiar sesión
            if (fs.existsSync(CONFIG.sessionPath)) {
                try {
                    fs.removeSync(CONFIG.sessionPath);
                    logger.info('✅ Sesión corrupta eliminada automáticamente');
                    logger.info('💡 Reiniciando bot en 3 segundos para generar nuevo QR...');
                    
                    // Cerrar socket y reiniciar
                    setTimeout(() => {
                        if (sock) {
                            try {
                                sock.end();
                            } catch (e) {
                                // Ignorar errores al cerrar
                            }
                        }
                        setTimeout(() => {
                            isConnecting = false;
                            connectionAttempts = 0;
                            startBot();
                        }, 3000);
                    }, 1000);
                } catch (cleanError) {
                    logger.error('❌ Error al limpiar sesión:', cleanError);
                }
            }
        }
        return true; // Error manejado
    }
    return false; // Error no relacionado con sesión
}

// Inicializar handler de errores de sesión solo una vez
if (!badMacErrorHandlerInitialized) {
    // Capturar errores no manejados
    process.on('uncaughtException', (error) => {
        const errorMessage = error?.message || error?.toString() || '';
        const errorStack = error?.stack || '';
        
        // Silenciar completamente los errores Bad MAC - son comunes y esperados
        if (errorMessage.includes('Bad MAC') || 
            errorMessage.includes('verifyMAC') ||
            errorMessage.includes('Failed to decrypt') ||
            errorMessage.includes('Session error') ||
            errorStack.includes('Bad MAC') ||
            errorStack.includes('verifyMAC')) {
            // Error Bad MAC silenciado completamente - no hacer nada
            return;
        }
        
        if (!handleSessionError(error)) {
            // Para otros errores, solo loguear (no crashear el proceso)
            logger.error('❌ Error no manejado:', error.message);
        }
    });
    
    // Capturar promesas rechazadas
    process.on('unhandledRejection', (reason, promise) => {
        const errorMessage = reason?.message || reason?.toString() || '';
        const errorStack = reason?.stack || '';
        
        // Silenciar completamente los errores Bad MAC - son comunes y esperados
        if (errorMessage.includes('Bad MAC') || 
            errorMessage.includes('verifyMAC') ||
            errorMessage.includes('Failed to decrypt') ||
            errorMessage.includes('Session error') ||
            errorStack.includes('Bad MAC') ||
            errorStack.includes('verifyMAC')) {
            // Error Bad MAC silenciado completamente - no hacer nada
            return;
        }
        
        if (!handleSessionError(reason)) {
            logger.error('❌ Promesa rechazada no manejada:', reason);
        }
    });
    
    badMacErrorHandlerInitialized = true;
}

// ---------------------------------------------------------------------------
// METRICS
// ---------------------------------------------------------------------------
const metrics = {
    messagesProcessed: 0,
    messagesQueued: 0,
    errors: 0,
    activeUsers: 0,
    averageResponseTime: 0,
    lastReset: Date.now()
};

// ---------------------------------------------------------------------------
// LOAD BOT MESSAGES FROM API
// ---------------------------------------------------------------------------
async function loadBotMessages() {
    try {
        const messages = await apiRequest('/bot-messages');
        
        // Convertir array a objeto para fácil acceso
        botMessages = {};
        messages.forEach(msg => {
            botMessages[msg.message_key] = msg.message_text;
        });

        logger.info('✅ Mensajes del bot cargados desde la API local');
        return botMessages;
    } catch (error) {
        // SILENCIAR ERRORES: Solo log debug, no error
        logger.debug('⚠️ No se pudieron cargar mensajes desde la API, usando mensajes por defecto:', error.message);
        
        // Mensajes por defecto si falla la carga
        botMessages = {
            welcome: `👋 ¡Hola! Bienvenido a El Buen Menú 🍔

¿Qué querés hacer hoy?

1️⃣ Ver menú
2️⃣ Consultar pedido
3️⃣ Ver mis pedidos
4️⃣ Ver horarios
5️⃣ Información de delivery
6️⃣ Ubicación

Escribí el número o palabra clave.`,
            menu: `📋 Acá tenés nuestro menú completo 👇

🌐 https://elbuenmenu.site/menu

¡Elegí tus productos favoritos y hacé tu pedido! 🍔`,
            hours: `🕐 NUESTROS HORARIOS:

📅 Lunes a Domingo
🌅 11:00 - 23:00 hs

¡Estamos abiertos ahora! 😊
¿Querés hacer un pedido? 🍔`,
            order_confirm: `🧾 ¿Confirmás este pedido?

✅ Sí
❌ No

Escribí "sí" o "no"`,
            payment_options: `💳 Elegí un método de pago:

1️⃣ Transferencia (Alias/CVU)
2️⃣ Mercado Pago  
3️⃣ Efectivo

Escribí el número de tu opción.`,
            transfer_data: `💵 Datos para transferencia:

🏦 Alias: ELBUENMENU.MP
💰 CVU: 0000003100037891234456

📸 Enviá el comprobante de pago acá mismo.`,
            mercadopago: `💳 Pagá con Mercado Pago:

🔗 https://mpago.la/elbuenmenu

Una vez realizado el pago, enviá el comprobante.`,
            cash: `💵 Perfecto, el pago se realiza al recibir el pedido.

🧾 Tu pedido está confirmado.`,
            order_received: `🔄 Pedido recibido, estamos preparándolo 👨‍🍳

Vas a recibir una actualización cuando esté listo.`,
            order_preparing: `👨‍🍳 Tu pedido se está preparando

⏰ Tiempo estimado: 20-30 minutos`,
            order_ready: `✅ ¡Tu pedido está listo!

🛵 El repartidor está saliendo hacia tu dirección.`,
            order_delivery: `🛵 ¡Tu pedido está en camino!

📍 Llegará en aproximadamente 15-20 minutos
📱 Mantené el teléfono cerca`,
            order_delivered: `🏁 ¡Pedido entregado!

✅ Gracias por elegirnos 
⭐ ¿Cómo estuvo todo?`,
            location: `📍 Estamos ubicados en:

Av. San Martín 123
📞 348-720-7406

🚚 Hacemos delivery en toda la zona`,
            delivery_info: `🚚 *SERVICIO DE DELIVERY*

━━━━━━━━━━━━━━━━━━━━━

📍 *COBERTURA*
• Zona Centro: *GRATIS* 🎉
• Otras zonas: $500
• Amplia cobertura en toda la ciudad

⏱️ *TIEMPO DE ENTREGA*
• Tiempo estimado: 30-45 minutos
• Entregas rápidas y eficientes

📋 *CONDICIONES*
• Pedido mínimo: Consultar
• Métodos de pago: Efectivo, Transferencia, Mercado Pago
• Seguimiento en tiempo real de tu pedido

💡 *VENTAJAS*
✓ Delivery gratis en zona centro
✓ Pedidos rápidos y seguros
✓ Pagá como prefieras

━━━━━━━━━━━━━━━━━━━━━

¿Querés hacer un pedido ahora? 🍔
Escribí "menú" para ver nuestras opciones.`,
            not_understood: `🤔 No entendí tu mensaje.

¿Querés que te ayude con algo?

1️⃣ Ver menú
2️⃣ Consultar pedido
3️⃣ Ver horarios

Escribí el número de la opción.`
        };
        return botMessages;
    }
}

// ---------------------------------------------------------------------------
// GET CLEAN NUMBER - FUNCIÓN CENTRALIZADA
// ---------------------------------------------------------------------------
/**
 * Obtiene el número de teléfono real y limpio desde un JID de WhatsApp
 * 
 * Esta función centraliza toda la lógica de extracción de números:
 * - Detecta si el JID es @lid (Linked Device ID)
 * - Usa jidDecode() para decodificar JIDs @lid
 * - Usa sock.onWhatsApp() para obtener el número real cuando es necesario
 * - Limpia caracteres no numéricos
 * - Detecta y rechaza IDs internos de WhatsApp
 * - Valida formato (10-13 dígitos)
 * - Agrega prefijo "54" (Argentina) si tiene 10 dígitos sin prefijo
 * - Devuelve SIEMPRE el número en formato argentino: "549xxxxxxxxx"
 * 
 * @param {string} jid - El JID completo (ej: "5493487207406@s.whatsapp.net" o "180375909310641@lid")
 * @returns {Promise<string|null>} - El número limpio en formato argentino o null si no se puede obtener
 */
async function getCleanNumber(jid) {
    if (!jid) {
        logger.warn(`⚠️ JID vacío recibido en getCleanNumber`);
        return null;
    }

    try {
        // Paso 1: Detectar si es @lid y decodificar
        let extractedNumber = '';
        
        if (jid.includes('@lid')) {
            // Linked Device ID - intentar decodificar primero
            try {
                const decoded = jidDecode(jid);
                if (decoded && decoded.user) {
                    extractedNumber = decoded.user;
                    logger.debug(`🔍 JID @lid decodificado: ${extractedNumber}`);
                } else {
                    // Si no se puede decodificar, extraer la parte antes de @lid
                    extractedNumber = jid.split('@')[0];
                }
            } catch (e) {
                logger.debug(`⚠️ Error al decodificar JID @lid: ${e.message}`);
                extractedNumber = jid.split('@')[0];
            }
        } else {
            // JID normal - extraer número
            extractedNumber = jid.replace('@s.whatsapp.net', '').replace(/[^\d]/g, '');
        }

        // Paso 2: Limpiar caracteres no numéricos
        const cleanNum = extractedNumber.replace(/[^\d]/g, '');

        // Paso 3: Detectar si es un ID interno de WhatsApp
        // IDs internos típicamente tienen 15 dígitos y empiezan con 1
        const isInternalId = (num) => {
            if (num.length === 15 && num.startsWith('1') && /^1\d{14}$/.test(num)) {
                return true;
            }
            // IDs internos también pueden tener más de 13 dígitos
            if (num.length > 13) {
                return true;
            }
            return false;
        };

        // Paso 4: Si es un ID interno, intentar obtener el número real usando onWhatsApp
        if (isInternalId(cleanNum) && sock) {
            logger.warn(`⚠️ ID interno de WhatsApp detectado: ${cleanNum} (JID: ${jid})`);
            logger.info(`🔍 Intentando obtener número real usando onWhatsApp...`);
            
            try {
                const contacts = await sock.onWhatsApp(jid);
                
                if (contacts && contacts.length > 0) {
                    // Buscar el contacto que coincida
                    const contact = contacts.find(c => {
                        if (c.jid === jid) return true;
                        const jidBase = jid.split('@')[0];
                        return c.jid?.includes(jidBase);
                    });
                    
                    if (contact && contact.jid) {
                        const contactJid = contact.jid;
                        
                        // Si el JID resultante es normal (no @lid), extraer el número
                        if (contactJid.includes('@s.whatsapp.net')) {
                            const contactNumber = contactJid.replace('@s.whatsapp.net', '').replace(/[^\d]/g, '');
                            
                            // Validar que no sea un ID interno y tenga formato válido
                            if (!isInternalId(contactNumber) && contactNumber.length >= 10 && contactNumber.length <= 13) {
                                let finalNumber = contactNumber;
                                
                                // Agregar prefijo 54 si tiene 10 dígitos sin prefijo
                                if (finalNumber.length === 10 && !finalNumber.startsWith('54')) {
                                    finalNumber = '54' + finalNumber;
                                }
                                
                                logger.info(`✅ Número real obtenido desde onWhatsApp: ${finalNumber}`);
                                return finalNumber;
                            }
                        }
                    }
                }
            } catch (whatsappError) {
                logger.debug(`⚠️ Error al obtener número desde onWhatsApp: ${whatsappError.message}`);
            }
            
            // Si no se pudo obtener el número real, pero es un @lid, retornar el JID completo
            // para poder enviar notificaciones (Baileys puede enviar a JIDs @lid)
            if (jid.includes('@lid')) {
                logger.warn(`⚠️ No se pudo obtener número real para ${jid}, pero se guardará el JID @lid para notificaciones`);
                return jid; // Retornar JID completo para poder enviar mensajes
            }
            
            // Si no es @lid y no se pudo obtener número real, rechazar
            logger.warn(`⚠️ No se pudo obtener número real para ${jid}, será rechazado`);
            return null;
        }

        // Paso 5: Validar formato del número extraído
        if (!cleanNum || cleanNum.length < 10 || cleanNum.length > 13) {
            logger.warn(`⚠️ Número con formato inválido: ${cleanNum} (longitud: ${cleanNum.length}, JID: ${jid})`);
            
            // Si el número es muy corto o muy largo, intentar obtener número real
            if (sock && cleanNum.length > 0) {
                try {
                    const contacts = await sock.onWhatsApp(jid);
                    if (contacts && contacts.length > 0) {
                        const contact = contacts.find(c => c.jid && c.jid.includes('@s.whatsapp.net'));
                        if (contact && contact.jid) {
                            const realNumber = contact.jid.replace('@s.whatsapp.net', '').replace(/[^\d]/g, '');
                            if (!isInternalId(realNumber) && realNumber.length >= 10 && realNumber.length <= 13) {
                                let finalNumber = realNumber;
                                if (finalNumber.length === 10 && !finalNumber.startsWith('54')) {
                                    finalNumber = '54' + finalNumber;
                                }
                                logger.info(`✅ Número real obtenido desde onWhatsApp (formato inválido): ${finalNumber}`);
                                return finalNumber;
                            }
                        }
                    }
                } catch (error) {
                    logger.debug(`⚠️ Error al obtener número real (formato inválido): ${error.message}`);
                }
            }
            
            return null;
        }

        // Paso 6: Verificar que no sea un ID interno (por si acaso)
        if (isInternalId(cleanNum)) {
            logger.warn(`⚠️ Número detectado como ID interno después de validación: ${cleanNum}`);
            return null;
        }

        // Paso 7: Agregar prefijo "54" si tiene 10 dígitos sin prefijo
        let finalNumber = cleanNum;
        if (finalNumber.length === 10 && !finalNumber.startsWith('54')) {
            finalNumber = '54' + finalNumber;
        }

        // Paso 8: Validar que el número final tenga formato correcto
        if (finalNumber.length < 11 || finalNumber.length > 13) {
            logger.warn(`⚠️ Número final con formato inválido: ${finalNumber} (longitud: ${finalNumber.length})`);
            return null;
        }

        logger.info(`✅ Número válido extraído: ${finalNumber} (desde JID: ${jid})`);
        return finalNumber;

    } catch (error) {
        logger.error(`❌ Error en getCleanNumber para JID ${jid}:`, error);
        return null;
    }
}

// ---------------------------------------------------------------------------
// SESSION CLEANUP
// ---------------------------------------------------------------------------
function cleanupInactiveSessions() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [userId, session] of userSessions.entries()) {
        if (now - session.lastActivity > CONFIG.maxSessionAge) {
            userSessions.delete(userId);
            messageStats.delete(userId);
            sessionLocks.delete(userId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        logger.info(`🧹 Limpiadas ${cleaned} sesiones inactivas`);
    }
    
    metrics.activeUsers = userSessions.size;
}

// ---------------------------------------------------------------------------
// RATE LIMITING
// ---------------------------------------------------------------------------
function checkRateLimit(userId) {
    const now = Date.now();
    
    if (!messageStats.has(userId)) {
        messageStats.set(userId, {
            messages: [],
            lastMessage: 0,
            blocked: false,
            blockUntil: 0
        });
    }
    
    const stats = messageStats.get(userId);
    
    if (stats.blocked && now < stats.blockUntil) {
        return false;
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
        logger.warn(`🚫 Usuario ${userId} bloqueado por rate limiting`);
        return false;
    }
    
    if (now - stats.lastMessage < 2000) {
        return false;
    }
    
    stats.messages.push(now);
    stats.lastMessage = now;
    
    return true;
}

// ---------------------------------------------------------------------------
// MESSAGE QUEUE
// ---------------------------------------------------------------------------
async function addToMessageQueue(message, priority = 0) {
    try {
        if (messageQueue.length >= CONFIG.messageQueueSize) {
            logger.warn('⚠️ Cola de mensajes llena, descartando mensaje más antiguo');
            messageQueue.shift();
        }
        
        const queueItem = {
            message,
            priority,
            timestamp: Date.now(),
            attempts: 0,
            id: `msg_${globalMessageCounter++}`
        };
        
        if (priority > 0) {
            messageQueue.unshift(queueItem);
        } else {
            messageQueue.push(queueItem);
        }
        
        metrics.messagesQueued++;
        logger.info(`✅ [DEBUG] Mensaje agregado a cola. Total en cola: ${messageQueue.length}, Procesando: ${isProcessingQueue}`);
        
        if (!isProcessingQueue) {
            logger.info(`🚀 [DEBUG] Iniciando procesador de cola (${messageQueue.length} mensajes en cola)`);
            processMessageQueue();
        }
        
    } catch (error) {
        logger.error('Error al agregar mensaje a cola:', error);
        metrics.errors++;
    }
}

async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) {
        logger.info(`⏸️ [DEBUG] Procesador de cola pausado - Procesando: ${isProcessingQueue}, Cola: ${messageQueue.length}`);
        return;
    }
    
    isProcessingQueue = true;
    logger.info(`🔄 [DEBUG] Procesador de cola iniciado - ${messageQueue.length} mensajes en cola`);
    
    try {
        while (messageQueue.length > 0) {
            const queueItem = messageQueue.shift();
            if (!queueItem) continue;
            
            const startTime = Date.now();
            
            try {
                if (processingMessages.has(queueItem.id)) {
                    logger.info(`⏭️ [DEBUG] Mensaje ${queueItem.id} ya está siendo procesado, saltando`);
                    continue;
                }
                processingMessages.add(queueItem.id);
                
                logger.info(`📝 [DEBUG] Procesando mensaje ${queueItem.id} de ${queueItem.message?.key?.remoteJid}`);
                await handleMessage(queueItem.message);
                
                metrics.messagesProcessed++;
                const responseTime = Date.now() - startTime;
                metrics.averageResponseTime = (metrics.averageResponseTime + responseTime) / 2;
                logger.info(`✅ [DEBUG] Mensaje ${queueItem.id} procesado en ${responseTime}ms`);
                
            } catch (error) {
                logger.error(`❌ Error procesando mensaje ${queueItem.id}:`, error);
                logger.error(`❌ Stack:`, error.stack);
                metrics.errors++;
                
                queueItem.attempts++;
                if (queueItem.attempts < CONFIG.retryAttempts) {
                    setTimeout(() => {
                        messageQueue.push(queueItem);
                    }, CONFIG.retryDelay * queueItem.attempts);
                }
            } finally {
                processingMessages.delete(queueItem.id);
            }
            
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    } catch (error) {
        logger.error('❌ Error crítico en procesador de cola:', error);
        logger.error('❌ Stack:', error.stack);
        metrics.errors++;
    } finally {
        isProcessingQueue = false;
        metrics.messagesQueued = messageQueue.length;
        
        // Si aún hay mensajes en cola, reiniciar el procesador después de un breve delay
        if (messageQueue.length > 0) {
            logger.info(`🔄 [DEBUG] Aún hay ${messageQueue.length} mensajes en cola, reiniciando procesador...`);
            setTimeout(() => {
                if (!isProcessingQueue) {
                    processMessageQueue();
                }
            }, 100);
        }
    }
}

// ---------------------------------------------------------------------------
// WEBHOOK SERVER
// ---------------------------------------------------------------------------
import express from 'express';
import cors from 'cors';
const webhookApp = express();

// Configurar CORS para permitir peticiones desde el frontend
webhookApp.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
}));

webhookApp.use(express.json());

webhookApp.post('/webhook', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message) {
            return res.status(400).json({ error: 'Phone y message son requeridos' });
        }

        const jid = `${phone}@s.whatsapp.net`;
        await sendMessage(jid, message);
        
        logger.info(`📤 Mensaje webhook enviado a ${phone}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Error en webhook:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para recargar mensajes
webhookApp.post('/reload-messages', async (req, res) => {
    try {
        await loadBotMessages();
        logger.info('🔄 Mensajes del bot recargados');
        res.json({ success: true, message: 'Mensajes recargados correctamente' });
    } catch (error) {
        logger.error('❌ Error al recargar mensajes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para notificar cambios de estado de pedidos
// Endpoint para enviar mensajes desde el servidor
webhookApp.post('/send-message', async (req, res) => {
    try {
        const { to, message } = req.body;
        
        if (!to || !message) {
            return res.status(400).json({ error: 'to y message son requeridos' });
        }
        
        if (!sock) {
            return res.status(503).json({ error: 'Bot no conectado' });
        }
        
        logger.info(`📤 Enviando mensaje desde servidor a ${to}`);
        await sendMessage(to, message);
        
        res.json({ success: true, message: 'Mensaje enviado' });
    } catch (error) {
        logger.error('❌ Error enviando mensaje desde servidor:', error);
        res.status(500).json({ error: 'Error al enviar mensaje' });
    }
});

// Endpoint para notificar pagos aprobados
webhookApp.post('/notify-payment', async (req, res) => {
    try {
        const { phone, message } = req.body;
        
        if (!phone) {
            logger.error('❌ phone es requerido para notificación de pago');
            return res.status(400).json({ error: 'phone es requerido' });
        }
        
        const notificationMessage = message || 'Tu pago ha sido aprobado.';
        
        // Limpiar y formatear número
        let cleanPhoneOrJid = phone.trim();
        let jid;
        
        if (cleanPhoneOrJid.includes('@')) {
            // Ya es un JID
            jid = cleanPhoneOrJid;
        } else {
            // Construir JID
            jid = `${cleanPhoneOrJid}@s.whatsapp.net`;
        }
        
        logger.info(`💰 Enviando notificación de pago a ${jid}`);
        
        // Verificar que el socket esté inicializado
        if (!sock) {
            logger.error('❌ Socket no inicializado, no se puede enviar notificación de pago');
            return res.status(503).json({ error: 'Bot no conectado' });
        }
        
        try {
            await sendMessage(jid, notificationMessage);
            logger.info(`✅ Notificación de pago enviada exitosamente a ${jid}`);
            res.json({ success: true, phone: jid });
        } catch (sendError) {
            logger.error(`❌ Error al enviar notificación de pago:`, sendError);
            res.status(500).json({ error: sendError.message, phone: jid });
        }
    } catch (error) {
        logger.error('❌ Error en notificación de pago:', error);
        res.status(500).json({ error: error.message });
    }
});

webhookApp.post('/notify-order', async (req, res) => {
    try {
        const { customerPhone, message, deliveryCode } = req.body;
        
        if (!customerPhone) {
            logger.error('❌ customerPhone es requerido');
            return res.status(400).json({ error: 'customerPhone es requerido' });
        }
        
        let notificationMessage = message || 'Tu pedido ha sido actualizado.';
        
        // Usar función centralizada para obtener número limpio o JID
        // Si customerPhone ya es un JID completo (contiene @), usarlo directamente
        // Si no, construir JID temporal y llamar a getCleanNumber
        let jid;
        let cleanPhoneOrJid;
        
        if (customerPhone.includes('@')) {
            // Ya es un JID completo (puede ser @lid o @s.whatsapp.net)
            // Intentar obtener número real, pero si no se puede y es @lid, usar el JID directamente
            cleanPhoneOrJid = await getCleanNumber(customerPhone);
            
            if (!cleanPhoneOrJid) {
                // Si getCleanNumber retorna null pero es un @lid, usar el JID original
                if (customerPhone.includes('@lid')) {
                    logger.info(`📱 Usando JID @lid directamente para notificación: ${customerPhone}`);
                    jid = customerPhone;
                    cleanPhoneOrJid = customerPhone;
                } else {
                    logger.error(`❌ Número inválido detectado: ${customerPhone}`);
                    return res.status(400).json({ 
                        error: 'Número de teléfono inválido', 
                        received: customerPhone,
                        message: 'El número parece ser un ID interno de WhatsApp o tiene un formato inválido. El cliente debe enviar un mensaje desde WhatsApp primero para que se guarde su número correctamente.'
                    });
                }
            } else {
                // Si es un JID completo (contiene @), usarlo directamente; si no, construir JID
                jid = cleanPhoneOrJid.includes('@') ? cleanPhoneOrJid : `${cleanPhoneOrJid}@s.whatsapp.net`;
            }
        } else {
            // No es un JID, construir uno temporal
            const tempJid = `${customerPhone}@s.whatsapp.net`;
            cleanPhoneOrJid = await getCleanNumber(tempJid);
            
            if (!cleanPhoneOrJid) {
                logger.error(`❌ Número inválido detectado: ${customerPhone}`);
            return res.status(400).json({ 
                error: 'Número de teléfono inválido', 
                received: customerPhone,
                message: 'El número parece ser un ID interno de WhatsApp o tiene un formato inválido. El cliente debe enviar un mensaje desde WhatsApp primero para que se guarde su número correctamente.'
            });
        }
        
            // Si es un JID completo (contiene @), usarlo directamente; si no, construir JID
            jid = cleanPhoneOrJid.includes('@') ? cleanPhoneOrJid : `${cleanPhoneOrJid}@s.whatsapp.net`;
        }
        
        const displayPhone = cleanPhoneOrJid.includes('@') ? cleanPhoneOrJid : cleanPhoneOrJid;
        logger.info(`📤 Intentando enviar notificación a ${displayPhone} (JID: ${jid})`);
        logger.info(`📝 Mensaje: ${notificationMessage.substring(0, 100)}...`);
        
        // Verificar que el socket esté inicializado
        if (!sock) {
            logger.error('❌ Socket no inicializado, no se puede enviar mensaje');
            return res.status(503).json({ error: 'Bot no conectado' });
        }
        
        try {
            await sendMessage(jid, notificationMessage);
            logger.info(`✅ Notificación enviada exitosamente a ${displayPhone}`);
            res.json({ success: true, phone: displayPhone, jid: jid });
        } catch (sendError) {
            logger.error(`❌ Error al enviar mensaje:`, sendError);
            logger.error(`❌ Stack:`, sendError.stack);
            res.status(500).json({ error: sendError.message, phone: displayPhone, jid: jid });
        }
    } catch (error) {
        logger.error('❌ Error en notificación:', error);
        logger.error('❌ Stack:', error.stack);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

webhookApp.listen(3001, () => {
    logger.info('🌐 Servidor webhook iniciado en puerto 3001');
});

// ---------------------------------------------------------------------------
// REGISTER ALL CHATS
// ---------------------------------------------------------------------------
// La función registerAllChats ya no es necesaria - los chats se registran automáticamente
// mediante el evento 'chats.update' que Baileys emite cuando sincroniza los chats

// ---------------------------------------------------------------------------
// SAVE MESSAGE TO SUPABASE
// ---------------------------------------------------------------------------
async function saveMessageToSupabase(messageData) {
    try {
        // Validar datos antes de enviar
        if (!messageData.phone_number || !messageData.message) {
            logger.debug('⚠️ Datos de mensaje incompletos, saltando guardado');
            return;
        }

        // Usar JID directamente (ya no necesitamos números "limpios")
        const phoneJid = messageData.phone_number.includes('@') 
            ? messageData.phone_number 
            : `${messageData.phone_number}@s.whatsapp.net`;
        
        const dataToSave = {
            phone_number: phoneJid,
            message: messageData.message.substring(0, 1000), // Limitar longitud
            direction: messageData.direction || 'incoming',
            status: messageData.status || 'received',
            created_at: new Date().toISOString()
        };

        await apiRequest('/whatsapp-messages', {
            method: 'POST',
            body: JSON.stringify({
                order_id: dataToSave.order_id || null,
                phone_number: dataToSave.phone_number,
                message_text: dataToSave.message || dataToSave.message_text,
                message_type: dataToSave.message_type || 'sent',
                direction: dataToSave.direction || 'incoming'
            })
        });

        logger.debug('💾 Mensaje guardado en la base de datos local');
    } catch (error) {
        // SILENCIAR ERRORES: Solo debug, no error
        logger.debug('⚠️ No se pudo guardar mensaje en la base de datos:', error.message);
        // No lanzar error para no interrumpir el flujo del bot
    }
}

// ---------------------------------------------------------------------------
// BOT STARTUP
// ---------------------------------------------------------------------------
async function startBot() {
    if (isConnecting) {
        logger.info('⏳ Ya hay una conexión en proceso...');
        return;
    }
    
    try {
        isConnecting = true;
        connectionAttempts++;
        
        logger.info('\n🚀 INICIANDO BOT DE WHATSAPP PROFESIONAL...\n');
        
        // Cargar mensajes del bot
        await loadBotMessages();
        qrGenerated = false;
        
        const hasValidSession = checkValidSession();
        if (hasValidSession) {
            logger.info(`🔄 Intento de conexión #${connectionAttempts}`);
            logger.info('📱 Usando sesión guardada existente...');
        } else {
            logger.info('📱 No hay sesión válida - se generará QR nuevo...');
            if (fs.existsSync(CONFIG.sessionPath)) {
                fs.removeSync(CONFIG.sessionPath);
                logger.info('🧹 Sesión anterior limpiada');
            }
        }
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        logger.info(`📱 Usando Baileys versión: ${version.join('.')}, es la última: ${isLatest}`);
        
        const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionPath);
        
        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['El Buen Menú Bot', 'Chrome', '1.0.0'],
            generateHighQualityLinkPreview: true,
            markOnlineOnConnect: true,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000, // Keep-alive cada 10 segundos para mantener conexión activa 24/7
            retryRequestDelayMs: 1000,
            maxMsgRetryCount: 3, // Aumentado para mejor confiabilidad
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            emitOwnEvents: false,
            fireInitQueries: true,
            linkPreviewImageThumbnailWidth: 192,
            qrTimeout: 60000,
            authTimeout: 60000,
            responseTimeout: 30000,
            transactionOpts: {
                maxCommitRetries: 3, // Aumentado para mejor confiabilidad
                delayBetweenTriesMs: 3000
            },
            getMessage: async (key) => ({ conversation: 'Mensaje no disponible' }),
            // Configuración adicional para mantener conexión estable 24/7
            printQRInTerminal: true
        });

        const connectionTimeout = setTimeout(() => {
            if (isConnecting) {
                logger.warn('⏰ Timeout de conexión (60s) - eliminando sesión problemática...');
                isConnecting = false;
                if (fs.existsSync(CONFIG.sessionPath)) {
                    fs.removeSync(CONFIG.sessionPath);
                    logger.info('🗑️ Sesión problemática eliminada por timeout');
                }
                consecutiveErrors = 0;
                connectionAttempts = 0;
                setTimeout(startBot, 10000);
            }
        }, 60000);

        // -------------------------------------------------------------------
        // SOCKET EVENT HANDLERS
        // -------------------------------------------------------------------
        sock.ev.on('connection.update', async (update) => {
            try {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr && !qrGenerated) {
                    console.log('\n🔗 CÓDIGO QR PARA WHATSAPP:\n');
                    console.log('═'.repeat(60));
                    qrcode.generate(qr, { small: true });
                    console.log('═'.repeat(60));
                    console.log('\n📱 INSTRUCCIONES:');
                    console.log('1. Abre WhatsApp en tu teléfono');
                    console.log('2. Configuración → Dispositivos vinculados');
                    console.log('3. Toca "Vincular un dispositivo"');
                    console.log('4. Escanea el código QR de arriba');
                    console.log('\n⏳ Esperando escaneo... (Tienes 60 segundos)\n');
                    qrGenerated = true;
                }
                
                if (connection === 'close') {
                    clearTimeout(connectionTimeout);
                    isConnecting = false;
                    const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    
                    // Detectar errores de sesión en la desconexión
                    const disconnectError = lastDisconnect?.error;
                    if (disconnectError) {
                        handleSessionError(disconnectError);
                    }
                    
                    logger.warn(`\n❌ Conexión cerrada. Código: ${statusCode}`);
                    
                    if (reconnectTimeout) {
                        clearTimeout(reconnectTimeout);
                        reconnectTimeout = null;
                    }
                    
                    if (statusCode === DisconnectReason.loggedOut) {
                        logger.info('🚪 Sesión cerrada desde WhatsApp. Eliminando sesión...');
                        if (fs.existsSync(CONFIG.sessionPath)) {
                            fs.removeSync(CONFIG.sessionPath);
                            logger.info('🗑️ Sesión eliminada');
                        }
                        consecutiveErrors = 0;
                        connectionAttempts = 0;
                    qrGenerated = false;
                    reconnectTimeout = setTimeout(startBot, 5000);
                } else if (statusCode === 440 || statusCode === 405) {
                    const errName = statusCode === 440 ? '440' : '405';
                    logger.warn(`🔧 Error ${errName}: Problema de sincronización con WhatsApp Web`);
                    
                    if (lastErrorType === statusCode) {
                        consecutiveErrors++;
                    } else {
                        consecutiveErrors = 1;
                        lastErrorType = statusCode;
                    }
                    
                    if (consecutiveErrors >= 2) {
                        logger.info(`💡 Limpiando sesión después de múltiples errores ${errName}...`);
                        if (fs.existsSync(CONFIG.sessionPath)) {
                            fs.removeSync(CONFIG.sessionPath);
                            logger.info('🗑️ Sesión eliminada - se generará QR nuevo');
                        }
                        consecutiveErrors = 0;
                        connectionAttempts = 0;
                        qrGenerated = false;
                        const delay = 10000;
                        logger.info(`🔄 Reiniciando con sesión limpia en ${delay/1000}s...`);
                        reconnectTimeout = setTimeout(startBot, delay);
                    } else {
                        const delay = 5000;
                        logger.info(`🔄 Reintentando en ${delay/1000}s... (Intento ${consecutiveErrors}/2)`);
                        reconnectTimeout = setTimeout(startBot, delay);
                    }
                } else if (shouldReconnect && connectionAttempts < 3) {
                    const delay = Math.min(connectionAttempts * 5000, 15000);
                    logger.info(`🔄 Reintentando en ${delay/1000}s... (Intento ${connectionAttempts}/3)`);
                    reconnectTimeout = setTimeout(startBot, delay);
                } else {
                    logger.error('\n🚫 Demasiados errores de conexión.');
                    logger.info('🗑️ Eliminando sesión problemática...');
                    if (fs.existsSync(CONFIG.sessionPath)) {
                        fs.removeSync(CONFIG.sessionPath);
                        logger.info('✅ Sesión eliminada');
                    }
                    logger.info('💡 El bot se reiniciará automáticamente en 30 segundos...');
                    consecutiveErrors = 0;
                    connectionAttempts = 0;
                    qrGenerated = false;
                    setTimeout(startBot, 30000);
                }
            } else if (connection === 'open') {
                clearTimeout(connectionTimeout);
                isConnecting = false;
                consecutiveErrors = 0;
                connectionAttempts = 0;
                lastErrorType = null;
                qrGenerated = false;
                badMacErrorCount = 0; // Resetear contador de errores Bad MAC al conectar exitosamente
                
                botNumber = sock.user?.id?.split(':')[0];
                
                if (reconnectTimeout) {
                    clearTimeout(reconnectTimeout);
                    reconnectTimeout = null;
                }
                
                logger.info('\n🎉 ¡BOT DE WHATSAPP CONECTADO EXITOSAMENTE!');
                logger.info('📞 Número del bot:', sock.user?.id);
                logger.info('💬 El bot está listo para recibir mensajes');
                logger.info('💾 Sesión guardada para futuros usos');
                logger.info('🏢 Sistema profesional de gestión activado');
                logger.info('📡 Listener de mensajes registrado y activo');
                logger.info('═'.repeat(60) + '\n');
                
                startMonitoringSystems();
                
                // Verificar que el listener esté activo
                logger.info('✅ [DEBUG] Verificando listener de mensajes...');
                logger.info(`✅ [DEBUG] Socket conectado: ${sock && typeof sock.ev === 'object'}`);
                
            } else if (connection === 'connecting') {
                logger.info('🔄 Conectando a WhatsApp...');
            }
            } catch (error) {
                // Capturar errores en connection.update
                handleSessionError(error);
                logger.error('❌ Error en connection.update:', error.message);
            }
        });

        // -------------------------------------------------------------------
        // CHATS UPDATE HANDLER - Registrar todos los chats automáticamente
        // -------------------------------------------------------------------
        sock.ev.on('chats.update', async (chats) => {
            try {
                if (!chats || !Array.isArray(chats)) return;
                
                // Registrar cada chat automáticamente
                for (const chat of chats) {
                    try {
                        const jid = chat.id;
                        if (!jid) continue;
                        
                        // Solo registrar chats individuales (no grupos, broadcasts, ni estados)
                        if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('status@')) {
                            continue;
                        }
                        
                        // Solo incluir chats con @s.whatsapp.net o @lid
                        if (!jid.includes('@s.whatsapp.net') && !jid.includes('@lid')) {
                            continue;
                        }
                        
                        // Solo registrar chats que tienen conversación
                        if (!chat || (!chat.conversationTimestamp && !chat.messages)) {
                            continue;
                        }
                        
                        // Guardar en el Map de chats
                        allChats.set(jid, chat);
                        
                        // Registrar en la base de datos si no existe (solo si no se está creando ya)
                        if (clientsBeingCreated.has(jid)) {
                            continue; // Ya se está creando, saltar
                        }
                        
                        try {
                            const existingCustomers = await apiRequest('/customers').catch(() => []);
                            const existingCustomer = existingCustomers.find(c => c.phone === jid);
                            
                            if (!existingCustomer) {
                                // Marcar que se está creando
                                clientsBeingCreated.add(jid);
                                
                                // Obtener nombre del chat si está disponible
                                let contactName = chat.name || null;
                                
                                // Crear nuevo cliente
                                try {
                                    await apiRequest('/customers', {
                                        method: 'POST',
                                        body: JSON.stringify({
                                            phone: jid,
                                            name: contactName || null,
                                            is_blocked: false,
                                            disabled_payment_methods: null,
                                            notes: null
                                        })
                                    });
                                } finally {
                                    // Remover del set después de intentar crear (exitosa o no)
                                    clientsBeingCreated.delete(jid);
                                }
                            } else if (!existingCustomer.name && chat.name) {
                                // Actualizar nombre si está vacío
                                await apiRequest(`/customers/${existingCustomer.id}`, {
                                    method: 'PUT',
                                    body: JSON.stringify({
                                        phone: jid,
                                        name: chat.name
                                    })
                                }).catch(() => {}); // Ignorar errores silenciosamente
                            }
                        } catch (e) {
                            // Remover del set en caso de error
                            clientsBeingCreated.delete(jid);
                            // Ignorar errores individuales
                        }
                    } catch (e) {
                        // Ignorar errores por chat individual
                    }
                }
            } catch (error) {
                // No loggear errores para no saturar logs
            }
        });
        
        // -------------------------------------------------------------------
        // MESSAGE UPSERT HANDLER - CON MANEJO DE ERRORES DE SESIÓN
        // -------------------------------------------------------------------
        logger.info('📡 [DEBUG] Registrando listener de mensajes (messages.upsert)...');
        sock.ev.on('messages.upsert', async (m) => {
            try {
                logger.info(`📥 [DEBUG] messages.upsert recibido, mensajes: ${m.messages?.length || 0}`);
                // Wrapper interno para capturar errores de descifrado
                try {
                    const message = m.messages[0];
                    // Pasar pushName al mensaje si está disponible
                    if (m.pushName && message) {
                        message.pushName = m.pushName;
                    }
                    
                    // Validaciones básicas mejoradas
                    if (!message || !message.key || !message.message) {
                        logger.info(`⚠️ [DEBUG] Mensaje inválido - message: ${!!message}, key: ${!!message?.key}, message.message: ${!!message?.message}`);
                        // No mostrar warnings para mensajes inválidos - pueden ser errores de desencriptación esperados
                        return;
                    }
                    
                    logger.info(`✅ [DEBUG] Mensaje válido recibido de ${message.key.remoteJid}`);
                    
                    if (message.key.fromMe) {
                        logger.debug('📤 Mensaje propio ignorado');
                        return;
                    }
                    
                    const fromNumber = message.key.remoteJid?.split('@')[0];
                    if (!fromNumber) {
                        logger.warn('⚠️ Mensaje sin número de origen');
                        return;
                    }
                    
                    if (botNumber && fromNumber === botNumber) {
                        logger.debug('🤖 Mensaje del bot ignorado');
                        return;
                    }
                    
                    if (message.key.remoteJid?.includes('@g.us')) {
                        logger.debug('👥 Mensaje de grupo ignorado');
                        return;
                    }
                    
                    const messageTime = message.messageTimestamp * 1000;
                    if (Date.now() - messageTime > 300000) {
                        logger.debug('⏰ Mensaje muy antiguo ignorado');
                        return;
                    }
                    
                    const remoteJid = message.key.remoteJid;
                    if (!checkRateLimit(fromNumber)) {
                        logger.warn(`🚫 Mensaje bloqueado por rate limiting: ${fromNumber}`);
                        return;
                    }
                    
                    // Verificar si es admin usando el número o el JID completo
                    const isAdmin = isAdminMessage(fromNumber) || (remoteJid && isAdminMessage(remoteJid));
                    const priority = isAdmin ? 10 : 0;
                    logger.info(`📨 [DEBUG] Agregando mensaje a cola - De: ${remoteJid}, Prioridad: ${priority}`);
                    await addToMessageQueue(message, priority);
                    logger.info(`📊 [DEBUG] Cola actual: ${messageQueue.length} mensajes`);
                } catch (decryptError) {
                    // Capturar errores de descifrado específicamente
                    // Estos errores aparecen como "Failed to decrypt message with any known session"
                    const errorMessage = decryptError?.message || decryptError?.toString() || '';
                    const errorStack = decryptError?.stack || '';
                    
                    // Detectar errores de Bad MAC o sesión
                    const isBadMac = errorMessage.includes('Bad MAC') || 
                                   errorMessage.includes('verifyMAC') ||
                                   errorStack.includes('Bad MAC') ||
                                   errorStack.includes('verifyMAC') ||
                                   errorMessage.includes('Failed to decrypt') ||
                                   errorMessage.includes('Session error');
                    
                    if (isBadMac) {
                        // Manejar error de sesión silenciosamente
                        if (handleSessionError(decryptError)) {
                            // Error de sesión manejado, no loguear
                            return;
                        }
                    }
                    
                    // Para otros errores de desencriptación, no propagar (son esperados ocasionalmente)
                    // Solo loguear si no es un error común de desencriptación
                    if (!errorMessage.includes('decrypt') && !errorMessage.includes('session')) {
                        logger.warn('⚠️ Error procesando mensaje:', errorMessage);
                    }
                    return; // No propagar errores de desencriptación
                }
            } catch (error) {
                // Detectar y manejar errores de sesión
                if (!handleSessionError(error)) {
                    logger.error('❌ Error en manejador de mensajes:', error.message);
                }
                metrics.errors++;
            }
        });

        // -------------------------------------------------------------------
        // CREDENTIALS SAVE DEBOUNCE
        // -------------------------------------------------------------------
        let credsSaveTimeout = null;
        sock.ev.on('creds.update', async () => {
            try {
                if (credsSaveTimeout) clearTimeout(credsSaveTimeout);
                credsSaveTimeout = setTimeout(async () => {
                    try {
                        await saveCreds();
                        if (Math.random() < 0.1) logger.info('💾 Credenciales actualizadas y guardadas');
                    } catch (error) {
                        logger.error('❌ Error al guardar credenciales:', error);
                    }
                }, 5_000);
            } catch (error) {
                logger.error('❌ Error en actualización de credenciales:', error);
            }
        });

    } catch (error) {
        isConnecting = false;
        logger.error('\n❌ Error al inicializar el bot:', error.message);
        metrics.errors++;
        
        if (fs.existsSync(CONFIG.sessionPath)) {
            fs.removeSync(CONFIG.sessionPath);
            logger.info('🗑️ Sesión problemática eliminada por error de inicialización');
        }
        
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        
        if (connectionAttempts < 3) {
            const delay = 15_000;
            logger.info(`🔄 Reintentando en ${delay/1000}s...`);
            reconnectTimeout = setTimeout(startBot, delay);
        } else {
            logger.error('\n🚫 Demasiados errores. El bot se reiniciará en 60 segundos...\n');
            consecutiveErrors = 0;
            connectionAttempts = 0;
            setTimeout(startBot, 60_000);
        }
    }
}

// ---------------------------------------------------------------------------
// ADMIN CHECK
// ---------------------------------------------------------------------------
function isAdminMessage(phoneNumber) {
    return CONFIG.adminNumbers.includes(phoneNumber);
}

// ---------------------------------------------------------------------------
// HANDLE ORDER CONFIRMATION
// ---------------------------------------------------------------------------
async function handleOrderConfirmation(from, body, userSession) {
    try {
        if (body === 'si' || body === 'sí' || body === 'yes' || body === 'confirmo' || body === 'ok') {
            logger.info(`✅ Pedido confirmado por ${from}`);
            
            // Si el pedido viene de la web (tiene orderId), ya tiene dirección, ir directo a pago
            if (userSession.pendingOrder?.orderId) {
                userSession.waitingForConfirmation = false;
                userSession.waitingForPayment = true;
                userSession.step = 'payment_selection';
                
                await showPaymentOptions(from, userSession);
            } else {
                // Pedido desde WhatsApp, pedir dirección
                userSession.waitingForConfirmation = false;
                userSession.waitingForAddress = true;
                userSession.step = 'waiting_address';
                
                await sendMessage(from, `✅ ¡Perfecto! Tu pedido está confirmado.

📍 **DIRECCIÓN DE ENTREGA**

Por favor, enviá tu dirección completa para el delivery:

📝 Ejemplo: "Av. San Martín 123, Barrio Centro, entre calles X e Y"

💡 Incluí referencias para que sea más fácil encontrarte.`);
            }
            
        } else if (body === 'no' || body === 'cancel' || body === 'cancelar') {
            logger.info(`❌ Pedido cancelado por ${from}`);
            
            userSession.pendingOrder = null;
            userSession.waitingForConfirmation = false;
            userSession.step = 'welcome';
            
            await sendMessage(from, `❌ Pedido cancelado.

¿Querés hacer otro pedido? Escribí "menú" para ver nuestras opciones.`);
        } else {
            await sendMessage(from, `🤔 No entendí tu respuesta.

Por favor escribí:
✅ "SÍ" para confirmar el pedido
❌ "NO" para cancelar`);
        }
    } catch (error) {
        logger.error('❌ Error al manejar confirmación de pedido:', error);
        await sendMessage(from, '❌ Hubo un error. Por favor, intentá nuevamente.');
    }
}

// ---------------------------------------------------------------------------
// HANDLE ADDRESS INPUT
// ---------------------------------------------------------------------------
async function handleAddressInput(from, messageText, userSession) {
    try {
        if (!messageText || messageText.trim().length < 10) {
            await sendMessage(from, `📍 La dirección parece muy corta.

Por favor, enviá una dirección más completa:

📝 Ejemplo: "Av. San Martín 123, Barrio Centro, entre calles X e Y"

💡 Incluí referencias para facilitar la entrega.`);
            return;
        }
        
        // Guardar dirección en la sesión
        userSession.deliveryAddress = messageText.trim();
        userSession.waitingForAddress = false;
        userSession.waitingForPayment = true;
        userSession.step = 'payment_selection';
        
        logger.info(`📍 Dirección recibida de ${from}: ${messageText}`);
        
        // Mostrar opciones de pago
        await sendMessage(from, `📍 Dirección guardada: ${messageText}

`);
        await showPaymentOptions(from, userSession);
        
    } catch (error) {
        logger.error('❌ Error al manejar dirección:', error);
        await sendMessage(from, '❌ Hubo un error. Por favor, enviá tu dirección nuevamente.');
    }
}

// ---------------------------------------------------------------------------
// HANDLE TRANSFER PROOF
// ---------------------------------------------------------------------------
async function handleTransferProof(from, message, userSession) {
    try {
        logger.info(`📸 Comprobante de pago recibido de ${from}`);
        
        // Usar JID directamente (ya no necesitamos números "limpios")
        const customerJid = from;
        
        // SOLO ACEPTAR IMÁGENES - NO documentos ni texto
        const hasImage = message.message?.imageMessage;
        const hasDocument = message.message?.documentMessage;
        const hasText = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        // Si no es imagen, rechazar
        if (!hasImage) {
            if (hasDocument) {
                await sendMessage(from, '❌ Por favor, enviá una FOTO del comprobante, no un documento.\n\n📸 Tomá una foto del comprobante y enviála acá mismo.');
            } else if (hasText) {
                await sendMessage(from, '❌ Por favor, enviá una FOTO del comprobante de pago.\n\n📸 Tomá una foto del comprobante y enviála acá mismo.\n\n⚠️ Solo se aceptan imágenes.');
            } else {
                await sendMessage(from, '❌ No se detectó ninguna imagen. Por favor, enviá una FOTO del comprobante de pago.\n\n📸 Tomá una foto del comprobante y enviála acá mismo.');
            }
            return;
        }
        
        let proofImageUrl = null;
        
        logger.info(`📸 [TRANSFER PROOF] Detección de imagen: hasImage=${!!hasImage}, imageMessage=${!!message.message?.imageMessage}, documentMessage=${!!message.message?.documentMessage}`);
        
        // Si hay imagen, descargarla y guardarla
        if (hasImage && sock) {
            try {
                const mediaMessage = message.message.imageMessage || message.message.documentMessage;
                
                if (!mediaMessage) {
                    logger.warn('⚠️ [TRANSFER PROOF] MediaMessage es null o undefined');
                } else {
                    logger.info(`📥 [TRANSFER PROOF] Descargando imagen: mimetype=${mediaMessage.mimetype || 'unknown'}, caption=${mediaMessage.caption || 'sin caption'}`);
                    
                const stream = await downloadMediaMessage(
                    message,
                    'buffer',
                    {},
                    { logger },
                    { reuploadRequest: sock.updateMediaMessage }
                );
                
                    if (!stream) {
                        logger.error('❌ [TRANSFER PROOF] Stream es null o undefined');
                    } else {
                // Guardar imagen en carpeta de comprobantes
                const proofDir = path.join(__dirname, '../proofs');
                await fs.ensureDir(proofDir);
                
                        // Determinar extensión basada en mimetype o usar jpg por defecto
                        let extension = 'jpg';
                        if (mediaMessage.mimetype) {
                            if (mediaMessage.mimetype.includes('png')) extension = 'png';
                            else if (mediaMessage.mimetype.includes('jpeg') || mediaMessage.mimetype.includes('jpg')) extension = 'jpg';
                            else if (mediaMessage.mimetype.includes('pdf')) extension = 'pdf';
                        }
                        
                        const fileName = `proof_${Date.now()}_${message.key.id}.${extension}`;
                const filePath = path.join(proofDir, fileName);
                        
                        logger.info(`💾 [TRANSFER PROOF] Guardando imagen en: ${filePath}`);
                await fs.writeFile(filePath, stream);
                
                        // Verificar que el archivo se guardó correctamente
                        const fileExists = await fs.pathExists(filePath);
                        if (!fileExists) {
                            logger.error(`❌ [TRANSFER PROOF] El archivo no se guardó correctamente: ${filePath}`);
                        } else {
                            const stats = await fs.stat(filePath);
                            logger.info(`✅ [TRANSFER PROOF] Imagen guardada correctamente: ${filePath} (${stats.size} bytes)`);
                        }
                        
                        // La URL será relativa al servidor
                        proofImageUrl = `/proofs/${fileName}`;
                        logger.info(`✅ [TRANSFER PROOF] URL del comprobante: ${proofImageUrl}`);
                    }
                }
            } catch (imageError) {
                logger.error('❌ [TRANSFER PROOF] Error al procesar imagen:', imageError);
                logger.error('❌ [TRANSFER PROOF] Stack:', imageError.stack);
                // Continuar sin la imagen pero loguear el error
            }
        } else {
            if (!hasImage) {
                logger.warn('⚠️ [TRANSFER PROOF] No se detectó imagen en el mensaje');
            }
            if (!sock) {
                logger.warn('⚠️ [TRANSFER PROOF] Socket no disponible');
            }
        }
        
        // Si el método de pago es Mercado Pago, verificar el estado del pago primero
        if (userSession.paymentMethod === 'mercadopago' && userSession.pendingOrder?.mercadoPagoPreferenceId) {
            const preferenceId = userSession.pendingOrder.mercadoPagoPreferenceId;
            logger.info(`💰 [Mercado Pago] Verificando estado del pago para preference_id: ${preferenceId}`);
            
            try {
                // Llamar al endpoint del backend para verificar el estado del pago
                const paymentStatus = await apiRequest(`/payments/mercadopago/check-payment/${preferenceId}`);
                
                logger.info(`💰 [Mercado Pago] Estado del pago:`, paymentStatus);
                
                if (paymentStatus && paymentStatus.status === 'approved') {
                    // El pago está aprobado, aprobar el pedido automáticamente
                    logger.info(`✅ [Mercado Pago] Pago aprobado para preference_id: ${preferenceId}`);
                    
                    // Obtener el orderId del pedido pendiente
                    let orderId = null;
                    if (userSession.pendingOrder?.orderId) {
                        orderId = userSession.pendingOrder.orderId;
                    } else {
                        // Buscar el último pedido del usuario usando JID directamente
                        const allOrders = await apiRequest('/orders');
                        const userOrders = allOrders.filter(order => {
                            return order.customer_phone === customerJid;
                        });
                        if (userOrders.length > 0) {
                            const lastOrder = userOrders.sort((a, b) => 
                                new Date(b.created_at) - new Date(a.created_at)
                            )[0];
                            orderId = lastOrder.id;
                        }
                    }
                    
                    if (orderId) {
                        // Aprobar el pedido automáticamente
                        try {
                            await apiRequest(`/orders/${orderId}`, {
                                method: 'PUT',
                                body: JSON.stringify({
                                    status: 'confirmed',
                                    payment_status: 'approved'
                                })
                            });
                            logger.info(`✅ [Mercado Pago] Pedido ${orderId} aprobado automáticamente`);
                            
                            // Resetear sesión
                            userSession.waitingForTransferProof = false;
                            userSession.pendingOrder = null;
                            userSession.paymentMethod = null;
                            userSession.waitingForConfirmation = false;
                            userSession.waitingForPayment = false;
                            userSession.pendingPayment = false;
                            userSession.paymentLink = null;
                            userSession.step = 'welcome';
                            
                            // Enviar mensaje de confirmación
                            await sendMessage(from, `✅ *PAGO APROBADO*

💰 Tu pago de Mercado Pago fue aprobado correctamente.

🍳 Tu pedido está en preparación.

⏱️ Tiempo estimado: 30-45 minutos

¡Te avisamos cuando esté listo! 🚚`);
                            return; // Salir de la función, ya procesamos el pago
                        } catch (error) {
                            logger.error('❌ Error al aprobar pedido:', error);
                        }
                    }
                } else {
                    // El pago no está aprobado aún
                    logger.warn(`⚠️ [Mercado Pago] Pago aún no confirmado para preference_id: ${preferenceId}`);
                    logger.warn(`⚠️ [Mercado Pago] Estado recibido:`, JSON.stringify(paymentStatus, null, 2));
                    
                    // Resetear sesión pero mantener el flujo de pago
                    userSession.waitingForTransferProof = false;
                    
                    // Enviar mensaje indicando que aún no está confirmado
                    const mpLink = userSession.pendingOrder?.mercadoPagoLink || 'el enlace enviado';
                    const orderNumber = userSession.pendingOrder?.orderNumber || 'tu pedido';
                    
                    await sendMessage(from, `⏳ *Pago en verificación*

💰 Estamos verificando tu pago de Mercado Pago para el pedido ${orderNumber}.

Si ya realizaste el pago, puede tardar unos minutos en procesarse. Te notificaremos automáticamente cuando se confirme.

🔄 Escribí "09" si querés cambiar el método de pago.`);
                    return; // Salir de la función
                }
            } catch (error) {
                logger.error('❌ Error al verificar estado del pago de Mercado Pago:', error);
                // Continuar con el flujo normal de transferencia si falla la verificación
            }
        }
        
        // Obtener el orderId del pedido pendiente (para transferencias normales)
        let orderId = null;
        if (userSession.pendingOrder?.orderId) {
            orderId = userSession.pendingOrder.orderId;
        } else {
            // Buscar el último pedido del usuario usando JID directamente
            const allOrders = await apiRequest('/orders');
            const userOrders = allOrders.filter(order => {
                // Buscar por JID directamente (phone ahora contiene el JID completo)
                return order.customer_phone === customerJid;
            });
            if (userOrders.length > 0) {
                const lastOrder = userOrders.sort((a, b) => 
                    new Date(b.created_at) - new Date(a.created_at)
                )[0];
                orderId = lastOrder.id;
            }
        }
        
        if (orderId) {
            // Crear registro de transferencia pendiente
            try {
                const order = await apiRequest(`/orders/${orderId}`);
                logger.info(`📋 [TRANSFER PROOF] Pedido obtenido:`, {
                    id: order.id,
                    customer_phone: order.customer_phone,
                    order_number: order.order_number
                });
                
                // Asegurar que el JID esté guardado SIEMPRE
                if (!order.customer_phone || order.customer_phone === '') {
                    logger.info(`📱 [TRANSFER PROOF] Actualizando JID en pedido ${orderId}: ${customerJid}`);
                    await apiRequest(`/orders/${orderId}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            customer_phone: customerJid
                        })
                    });
                    logger.info(`✅ [TRANSFER PROOF] JID actualizado: ${customerJid}`);
                } else {
                    logger.info(`✅ [TRANSFER PROOF] JID ya existe: ${order.customer_phone}`);
                }
                
                await apiRequest('/pending-transfers', {
                    method: 'POST',
                    body: JSON.stringify({
                        order_id: orderId,
                        amount: order.total || userSession.pendingOrder?.total || 0,
                        status: 'pending',
                        proof_image_url: proofImageUrl
                    })
                });
                logger.info(`✅ Transferencia pendiente creada para pedido ${orderId}`);
            } catch (error) {
                logger.error('❌ Error al crear transferencia pendiente:', error);
            }
            
            // Actualizar estado del pedido - NO aprobar, solo marcar como pending
            // PERO asegurar que el JID esté guardado
            try {
                await apiRequest(`/orders/${orderId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        customer_phone: customerJid, // Asegurar que el JID esté guardado
                        status: 'pending',
                        payment_status: 'pending'
                    })
                });
                logger.info(`✅ [TRANSFER PROOF] Pedido ${orderId} actualizado con JID: ${customerJid}`);
            } catch (error) {
                logger.error('❌ Error al actualizar pedido:', error);
            }
        }
        
        // Marcar que ya no esperamos comprobante
        userSession.waitingForTransferProof = false;
        
        // Resetear sesión después de enviar comprobante
        userSession.pendingOrder = null;
        userSession.paymentMethod = null;
        userSession.waitingForConfirmation = false;
        userSession.waitingForPayment = false;
        userSession.waitingForAddress = false;
        userSession.step = 'welcome';
        userSession.lastOrderProcessed = Date.now(); // Marcar tiempo del último pedido procesado
        
        // Enviar UN SOLO mensaje de confirmación
        await sendMessage(from, `✅ Comprobante recibido correctamente.\n\n🔄 Estamos verificando el pago. Te notificaremos cuando esté confirmado.\n\n⏳ Tu pedido está en espera de aprobación del administrador.\n\n💡 Si necesitás algo más, escribí "hola" para ver las opciones.\n\n¡Gracias por tu paciencia! ❤️`);
        
    } catch (error) {
        logger.error('❌ Error al procesar comprobante:', error);
        await sendMessage(from, '❌ Hubo un error al procesar tu comprobante. Por favor, contactanos directamente.');
    }
}

// ---------------------------------------------------------------------------
// VERIFICAR SI ESTÁ EN FLUJO DE PAGO
// ---------------------------------------------------------------------------
function isInPaymentFlow(userSession) {
    return userSession.waitingForPayment || 
           userSession.waitingForTransferProof || 
           userSession.pendingPayment ||
           (userSession.paymentMethod !== null && userSession.paymentMethod !== undefined);
}

// ---------------------------------------------------------------------------
// OBTENER MENSAJE DE VALIDACIÓN PARA FLUJO DE PAGO
// ---------------------------------------------------------------------------
function getPaymentFlowValidationMessage(userSession) {
    const paymentMethod = userSession.paymentMethod;
    
    if (paymentMethod === 'mercadopago') {
        // Obtener el link de Mercado Pago del pedido pendiente
        const mpLink = userSession.pendingOrder?.mercadoPagoLink || userSession.paymentLink || 'el enlace enviado';
        return `🤔 No entendí tu mensaje.

❗Completa tu pago:

• Método seleccionado: Mercado Pago
• Link: ${mpLink}

📸 Una vez realizado el pago, enviá el comprobante.

🔄 Escribí "09" si querés cambiar el método de pago.`;
    } else if (paymentMethod === 'transfer') {
        const transferData = botMessages.transfer_data || `💵 Datos para transferencia:

🏦 Alias: ELBUENMENU.MP
💰 CVU: 0000003100037891234456`;
        return `🤔 No entendí tu mensaje.

❗Completa tu pago:

• Método seleccionado: Transferencia (CVU)
• ${transferData}

Escribe "09" si querés cambiar el método de pago.`;
    } else if (paymentMethod === 'cash') {
        return `🤔 No entendí tu mensaje.

❗Completa tu pago:

• Método seleccionado: Efectivo

Escribe "09" si querés cambiar el método de pago.`;
    } else {
        // Si está esperando selección de método
        return `🤔 No entendí tu mensaje.

❗Completa tu pago:

Elegí tu método de pago:

1️⃣ Mercado Pago
2️⃣ Transferencia (CVU)
3️⃣ Efectivo
4️⃣ Cancelar pago

Escribe el número de la opción.`;
    }
}

// ---------------------------------------------------------------------------
// SHOW PAYMENT OPTIONS
// ---------------------------------------------------------------------------
async function showPaymentOptions(from, userSession, isChange = false) {
    if (isChange) {
        // Mensaje cuando el usuario cambia el método de pago (escribe "09")
        await sendMessage(from, `🔄 Cambio de método de pago

Elegí tu método de pago:

1️⃣ Mercado Pago
2️⃣ Transferencia (CVU)
3️⃣ Efectivo
4️⃣ Cancelar pago

Escribí el número de la opción.`);
    } else {
        // Mensaje inicial cuando se muestra por primera vez
        await sendMessage(from, `✅ ¡Perfecto! Tu pedido está confirmado.

💳 *MÉTODO DE PAGO*

Elegí cómo querés pagar:

1️⃣ Mercado Pago
2️⃣ Transferencia (CVU)
3️⃣ Efectivo
4️⃣ Cancelar pago

Escribí el número de la opción.`);
    }
}

// ---------------------------------------------------------------------------
// HANDLE PAYMENT SELECTION
// ---------------------------------------------------------------------------
async function handlePaymentSelection(from, body, userSession) {
    try {
        logger.info(`💳 Selección de pago de ${from}: ${body}`);
        
        // Usar JID directamente (ya no necesitamos números "limpios")
        const customerJid = from;
        
        // Manejar opción 09 para cambiar método de pago (solo exactamente "09")
        if (body === '09') {
            userSession.paymentMethod = null;
            userSession.waitingForTransferProof = false;
            userSession.waitingForPayment = true;
            userSession.waitingForComplaint = false;
            await showPaymentOptions(from, userSession, true); // true = es cambio de método
            return;
        }
        
        // Manejar cancelación de pago (opción 4)
        if (body === '4' || body.includes('cancelar') || body.includes('cancel')) {
            userSession.paymentMethod = null;
            userSession.waitingForTransferProof = false;
            userSession.waitingForPayment = false;
            userSession.waitingForComplaint = false;
            userSession.pendingOrder = null;
            userSession.step = 'welcome';
            await sendMessage(from, `❌ Pago cancelado.

¿Querés hacer otro pedido? Escribí "hola" para ver las opciones.`);
            return;
        }
        
        // 1️⃣ Mercado Pago
        if (body === '1' || body.includes('mercado') || body.includes('pago')) {
            userSession.paymentMethod = 'mercadopago';
            userSession.waitingForPayment = false;
            userSession.waitingForTransferProof = true; // Ahora sí esperamos comprobante para verificar
            
            // Generar link de pago de Mercado Pago dinámicamente
            let mercadoPagoLink;
            try {
                // Obtener información del pedido para generar el link
                const orderTotal = userSession.pendingOrder?.total || 0;
                // SIEMPRE usar orderNumber (formato #0005), nunca orderId (UUID)
                let orderNumber = userSession.pendingOrder?.orderNumber;
                
                // Si no hay orderNumber pero hay orderId, buscar el pedido para obtener el orderNumber
                if (!orderNumber && userSession.pendingOrder?.orderId) {
                    try {
                        const order = await apiRequest(`/orders/${userSession.pendingOrder.orderId}`);
                        if (order && order.order_number) {
                            orderNumber = order.order_number;
                            // Actualizar la sesión con el orderNumber correcto
                            if (!userSession.pendingOrder) {
                                userSession.pendingOrder = {};
                            }
                            userSession.pendingOrder.orderNumber = orderNumber;
                            logger.info(`✅ [Mercado Pago] OrderNumber obtenido del pedido: ${orderNumber}`);
                        }
                    } catch (error) {
                        logger.warn(`⚠️ [Mercado Pago] No se pudo obtener orderNumber del pedido: ${error.message}`);
                    }
                }
                
                // Si aún no hay orderNumber, usar un fallback temporal
                if (!orderNumber || orderNumber === 'N/A') {
                    orderNumber = `TEMP-${Date.now()}`;
                    logger.warn(`⚠️ [Mercado Pago] Usando orderNumber temporal: ${orderNumber}`);
                }
                
                // Validar que el monto sea válido
                const validAmount = parseFloat(orderTotal);
                if (isNaN(validAmount) || validAmount <= 0) {
                    throw new Error(`Monto inválido: ${orderTotal}`);
                }
                
                logger.info(`💰 [Mercado Pago] Generando link para pedido ${orderNumber} con monto: $${validAmount}`);
                
                // Llamar al endpoint del backend para generar el link de Mercado Pago
                logger.info(`📡 [Mercado Pago] Llamando a API:`, {
                    endpoint: '/payments/mercadopago/create-preference',
                    amount: validAmount,
                    orderNumber: orderNumber
                });
                
                const mpResponse = await apiRequest('/payments/mercadopago/create-preference', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        amount: validAmount,
                        orderNumber: orderNumber,
                        description: `Pedido ${orderNumber} - El Buen Menú`
                    })
                });
                
                logger.info(`✅ [Mercado Pago] Respuesta completa:`, JSON.stringify(mpResponse, null, 2));
                
                if (mpResponse && mpResponse.init_point) {
                    // Guardar el link y el preference_id en la sesión
                    if (!userSession.pendingOrder) {
                        userSession.pendingOrder = {};
                    }
                    userSession.pendingOrder.mercadoPagoLink = mpResponse.init_point;
                    
                    // Extraer preference_id del link
                    const prefIdMatch = mpResponse.init_point.match(/pref_id=([^&]+)/);
                    if (prefIdMatch && prefIdMatch[1]) {
                        userSession.pendingOrder.mercadoPagoPreferenceId = prefIdMatch[1];
                        logger.info(`✅ [Mercado Pago] Preference ID guardado: ${prefIdMatch[1]}`);
                    } else if (mpResponse.id) {
                        // Si no está en el link, usar el ID de la respuesta
                        userSession.pendingOrder.mercadoPagoPreferenceId = mpResponse.id;
                        logger.info(`✅ [Mercado Pago] Preference ID guardado desde respuesta: ${mpResponse.id}`);
                    }
                    
                    // Marcar que hay un pago pendiente
                    userSession.pendingPayment = true;
                    userSession.paymentLink = mpResponse.init_point;
                    
                    mercadoPagoLink = `💳 Pago con Mercado Pago

🔗 Enlace de pago:

${mpResponse.init_point}

📸 Una vez realizado el pago, enviá el comprobante

(Puede ser captura de pantalla o foto del pago)

🔄 Escribí "09" si querés cambiar el método de pago.`;
                } else {
                    throw new Error('No se pudo generar el link de Mercado Pago - respuesta inválida');
                }
            } catch (error) {
                logger.error('❌ Error al generar link de Mercado Pago:', error);
                logger.error('❌ Stack:', error.stack);
                // No usar fallback - mostrar error y permitir cambiar método
                await sendMessage(from, `❌ Error al generar el link de pago de Mercado Pago.

Por favor, intentá con otro método de pago o escribí "09" para cambiar el método.`);
                userSession.waitingForPayment = true;
                userSession.paymentMethod = null;
                return;
            }
            
            await sendMessage(from, mercadoPagoLink);
            
            // Actualizar pedido en base de datos
            try {
                if (userSession.pendingOrder?.orderId) {
                    await updateWebOrderPayment(from, userSession, 'Mercado Pago');
                } else {
                    await createOrderInDatabase(from, userSession);
                }
                // El pago se aprobará automáticamente cuando Mercado Pago notifique
            } catch (error) {
                logger.error('❌ Error al manejar selección de pago:', error);
                await sendMessage(from, '❌ Hubo un error al procesar tu pedido. Por favor, intentá nuevamente.');
            }
            
        // 2️⃣ Transferencia (CVU)
        } else if (body === '2' || body.includes('transferencia') || body.includes('alias') || body.includes('cvu')) {
            userSession.paymentMethod = 'transfer';
            userSession.waitingForPayment = false;
            userSession.waitingForTransferProof = true; // Esperar comprobante
            
            // Mostrar datos de transferencia
            const transferData = botMessages.transfer_data || `💵 Datos para transferencia:

🏦 Alias: ELBUENMENU.MP
💰 CVU: 0000003100037891234456

📸 Enviá SOLO el comprobante de pago (foto) acá mismo.

⚠️ IMPORTANTE: Solo se aceptan imágenes. No envíes texto ni documentos.

Escribe "09" si querés cambiar el método de pago.`;
            
            await sendMessage(from, transferData);
            
            // Actualizar pedido en base de datos (pero NO confirmar aún)
            try {
                if (userSession.pendingOrder?.orderId) {
                    await updateWebOrderPayment(from, userSession, 'Transferencia');
                } else {
                    await createOrderInDatabase(from, userSession);
                }
                // NO enviar "Pedido recibido" aquí - esperar comprobante
            } catch (error) {
                logger.error('❌ Error al manejar selección de pago:', error);
                await sendMessage(from, '❌ Hubo un error al procesar tu pedido. Por favor, intentá nuevamente.');
            }
            
        // 3️⃣ Efectivo
        } else if (body === '3' || body.includes('efectivo') || body.includes('cash')) {
            // Verificar si el método de pago está deshabilitado para este cliente
            try {
                const customers = await apiRequest('/customers');
                // Buscar cliente por JID directamente
                const customer = customers.find(c => c.phone === customerJid);
                if (customer && customer.disabled_payment_methods) {
                    const disabledMethods = JSON.parse(customer.disabled_payment_methods);
                    if (disabledMethods.includes('efectivo')) {
                        await sendMessage(from, '❌ El método de pago en efectivo no está disponible para tu cuenta. Por favor, elegí otra opción de pago.');
                        return;
                    }
                }
            } catch (error) {
                logger.debug('⚠️ Error al verificar métodos de pago deshabilitados:', error.message);
            }
            
            userSession.paymentMethod = 'cash';
            userSession.waitingForPayment = false;
            
            await sendMessage(from, `✅ Pago en efectivo confirmado.

Escribe "09" si querés cambiar el método de pago.`);
            
            // Si el pedido viene de la web, actualizar el existente; si no, crear uno nuevo
            try {
                if (userSession.pendingOrder?.orderId) {
                    await updateWebOrderPayment(from, userSession, 'Efectivo');
                } else {
                    await createOrderInDatabase(from, userSession);
                }
                await sendMessage(from, botMessages.order_received || 'Pedido recibido');
                
                // Resetear sesión después de crear pedido
                // Limpiar sesión completamente después de procesar pedido en efectivo
                userSession.pendingOrder = null;
                userSession.paymentMethod = null;
                userSession.waitingForConfirmation = false;
                userSession.waitingForPayment = false;
                userSession.waitingForAddress = false;
                userSession.waitingForTransferProof = false;
                userSession.deliveryAddress = null;
                userSession.step = 'welcome';
                userSession.lastOrderProcessed = Date.now(); // Marcar tiempo del último pedido procesado
            } catch (error) {
                logger.error('❌ Error al manejar selección de pago:', error);
            }
            
        } else {
            // Mensaje inválido durante selección de método de pago
            await sendMessage(from, getPaymentFlowValidationMessage(userSession));
        }
    } catch (error) {
        logger.error('❌ Error al manejar selección de pago:', error);
        await sendMessage(from, '❌ Hubo un error al procesar el pago. Por favor, intentá nuevamente.');
    }
}

// ---------------------------------------------------------------------------
// HORARIOS Y ESTADOS DEL SISTEMA
// ---------------------------------------------------------------------------
// Verificar si estamos dentro del horario de atención (18:00-00:00 Argentina GMT-3 o horario especial)
async function isWithinBusinessHours() {
    try {
        const now = new Date();
        // Convertir a hora de Argentina (GMT-3)
        const argentinaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        const hour = argentinaTime.getHours();
        const minute = argentinaTime.getMinutes();
        const currentTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

        // Verificar si hay un horario especial activo
        try {
            const specialHoursResponse = await apiRequest('/system/special-hours');
            logger.debug(`🕒 Verificando horario especial:`, { 
                response: specialHoursResponse, 
                currentTime: currentTime,
                hour,
                minute 
            });
            
            if (specialHoursResponse && specialHoursResponse.isActive) {
                const { startTime, endTime, expiresAt } = specialHoursResponse;
                
                // Verificar que no haya expirado
                if (expiresAt) {
                    const expiresDate = new Date(expiresAt);
                    const now = new Date();
                    if (now > expiresDate) {
                        logger.debug(`⚠️ Horario especial expirado (expira: ${expiresAt}, ahora: ${now.toISOString()})`);
                        // Continuar con horario normal
                    } else {
                        // Convertir horas a minutos para comparar
                        const [startHour, startMin] = startTime.split(':').map(Number);
                        const [endHour, endMin] = endTime.split(':').map(Number);
                        const startMinutes = startHour * 60 + startMin;
                        const endMinutes = endHour * 60 + endMin;
                        const currentMinutes = hour * 60 + minute;

                        logger.info(`🕒 Comparando horario especial:`, {
                            startTime,
                            endTime,
                            startMinutes,
                            endMinutes,
                            currentMinutes,
                            currentTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
                            crossesMidnight: endMinutes < startMinutes,
                            expiresAt
                        });

                        // Si el horario cruza medianoche (ej: 20:00 - 02:00)
                        if (endMinutes < startMinutes) {
                            // Horario que cruza medianoche
                            const isWithin = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
                            logger.info(`✅ Horario especial (cruza medianoche): ${isWithin ? 'ABIERTO' : 'CERRADO'}`);
                            return isWithin;
                        } else {
                            // Horario normal (no cruza medianoche)
                            const isWithin = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
                            logger.info(`✅ Horario especial (normal): ${isWithin ? 'ABIERTO' : 'CERRADO'}`);
                            return isWithin;
                        }
                    }
                } else {
                    // Sin fecha de expiración, usar directamente
                    const [startHour, startMin] = startTime.split(':').map(Number);
                    const [endHour, endMin] = endTime.split(':').map(Number);
                    const startMinutes = startHour * 60 + startMin;
                    const endMinutes = endHour * 60 + endMin;
                    const currentMinutes = hour * 60 + minute;

                    logger.info(`🕒 Comparando horario especial (sin expiración):`, {
                        startTime,
                        endTime,
                        currentTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
                        crossesMidnight: endMinutes < startMinutes
                    });

                    if (endMinutes < startMinutes) {
                        const isWithin = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
                        logger.info(`✅ Horario especial (cruza medianoche, sin expiración): ${isWithin ? 'ABIERTO' : 'CERRADO'}`);
                        return isWithin;
                    } else {
                        const isWithin = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
                        logger.info(`✅ Horario especial (normal, sin expiración): ${isWithin ? 'ABIERTO' : 'CERRADO'}`);
                        return isWithin;
                    }
                }
            } else {
                logger.debug(`⚠️ No hay horario especial activo, usando horario normal`);
            }
        } catch (error) {
            logger.debug('⚠️ Error al verificar horario especial (usando horario normal):', error.message);
        }

        // Horario normal: 18:00 (18) a 00:00 (0)
        const isNormalHours = hour >= 18 || hour === 0; // 18:00-23:59 o 00:00
        logger.debug(`🕒 Horario normal: ${isNormalHours ? 'ABIERTO' : 'CERRADO'} (hora actual: ${currentTime})`);
        return isNormalHours;
    } catch (error) {
        logger.error('❌ Error al verificar horario:', error);
        return true; // Por defecto, permitir mensajes si hay error
    }
}

// Obtener estado del sistema (emergency mode, no stock)
async function getSystemState() {
    try {
        const response = await apiRequest('/system/emergency-state');
        return {
            emergencyMode: response?.emergencyMode || false,
            noStockMode: response?.noStockMode || false
        };
    } catch (error) {
        logger.debug('⚠️ Error al obtener estado del sistema:', error.message);
        return { emergencyMode: false, noStockMode: false };
    }
}

// Verificar si el mensaje es un saludo (equivalente a "hola")
function isGreetingMessage(message) {
    if (!message) return false;
    
    // Normalizar mensaje: eliminar espacios, convertir a minúsculas, eliminar emojis básicos
    const normalized = message.trim().toLowerCase()
        .replace(/[✨🤙😄👋😎🙌👀🤝💪👑🔥😁🫡🫶]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Array de todas las variantes de saludo
    const greetings = [
        'holaa', 'hola', 'holaaa', 'holaaaa', 'ola', 'olaa', 'oola', 'holiii', 'holis', 'holiss', 'holita', 
        'holu', 'holuuu', 'holuwu', 'holis', 'epa', 'epaa', 'epaaa', 'epaaa wacho', 'epaaa rey', 
        'eu', 'euu', 'eeeeey', 'eyy', 'eyyy', 'eyyyy', 'eyyy buenass', 'eiii', 'eeeu', 
        'qe onda', 'q onda', 'q ondaa', 'q ondah', 'q ondulii', 'ondhaa', 'ondaa', 
        'wenas', 'wenass', 'wenaz', 'wenaaa', 'wenas wenas', 'buenas', 'buenasaa', 'buenass', 
        'bueenaa', 'bue', 'bueno', 'buen dia', 'buen diaa', 'bndia', 'bn dia', 'bn diaa', 'bno dia', 
        'buenas noches', 'buenas tardes', 'hola buenas', 'hola buenas noches', 'hola buenas tardes', 
        'hola buen dia', 'hola estas', 'hola', 'hola rey', 'hola reina', 'hola bro', 'hola pa', 
        'hola amigo', 'hola amigaa', 'hola ami', 'hola capo', 'hola kpo', 'ola kpo', 'oli', 'olii', 
        'oliwis', 'oliww', 'holakeace', 'hola ke tal', 'hola q tal', 'ola q tal', 'que tal', 'q tal', 
        'como va', 'como vaa', 'como vamoo', 'como andamoss', 'como andaas', 'que deci', 'q deciss', 
        'q decis man', 'q contaa', 'que contas', 'q conta', 'eehh', 'eaaaa', 'eahh', 'uee', 'uuuuueee', 
        'uuuuuhh hola', 'holaaa wachoo', 'holaa gato', 'hola perri', 'wacho holaa', 'que onda wachin', 
        'que onda pa', 'buenas rey', 'hola pa', 'hola bro', 'hola rey', 'hola crack', 'hola maquina', 
        'hola makinaaaa', 'hola fiera', 'hola titan', 'hola campeon', 'hola leyenda', 'hola mostro', 
        'hola bebito fiu fiu', 'holaaa senor del fuego', 'holaaa maquina', 'holaaa makina', 'holaaa titan', 
        'holaaa mostro', 'hola maquinaaaa', 'holiwiiii', 'holaaa aaaaa', 'euuuuuuuuuuu', 'holaaaa', 
        'estas', 'heyyy', 'heyyy amigo', 'heyyyyyy', 'eyyy tas', 'hola', 'holaaa', 'hola', 
        'q haces', 'q hacessss', 'q haces', 'q ace', 'q aces', 'q acemoss', 'q andas', 'q andas', 
        'q andas vos', 'q andaas', 'q onda lpm', 'buenaz', 'wnaz', 'bns noches', 'bns', 'bn dia', 
        'qhcs', 'kiubo', 'hola disculpa la hora', 'hola te hago una consulta', 'hola todo bien', 
        'hola como estas', 'buenas tenes un segundo', 'buenas consulta', 'hola siguen abiertos', 
        'hola toman pedidos', 'hola hacen envios', 'hola rey todo bien', 'hola querido', 'buenas querido', 
        'eu pa', 'eu bro', 'hola wachin', 'hola wachoo', 'hola bebe', 'holaaaaaa', 'bueeeenas', 
        'bueenassss', 'holaaaaaa genteee', 'holaaa familiaaa', 'holaaaa rey', 'euuu rey', 'holaaa', 
        'holaaa', 'wenas', 'hola jefe', 'hola jefa', 'hola maestro', 'hola maestra', 'hola genio', 
        'hola genius', 'hola crackk', 'hola brooo', 'hola rey rey', 'holaaa mi rey', 'holaaa mi pa', 
        'holaaa mi perri', 'buenas maquina', 'buenas campeon', 'buenas rey', 'buenas bro', 'buenas loco', 
        'buenas wachin', 'buenas wachoo', 'holaaamm', 'holaaaamm', 'holaaa wacho querido', 'q onda guacho', 
        'que onda perro', 'hola amigo mio', 'holaaa', 'eyy', 'holiiiii', 'holaaaa mi rey bello', 
        'holaaa rey del menu', 'eeepa', 'epapaaa', 'epapaaa rey', 'hola rey del fuego', 'hola monstrito', 
        'holaaa tito', 'hola crackito', 'euuuuu amigo', 'epaa amigo', 'hola estimado', 'hola rey maquina ultra pro', 
        'holaa rey del delivery', 'holaaa champion', 'holaaa titanazo', 'buenassss', 'buennnaaa', 
        'wenaaas brooo', 'holaaaaaaaaaaaaa'
    ];
    
    // Verificar coincidencia exacta
    if (greetings.includes(normalized)) {
        return true;
    }
    
    // Verificar si el mensaje comienza con alguna variante
    for (const greeting of greetings) {
        if (normalized.startsWith(greeting) || normalized.includes(greeting)) {
            // Solo considerar si el mensaje es principalmente el saludo
            // (no más de 20 caracteres adicionales después del saludo)
            const remaining = normalized.replace(greeting, '').trim();
            if (remaining.length <= 20 || remaining.length / normalized.length < 0.5) {
                return true;
            }
        }
    }
    
    return false;
}

// Verificar si un mensaje debe ser bloqueado (modo emergencia, sin stock, fuera de horario)
async function shouldBlockMessage(from, isAdmin) {
    // Admins siempre pueden enviar mensajes
    if (isAdmin) {
        return { blocked: false };
    }

    // Verificar horario
    const withinHours = await isWithinBusinessHours();
    if (!withinHours) {
        // Obtener mensaje de horario (normal o especial)
        let hoursMessage = '🕒 Estamos cerrados\n\n⏰ Horario: 18:00 a 00:00\n\n🙏 ¡Gracias por escribir!';
        
        try {
            const specialHoursResponse = await apiRequest('/system/special-hours');
            if (specialHoursResponse && specialHoursResponse.isActive) {
                hoursMessage = `🕒 Estamos cerrados\n\n⏰ Horario especial de hoy: ${specialHoursResponse.startTime} a ${specialHoursResponse.endTime}\n\n🙏 ¡Gracias por escribir!`;
            }
        } catch (error) {
            // Usar mensaje por defecto
        }
        
        return {
            blocked: true,
            message: hoursMessage
        };
    }

    // Verificar estado del sistema (Sin Stock)
    const systemState = await getSystemState();

    // Sin Stock (consolidado - reemplaza Modo Emergencia)
    if (systemState.noStockMode || systemState.emergencyMode) {
        return {
            blocked: true,
            message: `⚠️ ¡NOS QUEDAMOS SIN STOCK!\n\n🙏 Muchas gracias por todos 💛\n\n🕒 Volvemos MAÑANA\n\n⏰ Horario de atención: 18:00 a 00:00`
        };
    }

    return { blocked: false };
}

// ---------------------------------------------------------------------------
// SHOW MAIN MENU (Menú principal profesional)
// ---------------------------------------------------------------------------
async function showMainMenu(from, customerId) {
    try {
        // Obtener información de fidelidad rápida para mostrar en el menú
        let loyaltyDisplay = '';
        try {
            const loyaltyResponse = await apiRequest(`/loyalty/customers/${encodeURIComponent(customerId).replace(/@/g, '%40')}`);
            if (loyaltyResponse && loyaltyResponse.loyalty) {
                const loyalty = loyaltyResponse.loyalty;
                const tierIcons = { bronze: '🟤', silver: '⚪', gold: '🟡', vip: '⭐' };
                const tierNames = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', vip: 'VIP' };
                const tierIcon = tierIcons[loyalty.tier] || '🟤';
                const tierName = tierNames[loyalty.tier] || 'Bronze';
                const points = (loyalty.totalPoints || 0).toLocaleString('es-AR');
                loyaltyDisplay = `⭐ Nivel actual: ${tierName} ${tierIcon}\n\n✨ Puntos disponibles: ${points}\n\n`;
            }
        } catch (error) {
            // Ignorar error, solo no mostrar info de fidelidad
        }
        
        const welcomeMessage = `👋 *¡Bienvenido a El Buen Menú!*\n\n${loyaltyDisplay}📌 *¿Qué necesitás hacer?*\n\n` +
            `*1️⃣* Ver Menú 📋\n` +
            `*2️⃣* Consultar un Pedido 🔍\n` +
            `*3️⃣* Mis Pedidos 📦\n` +
            `*4️⃣* Mi Link de Invitación 🔗\n` +
            `*5️⃣* Mis Puntos ⭐\n` +
            `*6️⃣* Canjear Código 🎟️\n` +
            `*7️⃣* Enviar Reclamo 📝\n` +
            `*8️⃣* Ver Horarios 🕒\n` +
            `*9️⃣* ¿Cómo usar el bot? ❓\n\n` +
            `💡 Podés responder con el *número* o la *palabra clave*.`;
        
        await sendMessage(from, welcomeMessage);
    } catch (error) {
        logger.error('❌ Error mostrando menú principal:', error);
        // Fallback a menú simple
        const fallbackMessage = `👋 *¡Bienvenido a El Buen Menú!*\n\n📌 *¿Qué necesitás hacer?*\n\n1️⃣ Ver Menú 📋\n2️⃣ Consultar un Pedido 🔍\n3️⃣ Mis Pedidos 📦\n4️⃣ Mi Link de Invitación 🔗\n5️⃣ Mis Puntos ⭐\n6️⃣ Canjear Código 🎟️\n7️⃣ Enviar Reclamo 📝\n8️⃣ Ver Horarios 🕒\n9️⃣ ¿Cómo usar el bot? ❓\n\n💡 Podés responder con el *número* o la *palabra clave*.`;
        await sendMessage(from, fallbackMessage);
    }
}

// ---------------------------------------------------------------------------
// VALIDATE ORDER QUERY WITH IUC (Validar consulta de pedido con IUC)
// ---------------------------------------------------------------------------
async function validateOrderQueryWithIUC(from, messageText, customerJid) {
    try {
        logger.info(`🔍 [VALIDATE IUC] Validando mensaje de ${from}`);
        logger.info(`🔍 [VALIDATE IUC] Mensaje: "${messageText}"`);
        logger.info(`🔍 [VALIDATE IUC] JID: ${customerJid}`);
        
        // Verificar si es un pedido nuevo sin IUC (desde checkout web) - PRIMERO
        const isNewWebOrder = messageText.includes('Código de pedido:') && 
                             (messageText.includes('Tu identificador único (IUC) se te asignará') ||
                              messageText.includes('se te asignará cuando el pedido sea aprobado') ||
                              messageText.includes('PEDIDO CONFIRMADO - El Buen Menú'));
        
        if (isNewWebOrder) {
            // Es un pedido nuevo desde la web, no requiere IUC aún
            logger.info(`✅ [VALIDATE IUC] Pedido nuevo detectado (sin IUC requerido): ${from}`);
            return { valid: true, isNewOrder: true };
        }
        
        // Verificar si el cliente está bloqueado
        const customers = await apiRequest('/customers');
        const customer = customers.find(c => c.phone === customerJid);
        
        if (customer && customer.baneado_hasta) {
            const bannedUntil = new Date(customer.baneado_hasta);
            const now = new Date();
            
            if (bannedUntil > now) {
                const hoursRemaining = Math.ceil((bannedUntil - now) / (1000 * 60 * 60));
                const daysRemaining = Math.ceil(hoursRemaining / 24);
                
                if (daysRemaining >= 5) {
                    await sendMessage(from, `🚫 *Bloqueo temporal aumentado*\n\nDetectamos un segundo intento de manipulación del sistema.\n\nTu cuenta fue bloqueada por 5 días.\n\nSi creés que es un error, contactá con soporte.`);
                } else {
                    await sendMessage(from, `⚠️ *Seguridad activada*\n\nDetectamos demasiados intentos de consulta inválidos.\n\nTu cuenta fue bloqueada por 24 horas por protección del sistema.`);
                }
                return { valid: false, blocked: true };
            } else {
                // Desbloquear cliente si el tiempo de bloqueo expiró
                try {
                    await apiRequest(`/customers/${customer.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            baneado_hasta: null,
                            intentos_invalidos: 0,
                            ultimo_intento: null
                        })
                    });
                } catch (error) {
                    logger.error('Error desbloqueando cliente:', error);
                }
            }
        }
        
        // Validar formato del mensaje: PEDIDO CONFIRMADO - XXXX - El Buen Menú
        // El código XXXX ahora es el unique_code del pedido, no el IUC del cliente
        const orderPattern = /PEDIDO CONFIRMADO\s*-\s*(\d{4})\s*-\s*El Buen Menú/i;
        const match = messageText.match(orderPattern);
        
        if (!match) {
            // Formato inválido - incrementar intentos
            if (customer) {
                const newAttempts = (customer.intentos_invalidos || 0) + 1;
                const now = new Date();
                const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                
                // Resetear intentos si pasó más de 1 hora desde el último intento
                let attemptsToRecord = newAttempts;
                let lastAttemptTime = now.toISOString();
                
                if (customer.ultimo_intento) {
                    const lastAttempt = new Date(customer.ultimo_intento);
                    if (lastAttempt < oneHourAgo) {
                        attemptsToRecord = 1;
                    }
                }
                
                // Verificar si necesita ban (5 intentos en 1 hora)
                let banUntil = null;
                if (attemptsToRecord >= 5) {
                    // Verificar si ya fue baneado antes (reincidencia)
                    const wasBannedBefore = customer.baneado_hasta && new Date(customer.baneado_hasta) > new Date();
                    const banDays = wasBannedBefore ? 5 : 1;
                    banUntil = new Date(now.getTime() + banDays * 24 * 60 * 60 * 1000);
                }
                
                try {
                    await apiRequest(`/customers/${customer.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            intentos_invalidos: attemptsToRecord,
                            ultimo_intento: lastAttemptTime,
                            baneado_hasta: banUntil
                        })
                    });
                } catch (error) {
                    logger.error('Error actualizando intentos inválidos:', error);
                }
                
                if (attemptsToRecord >= 5) {
                    const banMessage = wasBannedBefore 
                        ? `🚫 *Bloqueo temporal aumentado*\n\nDetectamos un segundo intento de manipulación del sistema.\n\nTu cuenta fue bloqueada por 5 días.\n\nSi creés que es un error, contactá con soporte.`
                        : `⚠️ *Seguridad activada*\n\nDetectamos demasiados intentos de consulta inválidos.\n\nTu cuenta fue bloqueada por 24 horas por protección del sistema.\n\n⚠ Estos intentos inválidos son:\n\n• Mensaje sin IUC\n• IUC incorrecto\n• Formato alterado\n• Pedido inexistente\n• Pedido de otro cliente`;
                    
                    await sendMessage(from, banMessage);
                    return { valid: false, blocked: true };
                }
            }
            
            await sendMessage(from, `⚠️ *Error de validación*\n\nEl formato del mensaje no es correcto.\n\nRecordá: *PEDIDO CONFIRMADO - XXXX - El Buen Menú*\n\nDonde XXXX es el código único de 4 dígitos que recibiste al crear el pedido.\n\nIntento ${(customer?.intentos_invalidos || 0) + 1}/5.`);
            return { valid: false };
        }
        
        const uniqueCodeFromMessage = match[1];
        
        // Buscar el pedido por su código único (unique_code)
        try {
            const allOrders = await apiRequest('/orders');
            const orderWithCode = allOrders.find(order => order.unique_code === uniqueCodeFromMessage);
            
            if (!orderWithCode) {
                logger.warn(`⚠️ No se encontró pedido con código único: ${uniqueCodeFromMessage}`);
                await sendMessage(from, `⚠️ *Error de validación*\n\nNo se encontró un pedido con el código ${uniqueCodeFromMessage}.\n\nVerificá que el código sea correcto.`);
                return { valid: false };
            }
            
            // Verificar que el pedido pertenezca al cliente (si tiene customer_phone asignado)
            // Si customer_phone es null, es un pedido nuevo y se puede procesar
            if (orderWithCode.customer_phone && orderWithCode.customer_phone !== '' && orderWithCode.customer_phone !== customerJid) {
                logger.warn(`⚠️ Pedido ${orderWithCode.order_number} pertenece a otro cliente. Order phone: "${orderWithCode.customer_phone}", Customer JID: "${customerJid}"`);
                await sendMessage(from, `⚠️ *Error de validación*\n\nEste pedido no pertenece a tu cuenta.\n\nSolo podés consultar tus propios pedidos.`);
                return { valid: false };
            }
            
            // Si llegamos aquí, el código único es válido y el pedido pertenece al cliente (o es nuevo)
            logger.info(`✅ Código único válido: ${uniqueCodeFromMessage} para pedido ${orderWithCode.order_number}`);
        } catch (error) {
            logger.error('❌ Error al buscar pedido por código único:', error);
            await sendMessage(from, `⚠️ *Error de validación*\n\nNo se pudo verificar el código del pedido.\n\nPor favor, intentá nuevamente.`);
            return { valid: false };
        }
        
        // Resetear intentos si la validación fue exitosa
        if (customer && (customer.intentos_invalidos > 0 || customer.ultimo_intento)) {
            try {
                await apiRequest(`/customers/${customer.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        intentos_invalidos: 0,
                        ultimo_intento: null
                    })
                });
            } catch (error) {
                logger.error('Error reseteando intentos inválidos:', error);
            }
        }
        
        return { valid: true, uniqueCode: uniqueCodeFromMessage };
    } catch (error) {
        logger.error('❌ Error validando consulta de pedido con IUC:', error);
        logger.error('❌ Stack:', error.stack);
        logger.error('❌ Mensaje que causó el error:', messageText);
        
        // Si hay un error pero el mensaje parece ser un pedido nuevo, permitirlo
        if (messageText && messageText.includes('Código de pedido:')) {
            logger.warn('⚠️ Error en validación pero mensaje parece ser pedido nuevo, permitiendo...');
            return { valid: true, isNewOrder: true, error: true };
        }
        
        return { valid: false, error: true };
    }
}

// ---------------------------------------------------------------------------
// HANDLE BOT HELP (Guía de cómo usar el bot)
// ---------------------------------------------------------------------------
async function handleBotHelp(from) {
    try {
        const helpMessage = `❓ *¿CÓMO USAR EL BOT?*\n\n` +
            `📖 *GUÍA COMPLETA*\n\n` +
            `*🎯 COMANDOS PRINCIPALES:*\n\n` +
            `• Escribí *"hola"* o *"menu"* para ver todas las opciones\n` +
            `• Escribí el *número* (1, 2, 3...) o la *palabra clave* de la opción\n\n` +
            `*📋 OPCIONES DEL MENÚ:*\n\n` +
            `*1️⃣ Ver Menú*\n` +
            `Te muestra nuestro menú completo con precios.\n` +
            `Ejemplo: escribe "1" o "menu" o "ver menu"\n\n` +
            `*2️⃣ Consultar un Pedido*\n` +
            `Consulta el estado de tu pedido por su número.\n` +
            `Ejemplo: escribe "2" o "#0001" o "0001"\n\n` +
            `*3️⃣ Mis Pedidos*\n` +
            `Ver todos tus pedidos realizados.\n` +
            `Ejemplo: escribe "3" o "mis pedidos" o "historial"\n\n` +
            `*4️⃣ Mi Link de Invitación*\n` +
            `Obtiene tu link único para invitar amigos y ganar puntos.\n` +
            `Ejemplo: escribe "4" o "link" o "invitar"\n\n` +
            `*5️⃣ Mis Puntos*\n` +
            `Consulta tus puntos de fidelidad y nivel actual.\n` +
            `Ejemplo: escribe "5" o "puntos" o "mi nivel"\n\n` +
            `*6️⃣ Canjear Código*\n` +
            `Canjea un código promocional.\n` +
            `Ejemplo: escribe "6" o "/canjear CODIGO" o "canjear CODIGO"\n\n` +
            `*7️⃣ Enviar Reclamo*\n` +
            `Envía un reclamo o queja.\n` +
            `Ejemplo: escribe "7" o "reclamo" o "problema"\n\n` +
            `*8️⃣ Ver Horarios*\n` +
            `Consulta nuestros horarios de atención.\n` +
            `Ejemplo: escribe "8" o "horarios"\n\n` +
            `*🛒 CÓMO HACER UN PEDIDO:*\n\n` +
            `*Opción 1: Desde la Web (Recomendado)*\n` +
            `1. Escribí "1" o "menu" para ver el menú\n` +
            `2. Entrá al link que te proporcionamos\n` +
            `3. Agregá productos al carrito\n` +
            `4. Elegí método de pago y confirmá\n` +
            `5. Te llegará la confirmación por WhatsApp\n\n` +
            `*Opción 2: Desde WhatsApp*\n` +
            `1. Escribí "1" o "menu" para ver las opciones\n` +
            `2. Decime qué querés pedir (ej: "2 pizzas muzzarella")\n` +
            `3. Te guiaré paso a paso para completar tu pedido\n\n` +
            `*💳 MÉTODOS DE PAGO:*\n\n` +
            `• *Transferencia bancaria*: Te enviaremos los datos\n` +
            `• *Mercado Pago*: Te generamos un link de pago\n` +
            `• *Efectivo*: Pagás cuando recibas el pedido\n\n` +
            `*⭐ SISTEMA DE PUNTOS:*\n\n` +
            `• Ganás puntos por cada compra\n` +
            `• Podés invitar amigos y ganar más puntos\n` +
            `• Canjeá códigos promocionales\n` +
            `• Subí de nivel y obtené descuentos\n\n` +
            `*🎁 COMANDOS ESPECIALES:*\n\n` +
            `• *"/canjear CODIGO"* - Canjear código promocional\n` +
            `• *"/referidos"* - Ver tu lista de invitados\n` +
            `• *"mis puntos"* - Ver tus puntos y nivel\n` +
            `• *"hola"* - Volver al menú principal\n\n` +
            `*💡 TIPS:*\n\n` +
            `• Siempre podés escribir "hola" para volver al menú\n` +
            `• Si no entendés algo, escribí "9" para ver esta ayuda\n` +
            `• Los pedidos por web son más rápidos\n` +
            `• Podés consultar tus pedidos en cualquier momento\n\n` +
            `*❓ ¿NECESITÁS AYUDA?*\n\n` +
            `Si tenés alguna duda, escribí "reclamo" o "ayuda" y te ayudaremos.\n\n` +
            `¡Esperamos que disfrutes de El Buen Menú! 🍔❤️`;
        
        await sendMessage(from, helpMessage);
    } catch (error) {
        logger.error('❌ Error mostrando ayuda del bot:', error);
        await sendMessage(from, `❓ *AYUDA*\n\nEscribí "hola" para ver el menú principal.\n\nO escribí el número de la opción que necesitás:\n\n1️⃣ Ver Menú\n2️⃣ Consultar Pedido\n3️⃣ Mis Pedidos\n4️⃣ Link de Invitación\n5️⃣ Mis Puntos\n6️⃣ Canjear Código\n7️⃣ Reclamo\n8️⃣ Horarios`);
    }
}

// ---------------------------------------------------------------------------
// HANDLE COMPLAINT SUBMISSION (Manejo de reclamos)
// ---------------------------------------------------------------------------
async function handleComplaintSubmission(from, customerId, complaintText, userSession) {
    try {
        logger.info(`📝 Reclamo recibido de ${customerId}: ${complaintText.substring(0, 50)}...`);
        
        if (!complaintText || complaintText.trim().length < 10) {
            await sendMessage(from, `❌ El reclamo es muy corto. Por favor, describí tu problema con más detalle.\n\n💡 Incluí:\n• Número de pedido (si aplica)\n• Descripción del problema\n• Fecha y hora\n• Cualquier detalle adicional`);
            return;
        }
        
        // Obtener información del cliente
        let customerName = 'Cliente';
        try {
            const customers = await apiRequest('/customers');
            const customer = customers.find(c => c.phone === customerId);
            if (customer && customer.name) {
                customerName = customer.name;
            }
        } catch (error) {
            // Ignorar error
        }
        
        // Guardar reclamo en base de datos (crear tabla si no existe)
        try {
            // Intentar guardar en una tabla de reclamos
            // Por ahora guardamos en mensajes para que quede registrado
            await saveMessageToSupabase({
                phone_number: customerId,
                message: `[RECLAMO] ${complaintText}`,
                direction: 'incoming',
                status: 'complaint',
                created_at: new Date().toISOString()
            });
            
            // También podemos crear un registro especial en orders o customers
            // Por ahora solo confirmamos al cliente
        } catch (error) {
            logger.error('❌ Error guardando reclamo:', error);
        }
        
        // Enviar confirmación al cliente
        await sendMessage(from, `✅ *Reclamo registrado correctamente*\n\n📝 Tu mensaje fue recibido y será revisado por nuestro equipo.\n\n⏱️ Te responderemos a la brevedad.\n\n💡 Tu número de referencia: ${customerId.split('@')[0].substring(0, 8)}...\n\n📞 Si es urgente, contactanos directamente.\n\n🙏 ¡Gracias por tu paciencia!`);
        
        // Notificar a admins (opcional)
        try {
            const adminNumbers = CONFIG.adminNumbers || [];
            for (const adminNum of adminNumbers) {
                try {
                    const adminJid = adminNum.includes('@') ? adminNum : `${adminNum}@s.whatsapp.net`;
                    await sendMessage(adminJid, `🚨 *NUEVO RECLAMO*\n\n👤 Cliente: ${customerName}\n📱 ID: ${customerId}\n\n📝 Reclamo:\n${complaintText}\n\n⏰ Fecha: ${new Date().toLocaleString('es-AR')}`);
                } catch (error) {
                    logger.debug('Error notificando admin:', error.message);
                }
            }
        } catch (error) {
            logger.debug('Error enviando notificación a admins:', error.message);
        }
        
        // Resetear estado
        userSession.waitingForComplaint = false;
        userSession.step = 'welcome';
        
    } catch (error) {
        logger.error('❌ Error procesando reclamo:', error);
        await sendMessage(from, '❌ Hubo un error al registrar tu reclamo. Por favor, intentá nuevamente o contactanos directamente.');
        userSession.waitingForComplaint = false;
    }
}

// ---------------------------------------------------------------------------
// HANDLE REFERRAL LINK (Obtener link de invitación)
// ---------------------------------------------------------------------------
async function handleReferralLink(from, customerId) {
    try {
        logger.info(`🔗 Solicitud de link de invitación de ${customerId}`);
        
        const referralLink = `elbuemenu.app/invitar/?ref=${customerId}`;
        
        // Obtener información de fidelidad para mostrar estadísticas
        let referralsCount = 0;
        let pointsFromReferrals = 0;
        try {
            const loyaltyResponse = await apiRequest(`/loyalty/customers/${encodeURIComponent(customerId).replace(/@/g, '%40')}`);
            if (loyaltyResponse && loyaltyResponse.loyalty) {
                referralsCount = loyaltyResponse.loyalty.totalReferrals || 0;
                // Obtener puntos ganados por referidos
                const referrals = await apiRequest(`/loyalty/referrals?referrerId=${encodeURIComponent(customerId).replace(/@/g, '%40')}`);
                if (referrals && referrals.referrals) {
                    pointsFromReferrals = referrals.referrals
                        .filter(r => r.status === 'validated')
                        .reduce((sum, r) => sum + (r.pointsAwarded || 0), 0);
                }
            }
        } catch (error) {
            // Ignorar error, solo no mostrar estadísticas
        }
        
        let message = `🔗 *Tu Link de Invitación*\n\n` +
            `Compartilo con tus amigos y ganá puntos cuando hagan su primera compra.\n\n` +
            `👉 ${referralLink}\n\n` +
            `🎁 *Recompensas:*\n` +
            `• Ganás +100 puntos por cada amigo que compre\n` +
            `• Tu amigo recibe +5 puntos por ser cliente nuevo\n\n`;
        
        if (referralsCount > 0) {
            message += `📊 *Tu progreso:*\n` +
                `• Invitados validados: ${referralsCount}\n` +
                `• Puntos ganados: +${pointsFromReferrals}\n\n`;
        }
        
        message += `🔥 Invitá y subí de nivel más rápido.\n\n` +
            `💡 También podés escribir "/referidos" para ver tu lista de invitados.`;
        
        await sendMessage(from, message);
        
    } catch (error) {
        logger.error('❌ Error obteniendo link de invitación:', error);
        await sendMessage(from, `🔗 *Tu Link de Invitación*\n\n👉 elbuemenu.app/invitar/?ref=${customerId}\n\n💡 Compartí este link con tus amigos para ganar puntos!`);
    }
}

// ---------------------------------------------------------------------------
// HANDLE REFERRALS LIST (Ver lista de referidos)
// ---------------------------------------------------------------------------
async function handleReferralsList(from, customerId) {
    try {
        logger.info(`👥 Consulta de referidos de ${customerId}`);
        
        // Obtener referidos del cliente
        const referralsResponse = await apiRequest(`/loyalty/referrals?referrerId=${encodeURIComponent(customerId).replace(/@/g, '%40')}`);
        
        if (!referralsResponse || !referralsResponse.referrals || referralsResponse.referrals.length === 0) {
            await sendMessage(from, `👥 *Tus Referidos*\n\n📭 Aún no tenés referidos validados.\n\n💡 Compartí tu link de invitación para empezar a ganar puntos!\n\n🔗 Escribí "4" o "link" para obtener tu link.`);
            return;
        }
        
        const referrals = referralsResponse.referrals.filter(r => r.status === 'validated');
        
        if (referrals.length === 0) {
            await sendMessage(from, `👥 *Tus Referidos*\n\n📭 Aún no tenés referidos validados.\n\n💡 Compartí tu link de invitación para empezar a ganar puntos!\n\n🔗 Escribí "4" o "link" para obtener tu link.`);
            return;
        }
        
        let message = `👥 *Tus Referidos Validados*\n\n`;
        
        let totalPoints = 0;
        
        // Usar for...of para poder usar await
        for (let index = 0; index < referrals.length; index++) {
            const referral = referrals[index];
            const points = referral.pointsAwarded || 100;
            totalPoints += points;
            const referredIdShort = referral.referredId ? referral.referredId.split('@')[0].substring(0, 8) + '...' : 'N/A';
            
            // Obtener número de pedido si está disponible
            let orderNumber = 'N/A';
            if (referral.validationOrderId) {
              try {
                const order = await apiRequest(`/orders/${referral.validationOrderId}`);
                if (order && order.order_number) {
                  orderNumber = order.order_number;
                } else {
                  // Si no se puede obtener, usar el ID corto
                  orderNumber = `#${referral.validationOrderId.substring(0, 4)}`;
                }
              } catch (error) {
                // Si falla, usar el ID corto
                orderNumber = `#${referral.validationOrderId.substring(0, 4)}`;
              }
            }
            
            const date = referral.validatedAt ? new Date(referral.validatedAt).toLocaleDateString('es-AR') : 'N/A';
            
            message += `${index + 1}. ${referredIdShort}\n`;
            message += `   ✔ Pedido validado ${orderNumber}\n`;
            message += `   📅 ${date}\n`;
            message += `   🏆 +${points} pts\n\n`;
        }
        
        message += `💰 *Total ganado por referidos: +${totalPoints} pts*\n\n`;
        message += `🔗 Escribí "4" o "link" para obtener tu link de invitación.`;
        
        await sendMessage(from, message);
        
    } catch (error) {
        logger.error('❌ Error obteniendo lista de referidos:', error);
        await sendMessage(from, '❌ Hubo un error al consultar tus referidos. Por favor, intentá más tarde.');
    }
}

// ---------------------------------------------------------------------------
// HANDLE LOYALTY STATUS (Mis puntos, Mi nivel)
// ---------------------------------------------------------------------------
async function handleLoyaltyStatus(from, customerId) {
    try {
        logger.info(`⭐ Consulta de fidelidad de ${customerId}`);
        
        // Obtener información de fidelidad del cliente
        const loyaltyResponse = await apiRequest(`/loyalty/customers/${encodeURIComponent(customerId)}`);
        
        if (!loyaltyResponse || !loyaltyResponse.loyalty) {
            await sendMessage(from, `⭐ *SISTEMA DE FIDELIDAD*\n\n🎯 Tu nivel actual: Bronze\n\n💰 Puntos: 0\n\n🔗 Link de invitación:\nelbuemenu.app/invitar/?ref=${customerId}\n\n📱 ID: ${customerId}\n\n💡 Hacé tu primer pedido para empezar a ganar puntos!`);
            return;
        }
        
        const loyalty = loyaltyResponse.loyalty;
        
        // Configuración de niveles
        const TIER_ICONS = {
            bronze: '🟤',
            silver: '⚪',
            gold: '🟡',
            vip: '⭐'
        };
        
        const TIER_LABELS = {
            bronze: 'Bronze',
            silver: 'Silver',
            gold: 'Gold',
            vip: 'VIP'
        };
        
        const currentTier = loyalty.tier || 'bronze';
        const currentPoints = loyalty.totalPoints || 0;
        const nextTier = loyalty.nextTier;
        
        // Calcular progreso
        let progressBar = '';
        let pointsNeeded = 0;
        let nextTierName = '';
        
        if (nextTier) {
            pointsNeeded = nextTier.pointsNeeded;
            nextTierName = TIER_LABELS[nextTier.tier] || nextTier.tier;
            const progress = Math.min(100, (currentPoints / nextTier.config.pointsRequired) * 100);
            const filledBlocks = Math.floor(progress / 10);
            const emptyBlocks = 10 - filledBlocks;
            progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks) + ` ${progress.toFixed(0)}%`;
        } else {
            // Ya es VIP
            progressBar = '█'.repeat(10) + ' 100%';
        }
        
        // Construir mensaje
        let message = `⭐ *TU NIVEL ACTUAL: ${TIER_LABELS[currentTier] || currentTier}* ${TIER_ICONS[currentTier] || ''}\n\n`;
        message += `💰 *Puntos totales:* ${currentPoints.toLocaleString('es-AR')}\n\n`;
        
        if (nextTier && pointsNeeded > 0) {
            message += `🔥 *Te faltan ${pointsNeeded} pts para subir a ${nextTierName}*\n\n`;
            message += `📊 Progreso: ${progressBar}\n\n`;
        } else {
            message += `🏆 *¡SOS VIP! Ya alcanzaste el nivel máximo*\n\n`;
        }
        
        message += `📈 *Estadísticas:*\n`;
        message += `• Pedidos realizados: ${loyalty.totalOrders || 0}\n`;
        message += `• Total gastado: $${(loyalty.totalSpent || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        message += `• Referidos: ${loyalty.totalReferrals || 0}\n`;
        
        if (loyalty.discountPercentage > 0) {
            message += `• Descuento: ${loyalty.discountPercentage}% OFF\n`;
        }
        
        if (loyalty.priority) {
            message += `• 🚀 Prioridad en cocina\n`;
        }
        
        message += `\n🔗 *Tu link de invitación:*\n`;
        message += `elbuemenu.app/invitar/?ref=${customerId}\n\n`;
        message += `💡 *Compartí tu link y ganá 100 pts por cada referido válido*\n\n`;
        message += `🎟️ *Canjeá códigos:* /canjear CODIGO\n\n`;
        message += `📱 ID: ${customerId}`;
        
        await sendMessage(from, message);
        
    } catch (error) {
        logger.error('❌ Error al obtener estado de fidelidad:', error);
        await sendMessage(from, '❌ Hubo un error al consultar tu información de fidelidad. Por favor, intentá más tarde.');
    }
}

// ---------------------------------------------------------------------------
// HANDLE PROMO CODE REDEEM (Canjear código promocional)
// ---------------------------------------------------------------------------
async function handlePromoCodeRedeem(from, customerId, code) {
    try {
        logger.info(`🎟️ Canje de código promocional: ${code} por ${customerId}`);
        
        // Validar y canjear código
        const response = await apiRequest('/loyalty/promo-codes/redeem', {
            method: 'POST',
            body: JSON.stringify({
                code: code.toUpperCase().trim(),
                customerId: customerId
            })
        });
        
        if (!response || !response.success) {
            const errorMsg = response?.error || 'Error desconocido';
            await sendMessage(from, `❌ Error al canjear código: ${errorMsg}\n\n💡 Verificá que:\n• El código sea correcto\n• No haya expirado\n• No lo hayas usado ya\n• Tu nivel permita usarlo`);
            return;
        }
        
        const promoCode = response.promoCode;
        let message = `🎉 *¡Código aplicado correctamente!*\n\n`;
        
        // Construir mensaje según tipo de código
        if (promoCode.type === 'discount_percent') {
            message += `💰 Descuento: -${promoCode.value}% OFF\n\n`;
            message += `💡 Este descuento se aplicará en tu próximo pedido\n\n`;
        } else if (promoCode.type === 'discount_fixed') {
            message += `💰 Descuento: -$${promoCode.value} OFF\n\n`;
            message += `💡 Este descuento se aplicará en tu próximo pedido\n\n`;
        } else if (promoCode.type === 'bonus_points') {
            const pointsAwarded = response.pointsAwarded || promoCode.value;
            message += `⭐ Puntos extra: +${pointsAwarded} puntos\n\n`;
            message += `💡 Tus puntos se actualizaron automáticamente\n\n`;
        } else if (promoCode.type === 'free_product') {
            message += `🎁 Producto gratis: ${promoCode.description || 'Producto especial'}\n\n`;
            message += `💡 Mencioná este código al hacer tu pedido\n\n`;
        } else {
            message += `✅ Beneficio: ${promoCode.description || 'Beneficio aplicado'}\n\n`;
        }
        
        if (promoCode.description) {
            message += `📝 *${promoCode.description}*\n\n`;
        }
        
        message += `🎟️ Código: *${promoCode.code}*\n\n`;
        message += `💡 Escribí "mis puntos" para ver tus puntos actualizados`;
        
        await sendMessage(from, message);
        
    } catch (error) {
        logger.error('❌ Error al canjear código promocional:', error);
        await sendMessage(from, '❌ Hubo un error al canjear el código. Por favor, verificá que el código sea correcto e intentá nuevamente.');
    }
}

// ---------------------------------------------------------------------------
// CENTRAL MESSAGE HANDLER
// ---------------------------------------------------------------------------
async function handleMessage(message) {
    try {
        // Validar que el mensaje tenga la estructura correcta
        if (!message || !message.key || !message.key.remoteJid) {
            logger.warn('⚠️ Mensaje inválido recibido');
            return;
        }

        const from = message.key.remoteJid;
        const messageText = message.message?.conversation || 
                           message.message?.extendedTextMessage?.text || 
                           '';
        const body = messageText.trim().toLowerCase();
        
        // Validar que tengamos información básica
        if (!from) {
            logger.warn('⚠️ Mensaje sin remitente');
            return;
        }

        // Usar JID directamente (ya no usamos números "limpios")
        const customerJid = from; // Usar JID completo directamente
        
        // Verificar si es admin
        const isAdmin = isAdminMessage(customerJid) || isAdminMessage(from);
        
        // Verificar si el mensaje debe ser bloqueado (horario, modo emergencia, sin stock)
        const blockCheck = await shouldBlockMessage(from, isAdmin);
        if (blockCheck.blocked) {
            logger.info(`🚫 Mensaje bloqueado de ${customerJid}: ${blockCheck.reason || 'modo emergencia/sin stock/fuera horario'}`);
            await sendMessage(from, blockCheck.message);
            return; // No procesar el mensaje
        }
        
        logger.info(`📱 Mensaje de ${customerJid}: "${messageText}"`);
        
        // Obtener nombre del contacto si está disponible
        let contactName = null;
        try {
            // Intentar obtener el nombre del pushName del mensaje (nombre de perfil de WhatsApp)
            if (message?.pushName) {
                contactName = message.pushName;
                logger.debug(`✅ Nombre obtenido del pushName: ${contactName}`);
            }
        } catch (error) {
            // Ignorar errores al obtener nombre - no es crítico
            logger.debug(`⚠️ No se pudo obtener nombre para ${customerJid}: ${error.message}`);
        }
        
        // ========== DETECCIÓN DE SPAM ==========
        // Para detección de spam, usar JID directamente
        if (messageText && !customerJid.includes('@g.us')) {
            const spamAnalysis = await analyzeSpam(customerJid, messageText);
            
            if (spamAnalysis.isSpam) {
                logger.warn(`🚫 SPAM detectado de ${customerJid}: ${spamAnalysis.reason}`);
                
                // Si es rate limit excedido, informar al usuario
                if (spamAnalysis.action === 'rate_limit_exceeded') {
                    const waitMinutes = Math.ceil(spamAnalysis.waitSeconds / 60);
                    await sendMessage(from, `⚠️ Estás enviando mensajes muy rápido. Por favor esperá ${waitMinutes} minutos antes de enviar otro mensaje.`);
                } else if (spamAnalysis.action === 'repeated_message') {
                    await sendMessage(from, `⚠️ Detectamos que estás repitiendo el mismo mensaje. Por favor no envies el mismo mensaje varias veces.`);
                } else if (spamAnalysis.action === 'spam_pattern') {
                    // No responder a patrones de spam obvios, solo ignorar
                    logger.warn(`🚫 Mensaje con patrón de spam ignorado de ${customerJid}`);
                }
                
                // Guardar mensaje como spam para auditoría
                await saveMessageToSupabase({
                    phone_number: customerJid,
                    message: `[SPAM DETECTADO: ${spamAnalysis.reason}] ${messageText}`,
                    direction: 'incoming',
                    status: 'spam',
                    created_at: new Date().toISOString()
                });
                
                // No procesar mensajes de spam
                return;
            }
        }
        
        // Crear o actualizar cliente automáticamente usando JID directamente
        try {
            // Evitar creación duplicada si ya se está creando desde otro lugar
            if (clientsBeingCreated.has(customerJid)) {
                // Esperar un poco y volver a verificar
                await new Promise(resolve => setTimeout(resolve, 500));
                const customers = await apiRequest('/customers').catch(() => []);
                const customer = customers.find(c => c.phone === customerJid);
                if (customer) {
                    // Cliente ya creado, verificar si está bloqueado y continuar
                    if (customer.is_blocked) {
                        logger.info(`🚫 Cliente bloqueado ${customerJid}, ignorando mensaje`);
                        return;
                    }
                }
                return; // Continuar con el procesamiento del mensaje
            }
            
            const customers = await apiRequest('/customers');
            // Buscar cliente por JID (phone ahora contiene el JID completo)
            let customer = customers.find(c => c.phone === customerJid);
            
            if (!customer) {
                // Marcar que se está creando
                clientsBeingCreated.add(customerJid);
                
                try {
                    // Crear nuevo cliente con JID y nombre si está disponible
                    logger.info(`👤 Creando nuevo cliente: ${customerJid}${contactName ? ` (${contactName})` : ''}`);
                    customer = await apiRequest('/customers', {
                        method: 'POST',
                        body: JSON.stringify({
                            phone: customerJid, // Guardar JID directamente
                            name: contactName || null, // Guardar nombre si está disponible
                            is_blocked: false,
                            disabled_payment_methods: null,
                            notes: null
                        })
                    });
                    logger.info(`✅ Cliente creado: ${customer.id} - ${customerJid}${contactName ? ` (${contactName})` : ''}`);
                } finally {
                    // Remover del set después de intentar crear
                    clientsBeingCreated.delete(customerJid);
                }
            } else {
                // Actualizar cliente existente: actualizar nombre si tenemos uno nuevo
                logger.debug(`👤 Cliente existente encontrado: ${customer.id} - ${customerJid}`);
                
                // Si tenemos un nombre nuevo y el cliente no tiene nombre, actualizarlo
                if (contactName && (!customer.name || customer.name === null)) {
                    try {
                        await apiRequest(`/customers/${customer.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({
                                phone: customerJid, // Asegurar que el JID esté actualizado
                                name: contactName // Actualizar nombre si estaba vacío
                            })
                        });
                        logger.debug(`✅ Nombre actualizado para cliente ${customer.id}: ${contactName}`);
                    } catch (updateError) {
                        logger.debug('⚠️ Error al actualizar cliente (no crítico):', updateError.message);
                    }
                } else {
                    // Solo actualizar JID si es necesario
                    if (customer.phone !== customerJid) {
                        try {
                            await apiRequest(`/customers/${customer.id}`, {
                                method: 'PUT',
                                body: JSON.stringify({
                                    phone: customerJid // Asegurar que el JID esté actualizado
                                })
                            });
                        } catch (updateError) {
                            logger.debug('⚠️ Error al actualizar cliente (no crítico):', updateError.message);
                        }
                    }
                }
            }
            
            // Verificar si el cliente está bloqueado
            if (customer && customer.is_blocked) {
                logger.info(`🚫 Cliente bloqueado ${customerJid}, ignorando mensaje`);
                return; // No responder a clientes bloqueados
            }
        } catch (error) {
            logger.error('❌ Error al gestionar cliente:', error);
            logger.error('❌ Stack:', error.stack);
            // Continuar procesando el mensaje aunque falle la gestión del cliente
        }
        
        // Guardar mensaje en base de datos usando JID directamente
        await saveMessageToSupabase({
            phone_number: customerJid,
            message: messageText,
            direction: 'incoming',
            status: 'received',
            created_at: new Date().toISOString()
        });
        
        // Rate limiting mejorado usando JID
        const now = Date.now();
        
        if (userLastMessage.has(customerJid) && now - userLastMessage.get(customerJid) < 2000) {
            logger.warn(`🚫 Mensaje muy reciente de ${customerJid}, ignorando`);
            return;
        }
        userLastMessage.set(customerJid, now);
        
        // Obtener o crear sesión de usuario
        if (!userSessions.has(from)) {
            userSessions.set(from, {
                step: 'welcome',
                lastActivity: now,
                pendingOrder: null,
                paymentMethod: null,
                waitingForConfirmation: false,
                waitingForPayment: false,
                waitingForAddress: false,
                waitingForTransferProof: false,
                waitingForComplaint: false,
                deliveryAddress: null,
                lastOrderProcessed: null, // Timestamp del último pedido procesado
                processedOrderIds: new Set() // IDs de pedidos ya procesados en esta sesión
            });
        }
        
        const userSession = userSessions.get(from);
        userSession.lastActivity = now;
        
        // Limpiar pedidos procesados antiguos (más de 1 hora)
        if (userSession.lastOrderProcessed && (now - userSession.lastOrderProcessed) > 3600000) {
            if (userSession.processedOrderIds) {
                userSession.processedOrderIds.clear();
            }
            userSession.lastOrderProcessed = null;
        }
        
        // 0. RESETEAR SESIÓN SI EL PEDIDO YA ESTÁ COMPLETADO Y EL USUARIO ENVÍA UN MENSAJE NUEVO
        // Si el usuario envía un mensaje que no es parte de un flujo activo, resetear la sesión
        const isActiveFlow = userSession.waitingForConfirmation || 
                            userSession.waitingForPayment || 
                            userSession.waitingForAddress || 
                            userSession.waitingForTransferProof ||
                            userSession.waitingForComplaint ||
                            userSession.pendingOrder;
        
        // Si no hay flujo activo y el mensaje no es un código de pedido ni un pedido web, resetear a welcome
        if (!isActiveFlow && !/^\d{4}$/.test(body) && 
            !messageText.includes('PEDIDO CONFIRMADO') && 
            !messageText.includes('Código de pedido:') &&
            !messageText.includes('PEDIDO - El Buen Menú')) {
            userSession.step = 'welcome';
            userSession.pendingOrder = null;
            userSession.paymentMethod = null;
            userSession.waitingForConfirmation = false;
            userSession.waitingForPayment = false;
            userSession.waitingForAddress = false;
            userSession.waitingForTransferProof = false;
            userSession.waitingForComplaint = false;
            userSession.deliveryAddress = null;
        }
        
        // 1. DETECTAR PEDIDOS DESDE LA WEB (PRIORIDAD MÁXIMA)
        // Detectar pedidos confirmados desde la web con código e IUC
        if (messageText && (
            messageText.includes('PEDIDO CONFIRMADO') || 
            messageText.includes('Código de pedido:') ||
            messageText.includes('Tu pedido está registrado')
        )) {
            // Limpiar el mensaje de caracteres especiales antes de validar
            const cleanMessageForValidation = messageText
                .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remover zero-width spaces y BOM
                .replace(/\uFFFD/g, '') // Remover replacement characters
                .trim();
            
            // Validar formato e IUC antes de procesar
            const validation = await validateOrderQueryWithIUC(from, cleanMessageForValidation, customerJid);
            
            if (!validation.valid) {
                // Si está bloqueado, no procesar
                if (validation.blocked) {
                    return;
                }
                // Si es un mensaje sin IUC (pedido nuevo pendiente), procesarlo igual
                // Solo rechazar si el formato está mal y el cliente YA tiene IUC
                const customers = await apiRequest('/customers');
                const customer = customers.find(c => c.phone === customerJid);
                const hasIUC = customer && customer.iuc;
                
                if (!hasIUC || messageText.includes('PEDIDO CONFIRMADO - El Buen Menú') || messageText.includes('Tu identificador único')) {
                    // Es un mensaje sin IUC (pedido nuevo o cliente sin IUC), procesarlo
                    logger.info(`🌐 Procesando pedido nuevo (sin IUC) de ${from}`);
                } else {
                    // Cliente tiene IUC pero formato incorrecto - rechazar
                    return;
                }
            }
            
            // Extraer código de pedido para validar antes de procesar
            const orderCodeMatch = messageText.match(/Código de pedido:\s*([#\d]+)/i);
            if (orderCodeMatch) {
                const orderCode = orderCodeMatch[1].replace('#', '');
                logger.info(`🌐 Pedido web confirmado detectado de ${from} con código: ${orderCode}`);
                
                // Verificar si el pedido ya fue procesado o está en un estado final
                try {
                    const allOrders = await apiRequest('/orders');
                    const orders = allOrders.filter(order => {
                        const orderNum = order.order_number?.replace('#', '') || '';
                        return orderNum === orderCode;
                    });
                    
                    if (orders.length > 0) {
                        const order = orders[0];
                        const status = order.status?.toLowerCase() || '';
                        
                        // Verificar que el pedido pertenezca al cliente (solo si el pedido ya tiene customer_phone asignado)
                        // Si customer_phone es null o vacío, es un pedido nuevo desde la web y se puede procesar
                        if (validation.valid && !validation.isNewOrder && order.customer_phone && order.customer_phone !== '' && order.customer_phone !== customerJid) {
                            logger.warn(`⚠️ Pedido ${orderCode} pertenece a otro cliente. Order phone: "${order.customer_phone}", Customer JID: "${customerJid}"`);
                            await sendMessage(from, `⚠️ *Error de validación*\n\nEste pedido no pertenece a tu cuenta.\n\nSolo podés consultar tus propios pedidos.`);
                            return;
                        }
                        
                        // Si es un pedido nuevo (sin customer_phone), permitir procesarlo
                        if (!order.customer_phone || order.customer_phone === '') {
                            logger.info(`✅ Pedido ${orderCode} es nuevo (sin customer_phone), se puede procesar`);
                        }
                        
                        // Estados finales: no procesar nuevamente
                        if (status === 'delivered' || status === 'cancelled' || status === 'entregado' || status === 'cancelado') {
                            logger.warn(`⚠️ Pedido ${orderCode} ya está en estado final (${status}), ignorando mensaje repetido`);
                            await sendMessage(from, `ℹ️ Tu pedido ${order.order_number} ya fue ${status === 'delivered' || status === 'entregado' ? 'entregado' : 'cancelado'}. Si necesitás ayuda, escribí "hola".`);
                            return;
                        }
                        
                        // Si el pedido ya está confirmado y procesado, no procesarlo nuevamente
                        if (userSession.pendingOrder?.orderId === order.id && userSession.waitingForConfirmation) {
                            logger.warn(`⚠️ Pedido ${orderCode} ya está siendo procesado en esta sesión, ignorando mensaje duplicado`);
                            await sendMessage(from, `ℹ️ Ya estamos procesando tu pedido ${order.order_number}. Por favor esperá nuestra respuesta.`);
                            return;
                        }
                    }
                } catch (error) {
                    logger.error('❌ Error al validar pedido antes de procesar:', error);
                    // Continuar procesando si hay error en la validación
                }
            }
            
            logger.info(`🌐 Procesando pedido web confirmado de ${from}`);
            logger.info(`📋 Contenido del pedido: ${messageText}`);
            // Limpiar el mensaje antes de procesarlo
            const cleanMessageForProcessing = messageText
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/\uFFFD/g, '')
                .trim();
            await handleWebOrderConfirmed(from, cleanMessageForProcessing, userSession);
            return;
        }
        
        // Detectar pedidos antiguos (compatibilidad)
        if (messageText && (
            messageText.includes('PEDIDO - El Buen Menú') || 
            messageText.includes('DETALLE DEL PEDIDO:') ||
            (messageText.includes('1x') && messageText.includes('$'))
        )) {
            logger.info(`🌐 Pedido web detectado de ${from}`);
            logger.info(`📋 Contenido del pedido: ${messageText}`);
            await handleWebOrder(from, messageText, userSession);
            return;
        }
        
        // 2. DETECTAR CÓDIGOS DE PEDIDO (4 dígitos)
        if (/^\d{4}$/.test(body)) {
            await handleOrderStatus(from, body, userSession);
            return;
        }
        
        // 3. DETECTAR COMPROBANTE DE PAGO (imagen o mensaje después de elegir transferencia)
        if (userSession.waitingForTransferProof) {
            // Manejar "09" para cambiar método de pago incluso cuando está esperando comprobante
            if (body === '09') {
                userSession.paymentMethod = null;
                userSession.waitingForTransferProof = false;
                userSession.waitingForPayment = true;
                await showPaymentOptions(from, userSession, true); // true = es cambio de método
                return;
            }
            
            // Detectar si es una imagen o mensaje de comprobante
            const hasImage = message.message?.imageMessage || message.message?.documentMessage;
            const isReceiptMessage = messageText && (
                messageText.includes('comprobante') || 
                messageText.includes('transferencia') ||
                messageText.includes('pago') ||
                messageText.includes('enviado') ||
                hasImage
            );
            
            if (hasImage || isReceiptMessage) {
                await handleTransferProof(from, message, userSession);
                return;
            }
            
            // Si no es imagen ni "09", mostrar mensaje de validación
            await sendMessage(from, getPaymentFlowValidationMessage(userSession));
            return;
        }
        
        // 4. MANEJAR CONFIRMACIONES
        if (userSession.waitingForConfirmation) {
            await handleOrderConfirmation(from, body, userSession);
            return;
        }
        
        // 5. MANEJAR DIRECCIÓN DE ENTREGA
        if (userSession.waitingForAddress) {
            await handleAddressInput(from, messageText, userSession);
            return;
        }
        
        // 6. MANEJAR SELECCIÓN DE PAGO
        if (userSession.waitingForPayment) {
            await handlePaymentSelection(from, body, userSession);
            return;
        }
        
        // 6. COMANDOS DE FIDELIDAD (detectados antes del menú principal)
        // Mis puntos / Mi nivel
        if ((body.includes('mis puntos') || body.includes('mi nivel')) && !body.includes('menu') && !body.includes('menú')) {
            await handleLoyaltyStatus(from, customerJid);
            return;
        }
        
        // Canjear código promocional
        if (body.startsWith('/canjear ') || body.startsWith('canjear ') || body.startsWith('/codigo ') || body.startsWith('codigo ') || body.startsWith('canjea ')) {
            const codeMatch = body.match(/(?:canjear|canjea|codigo)\s+([A-Z0-9]+)/i);
            if (codeMatch && codeMatch[1]) {
                const code = codeMatch[1].toUpperCase().trim();
                await handlePromoCodeRedeem(from, customerJid, code);
            } else {
                await sendMessage(from, `❌ *CÓDIGO NO ESPECIFICADO*\n\nPor favor, escribí el código a canjear.\n\n💡 Ejemplos:\n• /canjear NAVIDAD2025\n• canjear NAVIDAD2025\n• codigo PROMO123`);
            }
            return;
        }
        
        // Ver lista de referidos
        if (body === '/referidos' || body === 'referidos' || body.includes('mis referidos') || body.includes('invitados')) {
            await handleReferralsList(from, customerJid);
            return;
        }
        
        // 7. BLOQUEAR MENÚ PRINCIPAL SI ESTÁ EN FLUJO DE PAGO
        if (isInPaymentFlow(userSession)) {
            // Si está en flujo de pago, no mostrar menú principal
            // Solo permitir "09" para cambiar método o mostrar mensaje de validación
            if (body === '09') {
                userSession.paymentMethod = null;
                userSession.waitingForTransferProof = false;
                userSession.waitingForPayment = true;
                await showPaymentOptions(from, userSession, true); // true = es cambio de método
                return;
            }
            
            // Cualquier otro mensaje durante el flujo de pago muestra validación
            await sendMessage(from, getPaymentFlowValidationMessage(userSession));
            return;
        }
        
        // 7. MENSAJES DE INICIO (saludos y menú)
        if (isGreetingMessage(body) || body === '' || body.includes('inicio') || body.includes('menu principal') || body.includes('menú principal') || body.includes('menu') || body.includes('menú')) {
            await showMainMenu(from, customerJid);
            userSession.step = 'welcome';
            // Resetear sesión
            userSession.pendingOrder = null;
            userSession.paymentMethod = null;
            userSession.waitingForConfirmation = false;
            userSession.waitingForPayment = false;
            userSession.waitingForAddress = false;
            userSession.waitingForTransferProof = false;
            userSession.deliveryAddress = null;
            userSession.waitingForComplaint = false;
            return;
        }
        
        // 8. MANEJAR RECLAMOS
        if (userSession.waitingForComplaint) {
            await handleComplaintSubmission(from, customerJid, messageText, userSession);
            return;
        }
        
        if (body === '7' || body.includes('reclamo') || body.includes('reclamos') || body.includes('queja') || body.includes('quejas') || body.includes('problema') || (body.includes('ayuda') && !body.includes('como usar'))) {
            userSession.waitingForComplaint = true;
            await sendMessage(from, `📝 *REGISTRO DE RECLAMO*\n\nPor favor, describí tu reclamo o problema detalladamente:\n\n• Número de pedido (si aplica)\n• Descripción del problema\n• Fecha y hora aproximada\n• Cualquier detalle adicional\n\n📤 Escribí tu mensaje ahora.`);
            return;
        }
        
        // 8. VER HORARIOS
        if (body === '8' || body.includes('horarios') || body.includes('horario') || body.includes('abierto') || body.includes('cerrado') || body.includes('abren') || body.includes('cierran')) {
            const hoursMessage = botMessages?.horarios || `🕒 *NUESTROS HORARIOS*\n\nLunes a Domingo\n18:00 a 00:00 hs\n\n¡Estamos abiertos ahora! 😊\n\nPodés hacer tu pedido cuando quieras 🍔`;
            await sendMessage(from, hoursMessage);
            userSession.step = 'welcome';
            return;
        }
        
        // 9. ¿CÓMO USAR EL BOT?
        if (body === '9' || body.includes('como usar') || body.includes('cómo usar') || body.includes('ayuda bot') || body.includes('ayuda del bot') || body.includes('como funciona') || body.includes('cómo funciona') || body.includes('tutorial') || body.includes('guia') || body.includes('guía')) {
            await handleBotHelp(from);
            userSession.step = 'welcome';
            return;
        }
        
        // 10. OPCIONES DEL MENÚ PRINCIPAL
        if (body === '1' || (body.includes('menu') && !body.includes('menú principal') && !body.includes('menu principal')) || body.includes('ver menu') || body.includes('ver menú') || body.includes('productos')) {
            const menuMessage = botMessages?.menu || `📋 *NUESTRO MENÚ COMPLETO*\n\n🌐 https://elbuenmenu.site/menu\n\n¡Elegí tus productos favoritos y hacé tu pedido! 🍔\n\n💡 Podés agregar productos al carrito y confirmar tu pedido desde la web.`;
            
            await sendMessage(from, menuMessage);
            userSession.step = 'welcome';
            return;
        }
        
        if (body === '2' || body.includes('consultar pedido') || body.includes('consulta pedido') || body.includes('estado pedido') || body.includes('estado')) {
            await sendMessage(from, `📋 *CONSULTAR ESTADO DE PEDIDO*\n\nEnviá tu código de pedido (4 dígitos) para consultar el estado.\n\n💡 Ejemplo: #0001 o 0001\n\nO escribí "mis pedidos" para ver todos tus pedidos.`);
            userSession.step = 'welcome';
            return;
        }
        
        if (body === '3' || body.includes('mis pedidos') || body.includes('pedidos realizados') || body.includes('historial') || body.includes('pedidos')) {
            await handleUserOrders(from, customerJid, userSession);
            return;
        }
        
        if (body === '4' || body.includes('link') || body.includes('invitacion') || body.includes('invitación') || body.includes('invitar') || body.includes('referir') || body.includes('compartir')) {
            await handleReferralLink(from, customerJid);
            return;
        }
        
        if (body === '5' || body.includes('fidelidad') || body.includes('puntos') || body.includes('nivel') || body.includes('vip') || body.includes('mis puntos') || body.includes('mi nivel')) {
            await handleLoyaltyStatus(from, customerJid);
            return;
        }
        
        if ((body === '6' || body.includes('codigo') || body.includes('código') || body.includes('canjear') || body.includes('promocion') || body.includes('promoción')) && !body.includes('/canjear') && !body.includes('canjear ')) {
            await sendMessage(from, `🎟️ *CANJEAR CÓDIGO PROMOCIONAL*\n\nEscribí tu código promocional:\n\n💡 Ejemplo: /canjear NAVIDAD2025\n\nO simplemente: canjear NAVIDAD2025\n\n✨ Los códigos te dan descuentos, puntos extra o productos gratis.`);
            userSession.step = 'welcome';
            return;
        }
        
        if (body.includes('delivery') || body.includes('envio') || body.includes('envío') || body.includes('delivery info')) {
            const deliveryMessage = botMessages?.delivery_info || `🚚 *INFORMACIÓN DE DELIVERY*\n\n📦 Realizamos entregas a domicilio\n💰 Costo de envío: consultar según zona\n⏱️ Tiempo estimado: 30-45 minutos\n\n💡 Recordá incluir tu dirección completa al hacer el pedido.`;
            await sendMessage(from, deliveryMessage);
            userSession.step = 'welcome';
            return;
        }
        
        if (body.includes('ubicacion') || body.includes('ubicación') || body.includes('donde') || body.includes('dirección') || body.includes('direccion') || body.includes('local')) {
            const locationMessage = botMessages?.location || `📍 *NUESTRA UBICACIÓN*\n\n🏪 El Buen Menú\n\n💡 Escribí "delivery" para información de envíos.\n\nO visitanos en nuestro local.`;
            await sendMessage(from, locationMessage);
            userSession.step = 'welcome';
            return;
        }
        
        // 11. MENSAJE POR DEFECTO - Mostrar menú principal si no se entiende
        await sendMessage(from, `🤔 No entendí tu mensaje.\n\n💡 Escribí "hola" para ver todas las opciones disponibles.\n\nO escribí el número de la opción que necesitás:\n\n1️⃣ Ver menú\n2️⃣ Consultar pedido\n3️⃣ Mis pedidos\n4️⃣ Mi link de invitación\n5️⃣ Mis puntos\n6️⃣ Canjear código\n7️⃣ Hacer reclamo\n8️⃣ Ver horarios\n9️⃣ ¿Cómo usar el bot?`);
        userSession.step = 'welcome';
        
    } catch (error) {
        logger.error('❌ Error al procesar mensaje:', error);
        try {
            if (message?.key?.remoteJid && sock) {
                await sendMessage(message.key.remoteJid, '❌ Hubo un error al procesar tu mensaje. Por favor, intentá nuevamente o escribí "hola" para volver al menú principal.');
            }
        } catch (sendError) {
            logger.error('❌ Error al enviar mensaje de error:', sendError);
        }
    }
}

// ---------------------------------------------------------------------------
// HANDLE WEB ORDER CONFIRMED (Nuevo flujo desde checkout)
// ---------------------------------------------------------------------------
async function handleWebOrderConfirmed(from, messageText, userSession) {
    try {
        logger.info(`🌐 Procesando pedido web confirmado de ${from}`);
        logger.info(`📋 Mensaje completo recibido: "${messageText}"`);
        
        // Limpiar el mensaje de caracteres especiales y problemas de encoding
        const cleanMessage = messageText
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remover zero-width spaces y BOM
            .replace(/\uFFFD/g, '') // Remover replacement characters
            .trim();
        
        logger.info(`📋 Mensaje limpio: "${cleanMessage}"`);
        
        // Extraer código de pedido del mensaje
        const orderCodeMatch = cleanMessage.match(/Código de pedido:\s*([#\d]+)/i);
        if (!orderCodeMatch) {
            logger.error(`❌ No se pudo extraer el código de pedido del mensaje limpio: "${cleanMessage}"`);
            logger.error(`❌ Mensaje original: "${messageText}"`);
            await sendMessage(from, '❌ No pude encontrar el código de pedido. Por favor, contactanos directamente.');
            return;
        }
        
        const orderCode = orderCodeMatch[1].replace('#', '');
        logger.info(`🔍 Buscando pedido con código: ${orderCode}`);
        
        // Buscar el pedido en la base de datos
        logger.info(`📡 Haciendo request a /orders...`);
        let allOrders;
        try {
            allOrders = await apiRequest('/orders');
            logger.info(`📦 Respuesta de API - Tipo: ${typeof allOrders}, Es array: ${Array.isArray(allOrders)}, Valor:`, JSON.stringify(allOrders).substring(0, 200));
            
            if (allOrders === null || allOrders === undefined) {
                logger.error('❌ La API devolvió null o undefined');
                throw new Error('La API no devolvió datos (null/undefined)');
            }
            
            if (!Array.isArray(allOrders)) {
                logger.error(`❌ La respuesta de la API no es un array. Tipo: ${typeof allOrders}, Valor:`, allOrders);
                throw new Error(`La respuesta del servidor no tiene el formato esperado. Tipo recibido: ${typeof allOrders}`);
            }
            
            logger.info(`✅ Recibidos ${allOrders.length} pedidos de la API`);
        } catch (apiError) {
            logger.error('❌ Error al obtener pedidos de la API:', apiError);
            logger.error('❌ Stack:', apiError.stack);
            logger.error('❌ API URL:', `${API_CONFIG.url}/orders`);
            throw new Error(`Error al conectar con el servidor: ${apiError.message}`);
        }
        
        const orders = allOrders.filter(order => {
            const orderNum = order.order_number?.replace('#', '') || '';
            const matches = orderNum === orderCode;
            if (matches) {
                logger.info(`✅ Pedido encontrado: ${order.order_number} (ID: ${order.id})`);
            }
            return matches;
        });
        
        if (orders.length === 0) {
            logger.warn(`⚠️ No se encontró pedido con código ${orderCode}. Pedidos disponibles:`, allOrders.map(o => o.order_number));
            await sendMessage(from, `❌ No encontré el pedido con código #${orderCode}. Por favor, verificá el código o contactanos directamente.`);
            return;
        }
        
        const order = orders[0];
        logger.info(`✅ Pedido encontrado: ${order.id}`);
        
        // Usar JID directamente (ya no necesitamos números "limpios")
        const customerJid = from;
        
        logger.info(`📱 JID: ${customerJid} (desde: ${from})`);
        logger.info(`📋 Estado actual del pedido - customer_phone: "${order.customer_phone}"`);
        
        // Actualizar SIEMPRE el JID, incluso si ya existe (por si cambió o está mal formateado)
        try {
            const updateResult = await apiRequest(`/orders/${order.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    customer_phone: customerJid
                })
            });
            logger.info(`✅ JID actualizado en pedido ${order.id}: ${customerJid}`);
            logger.info(`📋 Pedido actualizado:`, JSON.stringify(updateResult, null, 2));
        } catch (error) {
            logger.error('❌ Error al actualizar JID:', error);
            logger.error('❌ Stack:', error.stack);
        }
        
        // Verificar estado del pedido antes de procesarlo
        const orderStatus = order.status?.toLowerCase() || '';
        
        // Si el pedido ya está en un estado final, no procesarlo
        if (orderStatus === 'delivered' || orderStatus === 'entregado') {
            logger.warn(`⚠️ Pedido ${order.order_number} ya fue entregado, no se puede procesar nuevamente`);
            await sendMessage(from, `✅ Tu pedido ${order.order_number} ya fue entregado.\n\nSi tenés alguna consulta, escribí "hola" para ver las opciones.`);
            // Limpiar sesión
            userSession.pendingOrder = null;
            userSession.waitingForConfirmation = false;
            userSession.step = 'welcome';
            if (userSession.processedOrderIds) {
                userSession.processedOrderIds.add(order.id);
            }
            return;
        }
        
        if (orderStatus === 'cancelled' || orderStatus === 'cancelado') {
            logger.warn(`⚠️ Pedido ${order.order_number} fue cancelado, no se puede procesar`);
            await sendMessage(from, `❌ Tu pedido ${order.order_number} fue cancelado.\n\nSi querés realizar un nuevo pedido, escribí "hola" para comenzar.`);
            // Limpiar sesión
            userSession.pendingOrder = null;
            userSession.waitingForConfirmation = false;
            userSession.step = 'welcome';
            if (userSession.processedOrderIds) {
                userSession.processedOrderIds.add(order.id);
            }
            return;
        }
        
        // Si el pedido ya está confirmado y procesado, informar al cliente
        if (orderStatus === 'confirmed' || orderStatus === 'preparing' || orderStatus === 'ready' || orderStatus === 'assigned' || orderStatus === 'in_transit') {
            logger.info(`ℹ️ Pedido ${order.order_number} ya está en proceso (${orderStatus})`);
            const statusTextMap = {
                'confirmed': 'Confirmado',
                'preparing': 'En preparación',
                'ready': 'Listo',
                'assigned': 'Asignado',
                'in_transit': 'En camino'
            };
            const statusText = statusTextMap[orderStatus] || orderStatus;
            await sendMessage(from, `ℹ️ Tu pedido ${order.order_number} ya está siendo procesado.\n\nEstado actual: ${statusText}\n\nSi necesitás ayuda, escribí "hola" para ver las opciones.`);
            // Limpiar sesión
            userSession.pendingOrder = null;
            userSession.waitingForConfirmation = false;
            userSession.step = 'welcome';
            if (userSession.processedOrderIds) {
                userSession.processedOrderIds.add(order.id);
            }
            return;
        }
        
        // Solo procesar si el pedido está en estado 'pending'
        if (orderStatus !== 'pending') {
            logger.warn(`⚠️ Pedido ${order.order_number} está en estado ${orderStatus}, no se puede procesar como nuevo pedido`);
            const statusTextMap = {
                'confirmed': 'Confirmado',
                'preparing': 'En preparación',
                'ready': 'Listo',
                'assigned': 'Asignado',
                'in_transit': 'En camino',
                'delivered': 'Entregado',
                'cancelled': 'Cancelado'
            };
            const statusText = statusTextMap[orderStatus] || orderStatus;
            await sendMessage(from, `ℹ️ Tu pedido ${order.order_number} ya fue procesado anteriormente.\n\nEstado: ${statusText}\n\nSi necesitás ayuda, escribí "hola".`);
            // Limpiar sesión
            userSession.pendingOrder = null;
            userSession.waitingForConfirmation = false;
            userSession.step = 'welcome';
            if (userSession.processedOrderIds) {
                userSession.processedOrderIds.add(order.id);
            }
            return;
        }
        
        // Verificar si este pedido ya fue procesado en esta sesión
        if (userSession.processedOrderIds && userSession.processedOrderIds.has(order.id)) {
            logger.warn(`⚠️ Pedido ${order.order_number} ya fue procesado en esta sesión`);
            await sendMessage(from, `ℹ️ Tu pedido ${order.order_number} ya fue procesado. Si necesitás ayuda, escribí "hola".`);
            return;
        }
        
        // Marcar pedido como procesado en esta sesión
        if (!userSession.processedOrderIds) {
            userSession.processedOrderIds = new Set();
        }
        userSession.processedOrderIds.add(order.id);
        
        // Calcular el total correcto sumando extras (se calcula más abajo)
        // Guardar información del pedido en la sesión
        userSession.pendingOrder = {
            orderId: order.id,
            orderCode: order.order_number,
            total: order.total, // Se actualizará con el total calculado
            items: order.items || [],
            originalMessage: messageText,
            processedAt: Date.now() // Marcar tiempo de procesamiento
        };
        userSession.waitingForConfirmation = true;
        userSession.step = 'confirm_web_order';
        
        // Calcular el total correcto sumando extras
        let calculatedTotal = 0;
        
        // Formatear items para mostrar con todas las opciones y extras
        const itemsText = (order.items || []).map((item) => {
            // Calcular el precio base del producto (sin extras)
            // El subtotal puede incluir extras, así que calculamos desde unit_price
            const unitPrice = item.unit_price || 0;
            const baseSubtotal = unitPrice * item.quantity;
            let itemTotal = baseSubtotal;
            let extrasTotal = 0;
            
            // Formato: nombre del producto primero
            let text = `${item.product_name}`;
            
            if (item.selected_options) {
                try {
                    const options = typeof item.selected_options === 'string' 
                        ? JSON.parse(item.selected_options) 
                        : item.selected_options;
                    
                    // Si tiene estructura { options: [...], optionsText: [...] }
                    if (options.options && Array.isArray(options.options)) {
                        options.options.forEach((opt) => {
                            const optName = opt.name || opt;
                            const optPrice = opt.price || 0;
                            if (optPrice > 0) {
                                extrasTotal += optPrice * item.quantity; // Multiplicar por cantidad
                                text += `\n• ${optName} (+$${optPrice.toLocaleString()})`;
                            } else {
                                text += `\n• ${optName}`;
                            }
                        });
                    }
                    // Si tiene optionsText (texto formateado)
                    else if (options.optionsText && Array.isArray(options.optionsText)) {
                        options.optionsText.forEach((optText) => {
                            text += `\n• ${optText}`;
                            // Intentar extraer precio del texto si tiene formato (+$XX)
                            const priceMatch = optText.match(/\(\+\$([\d.,]+)\)/);
                            if (priceMatch) {
                                const price = parseFloat(priceMatch[1].replace(/[.,]/g, ''));
                                if (!isNaN(price)) {
                                    extrasTotal += price * item.quantity;
                                }
                            }
                        });
                    }
                    // Si es un array directo
                    else if (Array.isArray(options) && options.length > 0) {
                        options.forEach((opt) => {
                            if (typeof opt === 'string') {
                                text += `\n• ${opt}`;
                                // Intentar extraer precio del texto si tiene formato (+$XX)
                                const priceMatch = opt.match(/\(\+\$([\d.,]+)\)/);
                                if (priceMatch) {
                                    const price = parseFloat(priceMatch[1].replace(/[.,]/g, ''));
                                    if (!isNaN(price)) {
                                        extrasTotal += price * item.quantity;
                                    }
                                }
                            } else if (opt.name) {
                                const optPrice = opt.price || 0;
                                if (optPrice > 0) {
                                    extrasTotal += optPrice * item.quantity;
                                    text += `\n• ${opt.name} (+$${optPrice.toLocaleString()})`;
                                } else {
                                    text += `\n• ${opt.name}`;
                                }
                            }
                        });
                    }
                    // Si es un objeto con categorías
                    else if (typeof options === 'object' && !Array.isArray(options)) {
                        Object.keys(options).forEach((key) => {
                            const categoryOptions = Array.isArray(options[key]) ? options[key] : [];
                            categoryOptions.forEach((opt) => {
                                if (typeof opt === 'string') {
                                    text += `\n• ${opt}`;
                                    // Intentar extraer precio del texto si tiene formato (+$XX)
                                    const priceMatch = opt.match(/\(\+\$([\d.,]+)\)/);
                                    if (priceMatch) {
                                        const price = parseFloat(priceMatch[1].replace(/[.,]/g, ''));
                                        if (!isNaN(price)) {
                                            extrasTotal += price * item.quantity;
                                        }
                                    }
                                } else if (opt.name) {
                                    const optPrice = opt.price || 0;
                                    if (optPrice > 0) {
                                        extrasTotal += optPrice * item.quantity;
                                        text += `\n• ${opt.name} (+$${optPrice.toLocaleString()})`;
                                    } else {
                                        text += `\n• ${opt.name}`;
                                    }
                                }
                            });
                        });
                    }
                    
                    itemTotal = baseSubtotal + extrasTotal;
                } catch (e) {
                    // Si falla el parsing, intentar mostrar como string
                    logger.debug(`⚠️ Error parseando opciones para ${item.product_name}:`, e);
                    if (typeof item.selected_options === 'string' && item.selected_options.length > 0) {
                        text += `\n• Opciones: ${item.selected_options.substring(0, 100)}`;
                    }
                }
            }
            
            // Agregar el total del item al final
            text += `\n$${itemTotal.toLocaleString()}`;
            
            calculatedTotal += itemTotal;
            return text;
        }).join('\n');
        
        // Usar el total calculado si es diferente del total del pedido
        const finalTotal = calculatedTotal > 0 ? calculatedTotal : (order.total || 0);
        
        // Detectar si es retiro o delivery
        // Verificar en notes primero (más confiable) - buscar "RETIRO EN LOCAL" o "RETIRO"
        const notesUpper = (order.notes || '').toUpperCase();
        const isPickup = notesUpper.includes('RETIRO EN LOCAL') || 
                        notesUpper.includes('RETIRO') ||
                        // También verificar si la dirección coincide exactamente con la dirección de retiro
                        (order.customer_address && (
                            order.customer_address.trim() === 'Av. RIVADAVIA 2911' ||
                            order.customer_address.includes('RIVADAVIA 2911')
                        ));
        
        logger.info(`🔍 Detección de retiro - notes: "${order.notes}", address: "${order.customer_address}", isPickup: ${isPickup}`);
        
        // Formatear dirección según el tipo
        let addressLine = '';
        if (isPickup) {
            // Si es retiro, usar la dirección guardada o la dirección por defecto
            const pickupAddress = order.customer_address || 'Av. RIVADAVIA 2911';
            addressLine = `📍 *Direccion de retiro:* ${pickupAddress}`;
        } else if (order.customer_address) {
            addressLine = `📍 *Dirección:* ${order.customer_address}`;
        }
        
        // Actualizar el total en la sesión con el total calculado
        if (finalTotal > 0 && finalTotal !== order.total) {
            userSession.pendingOrder.total = finalTotal;
            logger.info(`💰 [ORDER CONFIRM] Total recalculado: $${order.total} → $${finalTotal}`);
        }
        
        // Mensaje de confirmación
        const confirmMessage = `✅ *¡Pedido encontrado!*

🆔 *Código:* ${order.order_number}
👤 *Cliente:* ${order.customer_name}
${addressLine}
💰 *Total:* $${finalTotal.toLocaleString()}

📋 *Tu pedido:*
${itemsText}

¿Está todo correcto? ¿Deseás continuar con el pago?

✅ Escribí "SÍ" para continuar
❌ Escribí "NO" para cancelar`;
        
        await sendMessage(from, confirmMessage);
        
    } catch (error) {
        logger.error('❌ Error al procesar pedido web confirmado:', error);
        logger.error('❌ Stack trace:', error.stack);
        logger.error('❌ Mensaje recibido:', messageText);
        logger.error('❌ From:', from);
        
        // Enviar mensaje más específico si es posible
        let errorMessage = '❌ Hubo un error al procesar tu pedido. Por favor, contactanos directamente.';
        
        if (error.message) {
            logger.error('❌ Error message:', error.message);
            if (error.message.includes('fetch') || error.message.includes('network')) {
                errorMessage = '❌ Error de conexión. Por favor, intentá nuevamente en unos momentos.';
            } else if (error.message.includes('JSON') || error.message.includes('parse')) {
                errorMessage = '❌ Error al procesar los datos del pedido. Por favor, contactanos directamente.';
            }
        }
        
        await sendMessage(from, errorMessage);
    }
}

// ---------------------------------------------------------------------------
// HANDLE WEB ORDER (Flujo antiguo - compatibilidad)
// ---------------------------------------------------------------------------
async function handleWebOrder(from, messageText, userSession) {
    try {
        logger.info(`🌐 Procesando pedido web de ${from}`);
        logger.info(`📋 Mensaje completo: ${messageText}`);
        
        // Extraer información del pedido con mejor parsing
        const lines = messageText.split('\n');
        let orderItems = [];
        let total = 0;
        let orderCode = null;
        
        // Buscar el total
        for (const line of lines) {
            if (line.includes('TOTAL:') && line.includes('$')) {
                const totalMatch = line.match(/\$\s*([\d.,]+)/);
                if (totalMatch) {
                    total = parseFloat(totalMatch[1].replace(/[.,]/g, ''));
                    logger.info(`💰 Total extraído: $${total}`);
                }
            }
            
            // Buscar items del pedido
            if (line.includes('1x') || line.includes('2x') || line.includes('3x') || 
                line.includes('L Grandes') || line.includes('L Cebolla') || line.includes('L Cheddar')) {
                orderItems.push(line.trim());
                logger.info(`📦 Item encontrado: ${line.trim()}`);
            }
        }
        
        // Si no encontramos items específicos, usar todo el mensaje como detalle
        if (orderItems.length === 0) {
            orderItems = ['Pedido desde la web'];
        }
        
        // Generar código de pedido único
        orderCode = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Guardar pedido en sesión
        userSession.pendingOrder = {
            items: orderItems,
            total: total,
            originalMessage: messageText,
            orderCode: orderCode
        };
        userSession.waitingForConfirmation = true;
        userSession.step = 'confirm_order';
        
        // Crear mensaje de confirmación más claro
        let confirmMessage = `🧾 ¡Recibí tu pedido desde la web!
        
📋 DETALLE:
${orderItems.join('\n')}

💰 TOTAL: $${total.toLocaleString()}
🆔 CÓDIGO: ${orderCode}

¿Confirmás este pedido?

✅ Escribí "SÍ" para confirmar
❌ Escribí "NO" para cancelar`;
        
        await sendMessage(from, confirmMessage);
        
        logger.info(`✅ Pedido web procesado correctamente - Código: ${orderCode}`);
        
    } catch (error) {
        logger.error('❌ Error al procesar pedido web:', error);
        await sendMessage(from, '❌ Hubo un error al procesar tu pedido. Por favor, intentá nuevamente o contactanos directamente.');
    }
}

// ---------------------------------------------------------------------------
// CREATE ORDER IN DATABASE
// ---------------------------------------------------------------------------
async function createOrderInDatabase(from, userSession) {
    try {
        // Usar JID directamente (ya no necesitamos números "limpios")
        const customerJid = from;
        
        // Generar código de pedido único si no existe
        const orderCode = userSession.pendingOrder?.orderCode || Math.floor(1000 + Math.random() * 9000).toString();
        
        // Extraer información del pedido web
        const orderText = userSession.pendingOrder?.originalMessage || '';
        const orderTotal = userSession.pendingOrder?.total || 0;
        
        // Usar la dirección proporcionada por el usuario
        const deliveryAddress = userSession.deliveryAddress || 'Dirección no especificada';
        
        // Parsear items del pedido desde el mensaje original
        let itemsArray = [];
        if (orderText.includes('DETALLE DEL PEDIDO:')) {
            const lines = orderText.split('\n');
            let currentItem = null;
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                
                // Detectar item principal (ejemplo: • 1x Combo Familiar - $ 9.600)
                if (trimmedLine.match(/^•\s*\d+x\s+.+\s-\s\$\s*[\d.,]+/)) {
                    if (currentItem) {
                        itemsArray.push(currentItem);
                    }
                    
                    const itemMatch = trimmedLine.match(/^•\s*(\d+)x\s+(.+?)\s-\s\$\s*([\d.,]+)/);
                    if (itemMatch) {
                        const [, quantity, name, price] = itemMatch;
                        currentItem = {
                            product_name: name.trim(),
                            quantity: parseInt(quantity),
                            product_price: parseFloat(price.replace(/[.,]/g, '')),
                            notes: []
                        };
                    }
                }
                // Detectar extras (ejemplo: └ Grandes (+$ 100))
                else if (trimmedLine.match(/^└\s+.+\s\(\+\$\s*[\d.,]+\)/)) {
                    if (currentItem) {
                        const extraMatch = trimmedLine.match(/^└\s+(.+?)\s\(\+\$\s*([\d.,]+)\)/);
                        if (extraMatch) {
                            const [, extraName, extraPrice] = extraMatch;
                            currentItem.notes.push(`${extraName.trim()} (+$${extraPrice})`);
                            currentItem.product_price += parseFloat(extraPrice.replace(/[.,]/g, ''));
                        }
                    }
                }
            }
            
            // Agregar último item
            if (currentItem) {
                itemsArray.push(currentItem);
            }
        }
        
        // Si no se pudieron parsear items, crear uno genérico
        if (itemsArray.length === 0) {
            itemsArray = [{
                product_name: 'Pedido desde WhatsApp',
                quantity: 1,
                product_price: orderTotal,
                notes: ['Pedido procesado desde bot']
            }];
        }
        
        // Crear el pedido principal con la estructura que espera la API local
        const orderData = {
            customer_name: 'Cliente WhatsApp',
            customer_phone: customerJid, // Usar JID directamente
            customer_address: deliveryAddress,
            status: userSession.paymentMethod === 'cash' ? 'confirmed' : 'pending',
            payment_method: userSession.paymentMethod === 'transfer' ? 'Transferencia' : 
                           userSession.paymentMethod === 'mercadopago' ? 'Mercado Pago' : 'Efectivo',
            payment_status: userSession.paymentMethod === 'cash' ? 'completed' : 'pending',
            subtotal: parseFloat(orderTotal),
            delivery_fee: 0,
            total: parseFloat(orderTotal),
            notes: `Pedido desde WhatsApp Bot\n\nDetalle original:\n${orderText}`,
            items: itemsArray.map(item => ({
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.product_price,
                subtotal: item.product_price * item.quantity,
                selected_options: JSON.stringify(item.notes || [])
            }))
        };
        
        logger.info(`📝 Creando pedido en base de datos:`);
        logger.info(JSON.stringify(orderData, null, 2));
        
        // Usar la API local
        const createdOrder = await apiRequest('/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        
        const orderId = createdOrder.id;
        const finalOrderCode = createdOrder.order_number || orderCode;
        
        if (!orderId) {
            throw new Error('No se pudo obtener el ID del pedido creado');
        }
        
        logger.info(`✅ Pedido creado con ID: ${orderId} y número: ${finalOrderCode}`);
        
        userSession.orderCode = finalOrderCode;
        logger.info(`🎉 Pedido ${finalOrderCode} creado completamente en base de datos`);
        
        // Notificar a administradores con información detallada
        const adminMessage = `🔔 NUEVO PEDIDO DESDE WHATSAPP
        
🆔 Código: ${finalOrderCode}
📱 Cliente: ${customerJid}
📍 Dirección: ${deliveryAddress}
💰 Total: $${orderTotal.toLocaleString()}
💳 Pago: ${orderData.payment_method}
📋 Estado: ${orderData.status}
        
🍽️ Productos:
${itemsArray.map(item => 
    `• ${item.quantity}x ${item.product_name} - $${(item.product_price * item.quantity).toLocaleString()}${item.notes.length > 0 ? `\n  └ ${item.notes.join(', ')}` : ''}`
).join('\n')}
        
📊 Revisar panel de administración para gestionar el pedido.`;
        
        for (const adminNumber of CONFIG.adminNumbers) {
            const adminJid = `${adminNumber}@s.whatsapp.net`;
            await sendMessage(adminJid, adminMessage);
        }
        
        return orderId;
        
    } catch (error) {
        logger.error('❌ Error al crear pedido en base de datos:', error);
        
        // Enviar mensaje de error al usuario
        await sendMessage(from, '❌ Hubo un error al procesar tu pedido. Por favor, contactanos directamente al 348-720-7406.');
        
        throw error;
    }
}

// ---------------------------------------------------------------------------
// UPDATE WEB ORDER PAYMENT
// ---------------------------------------------------------------------------
async function updateWebOrderPayment(from, userSession, paymentMethod) {
    try {
        if (!userSession.pendingOrder?.orderId) {
            throw new Error('No hay orderId en el pedido pendiente');
        }

        const orderId = userSession.pendingOrder.orderId;
        
        // Usar JID directamente (ya no necesitamos números "limpios")
        const customerJid = from;
        
        const paymentStatus = paymentMethod === 'Efectivo' ? 'completed' : 'pending';
        const orderStatus = paymentMethod === 'Efectivo' ? 'confirmed' : 'pending';

        logger.info(`📱 Actualizando pedido ${orderId} con JID: ${customerJid}`);

        // Actualizar el pedido en la base de datos (incluyendo el JID SIEMPRE y el total recalculado)
        const updateData = {
            customer_phone: customerJid, // Guardar JID directamente
            payment_method: paymentMethod,
            payment_status: paymentStatus,
            status: orderStatus
        };
        
        // Si hay un total recalculado en la sesión, incluirlo
        if (userSession.pendingOrder?.total) {
            updateData.total = userSession.pendingOrder.total;
            updateData.subtotal = userSession.pendingOrder.total; // Asumir que subtotal = total si no hay delivery fee
            logger.info(`💰 [UPDATE ORDER] Actualizando total a: $${userSession.pendingOrder.total}`);
        }
        
        logger.info(`📝 Datos de actualización:`, JSON.stringify(updateData, null, 2));
        
        const updateResult = await apiRequest(`/orders/${orderId}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        logger.info(`✅ Pedido ${orderId} actualizado con método de pago: ${paymentMethod} y JID: ${customerJid}`);
        logger.info(`📋 Resultado de actualización:`, JSON.stringify(updateResult, null, 2));
        
        // NO crear transferencia pendiente aquí - se creará cuando se reciba el comprobante en handleTransferProof

    } catch (error) {
        logger.error('❌ Error al actualizar pedido web:', error);
        throw error;
    }
}

// ---------------------------------------------------------------------------
// HANDLE ORDER STATUS
// ---------------------------------------------------------------------------
async function handleOrderStatus(from, codigo, userSession) {
    try {
        logger.info(`🔍 Buscando pedido con código: ${codigo}`);
        
        // Buscar pedido por order_number
        const allOrders = await apiRequest('/orders');
        const orders = allOrders.filter(order => order.order_number === codigo);
        
        if (orders.length === 0) {
            await sendMessage(from, `❌ No encontré ningún pedido con el código *${codigo}*\n\n🔍 Verificá que el código sea correcto.`);
            return;
        }

        const order = orders[0];
        const statusMessage = getOrderStatusMessage(order);
        
        await sendMessage(from, statusMessage);
        
    } catch (error) {
        logger.error('❌ Error al buscar pedido:', error.message);
        await sendMessage(from, `❌ Hubo un error al buscar tu pedido. Intentá nuevamente.`);
    }
}

// ---------------------------------------------------------------------------
// HANDLE USER ORDERS (Ver pedidos realizados por el usuario)
// ---------------------------------------------------------------------------
async function handleUserOrders(from, customerJid, userSession) {
    try {
        // Usar JID directamente (ya no necesitamos números "limpios")
        logger.info(`📋 Consultando pedidos del usuario: ${customerJid}`);
        
        // Buscar todos los pedidos del usuario usando JID directamente
        const allOrders = await apiRequest('/orders');
        const userOrders = allOrders.filter(order => {
            // Buscar por JID directamente (customer_phone ahora contiene el JID completo)
            return order.customer_phone === customerJid;
        });
        
        if (userOrders.length === 0) {
            await sendMessage(from, `📭 No tenés pedidos registrados aún.\n\n💡 Podés hacer tu primer pedido desde nuestra web o escribiendo "menú" para ver nuestras opciones.`);
            userSession.step = 'welcome';
            return;
        }
        
        // Ordenar por fecha (más recientes primero)
        userOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // Limitar a los últimos 10 pedidos
        const recentOrders = userOrders.slice(0, 10);
        
        let message = `📋 *TUS PEDIDOS REALIZADOS*\n\n`;
        
        recentOrders.forEach((order, index) => {
            const statusEmoji = {
                'pending': '⏳',
                'confirmed': '✅',
                'preparing': '👨‍🍳',
                'ready': '✅',
                'assigned': '🛵',
                'in_transit': '🚚',
                'delivered': '🎉',
                'cancelled': '❌'
            };
            
            const statusText = {
                'pending': 'Pendiente',
                'confirmed': 'Confirmado',
                'preparing': 'En preparación',
                'ready': 'Listo',
                'assigned': 'Asignado',
                'in_transit': 'En camino',
                'delivered': 'Entregado',
                'cancelled': 'Cancelado'
            };
            
            const emoji = statusEmoji[order.status] || '📦';
            const status = statusText[order.status] || order.status;
            const date = new Date(order.created_at).toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            message += `${emoji} *${order.order_number}* - ${status}\n`;
            message += `💰 $${order.total?.toLocaleString() || 0}\n`;
            message += `📅 ${date}\n`;
            
            if (order.delivery_code) {
                message += `🔐 Código: ${order.delivery_code}\n`;
            }
            
            message += `\n`;
        });
        
        if (userOrders.length > 10) {
            message += `\n📊 Mostrando los últimos 10 pedidos de ${userOrders.length} totales.`;
        }
        
        message += `\n💡 Para consultar el estado de un pedido específico, enviá su código (ej: #0001)`;
        
        await sendMessage(from, message);
        userSession.step = 'welcome';
        
    } catch (error) {
        logger.error('❌ Error al consultar pedidos del usuario:', error);
        await sendMessage(from, '❌ Hubo un error al consultar tus pedidos. Por favor, intentá nuevamente.');
        userSession.step = 'welcome';
    }
}

// ---------------------------------------------------------------------------
// GET ORDER STATUS MESSAGE
// ---------------------------------------------------------------------------
function getOrderStatusMessage(order) {
    const statusEmojis = {
        'pending': '⏳',
        'confirmed': '✅',
        'preparing': '👨‍🍳',
        'ready': '🍽️',
        'out_for_delivery': '🛵',
        'delivered': '🏁',
        'cancelled': '❌'
    };
    
    const statusTexts = {
        'pending': 'Pendiente',
        'confirmed': 'Confirmado',
        'preparing': 'En preparación',
        'ready': 'Listo',
        'out_for_delivery': 'En camino',
        'delivered': 'Entregado',
        'cancelled': 'Cancelado'
    };
    
    const emoji = statusEmojis[order.status] || '📋';
    const statusText = statusTexts[order.status] || 'Desconocido';
    
    // Detectar si es retiro o delivery
    // Verificar en notes primero (más confiable) - buscar "RETIRO EN LOCAL" o "RETIRO"
    const notesUpper = (order.notes || '').toUpperCase();
    const isPickup = notesUpper.includes('RETIRO EN LOCAL') || 
                    notesUpper.includes('RETIRO') ||
                    // También verificar si la dirección coincide exactamente con la dirección de retiro
                    (order.customer_address && (
                        order.customer_address.trim() === 'Av. RIVADAVIA 2911' ||
                        order.customer_address.includes('RIVADAVIA 2911')
                    ));
    
    // Formatear dirección según el tipo
    let addressLine = '';
    if (isPickup && order.customer_address) {
        // Si es retiro, mostrar "Direccion de retiro: ..."
        addressLine = `📍 Direccion de retiro: ${order.customer_address}\n`;
    } else if (order.customer_address) {
        addressLine = `📍 Dirección: ${order.customer_address}\n`;
    }
    
    // CORREGIDO: Usar order_number y total_amount
    let message = `📋 ESTADO DE TU PEDIDO

🆔 Código: ${order.order_number}
${emoji} Estado: ${statusText}
💰 Total: $${order.total_amount || order.total || 0}
${addressLine}📅 Fecha: ${new Date(order.created_at).toLocaleDateString('es-AR')}`;
    
    // Agregar mensaje específico según el estado
    if (order.status === 'preparing') {
        message += `\n\n${botMessages.order_preparing || '👨‍🍳 En preparación'}`;
    } else if (order.status === 'ready') {
        message += `\n\n${botMessages.order_ready || '✅ Listo'}`;
    } else if (order.status === 'out_for_delivery') {
        message += `\n\n${botMessages.order_delivery || '🛵 En camino'}`;
    } else if (order.status === 'delivered') {
        message += `\n\n${botMessages.order_delivered || '🏁 Entregado'}`;
    }
    
    return message;
}

// ---------------------------------------------------------------------------
// SEND MESSAGE FUNCTION
// ---------------------------------------------------------------------------
async function sendMessage(to, content) {
    if (!sock) {
        logger.error('❌ Socket no inicializado, no se puede enviar mensaje');
        throw new Error('Socket no inicializado');
    }
    
    try {
        logger.info(`📤 Enviando mensaje a ${to}`);
        logger.debug(`📝 Contenido: ${content.substring(0, 100)}...`);
        
        const result = await sock.sendMessage(to, { text: content });
        
        // Obtener número limpio para logging y guardado
        const cleanToNumber = await getCleanNumber(to);
        const displayNumber = cleanToNumber || to.replace('@s.whatsapp.net', '');
        
        logger.info(`✅ Mensaje enviado exitosamente a ${displayNumber}`);
        logger.debug(`📋 Resultado:`, result);
        
        // Guardar mensaje enviado en base de datos
        try {
            await saveMessageToSupabase({
                phone_number: cleanToNumber || to,
                message: content,
                direction: 'outgoing',
                status: 'sent',
                created_at: new Date().toISOString()
            });
        } catch (dbError) {
            logger.debug('⚠️ Error al guardar mensaje en BD (no crítico):', dbError.message);
        }
        
        return result;
    } catch (err) {
        logger.error(`❌ Error enviando mensaje a ${to}:`, err);
        logger.error(`❌ Stack:`, err.stack);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// SESSION VALIDATION
// ---------------------------------------------------------------------------
function checkValidSession() {
    try {
        return fs.existsSync(CONFIG.sessionPath) && fs.readdirSync(CONFIG.sessionPath).length > 0;
    } catch (e) {
        return false;
    }
}

// ---------------------------------------------------------------------------
// MONITORING SYSTEMS
// ---------------------------------------------------------------------------
function startMonitoringSystems() {
    logger.info('📈 Sistemas de monitoreo iniciados');
    
    // Limpiar sesiones inactivas cada 5 minutos
    setInterval(cleanupInactiveSessions, CONFIG.sessionCleanupInterval);
    
    // Mostrar estadísticas cada 10 minutos
    setInterval(() => {
        logger.info(`📊 Estadísticas: ${metrics.messagesProcessed} mensajes procesados, ${metrics.activeUsers} usuarios activos, ${metrics.errors} errores`);
    }, 600000);
    
    // CORREGIDO: Recargar mensajes cada 10 minutos y silenciar errores
    setInterval(async () => {
        try {
            await loadBotMessages();
        } catch (error) {
            // SILENCIAR COMPLETAMENTE: No mostrar nada en consola
        }
    }, 600000); // 10 minutos en lugar de 5 minutos
}

// ---------------------------------------------------------------------------
// NOTIFICATION FUNCTIONS
// ---------------------------------------------------------------------------
async function notifyOrderStatusChange(orderId, newStatus) {
    try {
        // Buscar el pedido
        const order = await apiRequest(`/orders/${orderId}`);

        if (!order || !order.customer_phone) return;
        
        // Si customer_phone es un JID completo (contiene @), usarlo directamente
        // Si no, construir el JID
        const jid = order.customer_phone.includes('@') 
            ? order.customer_phone 
            : `${order.customer_phone}@s.whatsapp.net`;
        
        let message = '';
        
        switch (newStatus) {
            case 'preparing':
                message = botMessages.order_preparing || '👨‍🍳 Tu pedido se está preparando';
                break;
            case 'ready':
                message = botMessages.order_ready || '✅ ¡Tu pedido está listo!';
                break;
            case 'out_for_delivery':
                message = botMessages.order_delivery || '🛵 ¡Tu pedido está en camino!';
                break;
            case 'delivered':
                message = botMessages.order_delivered || '🏁 ¡Pedido entregado!';
                break;
        }
        
        if (message) {
            // CORREGIDO: Usar order_number
            await sendMessage(jid, `🆔 Pedido ${order.order_number}\n\n${message}`);
        }
        
    } catch (error) {
        logger.error('❌ Error al notificar cambio de estado:', error.message);
    }
}

// ---------------------------------------------------------------------------
// ERROR HANDLERS
// ---------------------------------------------------------------------------
// NOTA: Los handlers principales de uncaughtException y unhandledRejection 
// ya están configurados arriba (líneas 208-248) con manejo especial para errores Bad MAC.
// NO agregar handlers duplicados aquí - los handlers ya están configurados correctamente

process.on('SIGINT', () => {
    logger.info('🛑 Recibida señal SIGINT, cerrando bot...');
    if (sock) sock.end();
    logger.info('✅ Bot cerrado correctamente');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('🛑 Recibida señal SIGTERM, cerrando bot...');
    if (sock) sock.end();
    process.exit(0);
});

// ---------------------------------------------------------------------------
// BOOTSTRAP
// ---------------------------------------------------------------------------
logger.info('🚀 Iniciando bot profesional de WhatsApp...');
startBot();

// Exportar funciones para uso externo
export { notifyOrderStatusChange, loadBotMessages };