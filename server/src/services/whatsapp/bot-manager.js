/**
 * Bot Manager Multi-Tienda
 * Gestiona múltiples instancias de WhatsApp por tienda
 */

import logger from '../../utils/logger.js';
import prisma from '../../utils/prisma.js';

class BotInstance {
  constructor(storeId, config) {
    this.storeId = storeId;
    this.config = config;
    this.socket = null;
    this.status = 'disconnected'; // disconnected, pending_qr, connected
    this.qrCode = null;
    this.connectedNumber = null;
    this.lastError = null;
    this.messageQueue = [];
    this.isProcessing = false;
  }

  async connect() {
    // Implementación específica con Baileys
    logger.info({ storeId: this.storeId }, 'Conectando bot WhatsApp');
  }

  async disconnect() {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
    }
    this.status = 'disconnected';
    this.qrCode = null;
    logger.info({ storeId: this.storeId }, 'Bot WhatsApp desconectado');
  }

  async sendMessage(to, message) {
    if (this.status !== 'connected' || !this.socket) {
      throw new Error('Bot no conectado');
    }
    
    // Agregar a cola
    this.messageQueue.push({ to, message, timestamp: Date.now() });
    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) return;
    
    this.isProcessing = true;
    
    while (this.messageQueue.length > 0) {
      const { to, message } = this.messageQueue.shift();
      
      try {
        await this.socket.sendMessage(to, { text: message });
        // Rate limiting: esperar entre mensajes
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error({ storeId: this.storeId, error: error.message }, 'Error enviando mensaje');
      }
    }
    
    this.isProcessing = false;
  }

  getStatus() {
    return {
      storeId: this.storeId,
      status: this.status,
      connectedNumber: this.connectedNumber,
      qrCode: this.qrCode,
      lastError: this.lastError,
      queueSize: this.messageQueue.length,
    };
  }
}

/**
 * Manager de bots multi-tienda
 */
class BotManager {
  constructor() {
    this.bots = new Map(); // storeId -> BotInstance
    this.initialized = false;
  }

  /**
   * Inicializar el manager y cargar bots configurados
   */
  async init() {
    if (this.initialized) return;
    
    try {
      // Cargar tiendas con WhatsApp habilitado
      const stores = await prisma.storeSettings.findMany({
        where: { whatsappBotEnabled: true },
        include: { store: true },
      });

      for (const settings of stores) {
        await this.createBot(settings.storeId, {
          storeName: settings.store?.name,
          whatsappNumber: settings.whatsappBotNumber,
        });
      }

      this.initialized = true;
      logger.info({ botCount: this.bots.size }, 'BotManager inicializado');
    } catch (error) {
      logger.error({ error: error.message }, 'Error inicializando BotManager');
    }
  }

  /**
   * Crear instancia de bot para una tienda
   */
  async createBot(storeId, config) {
    if (this.bots.has(storeId)) {
      logger.warn({ storeId }, 'Bot ya existe, desconectando anterior');
      await this.removeBot(storeId);
    }

    const bot = new BotInstance(storeId, config);
    this.bots.set(storeId, bot);
    
    logger.info({ storeId }, 'Bot creado');
    return bot;
  }

  /**
   * Obtener bot de una tienda
   */
  getBot(storeId) {
    return this.bots.get(storeId) || null;
  }

  /**
   * Eliminar bot de una tienda
   */
  async removeBot(storeId) {
    const bot = this.bots.get(storeId);
    if (bot) {
      await bot.disconnect();
      this.bots.delete(storeId);
      logger.info({ storeId }, 'Bot eliminado');
    }
  }

  /**
   * Conectar bot de una tienda
   */
  async connectBot(storeId) {
    let bot = this.getBot(storeId);
    
    if (!bot) {
      // Cargar configuración y crear bot
      const settings = await prisma.storeSettings.findUnique({
        where: { storeId },
        include: { store: true },
      });
      
      if (!settings) {
        throw new Error('Tienda no encontrada');
      }
      
      bot = await this.createBot(storeId, {
        storeName: settings.store?.name,
        whatsappNumber: settings.whatsappBotNumber,
      });
    }
    
    await bot.connect();
    return bot.getStatus();
  }

  /**
   * Desconectar bot de una tienda
   */
  async disconnectBot(storeId) {
    const bot = this.getBot(storeId);
    if (bot) {
      await bot.disconnect();
    }
  }

  /**
   * Obtener QR de una tienda
   */
  getQR(storeId) {
    const bot = this.getBot(storeId);
    return bot?.qrCode || null;
  }

  /**
   * Enviar mensaje desde una tienda
   */
  async sendMessage(storeId, to, message) {
    const bot = this.getBot(storeId);
    if (!bot) {
      throw new Error(`Bot no encontrado para tienda ${storeId}`);
    }
    
    await bot.sendMessage(to, message);
  }

  /**
   * Obtener estado de todos los bots
   */
  getAllStatus() {
    const statuses = [];
    for (const [storeId, bot] of this.bots) {
      statuses.push(bot.getStatus());
    }
    return statuses;
  }

  /**
   * Obtener estado de un bot específico
   */
  getBotStatus(storeId) {
    const bot = this.getBot(storeId);
    return bot?.getStatus() || { storeId, status: 'not_configured' };
  }

  /**
   * Estadísticas globales
   */
  getStats() {
    let connected = 0;
    let pending = 0;
    let disconnected = 0;
    
    for (const bot of this.bots.values()) {
      if (bot.status === 'connected') connected++;
      else if (bot.status === 'pending_qr') pending++;
      else disconnected++;
    }
    
    return {
      total: this.bots.size,
      connected,
      pending,
      disconnected,
    };
  }
}

// Singleton
export const botManager = new BotManager();
export default botManager;

