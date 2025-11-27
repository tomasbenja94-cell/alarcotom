/**
 * Servicio de Webhooks Salientes
 * Permite a cada tienda configurar webhooks para eventos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { jobQueue, JobTypes } from './job-queue.service.js';

// Eventos disponibles
export const WebhookEvents = {
  ORDER_CREATED: 'order.created',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_PREPARING: 'order.preparing',
  ORDER_READY: 'order.ready',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_CANCELLED: 'order.cancelled',
  PAYMENT_RECEIVED: 'payment.received',
  STOCK_LOW: 'stock.low',
  STORE_OPENED: 'store.opened',
  STORE_CLOSED: 'store.closed',
};

class WebhookOutgoingService {
  constructor() {
    // Cache de webhooks por tienda
    this.webhookCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Obtener webhooks configurados para una tienda
   */
  async getStoreWebhooks(storeId) {
    // Verificar cache
    const cached = this.webhookCache.get(storeId);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.webhooks;
    }

    // Cargar desde settings
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
    });

    // Webhooks almacenados en JSON
    // Formato: [{ url, events: [], secret, enabled, name }]
    let webhooks = [];
    try {
      if (settings?.paymentNotes) {
        // Usar campo temporal para webhooks (en producción, agregar campo dedicado)
        const config = JSON.parse(settings.paymentNotes);
        if (config.webhooks) {
          webhooks = config.webhooks;
        }
      }
    } catch (e) {
      // No es JSON o no tiene webhooks
    }

    // Guardar en cache
    this.webhookCache.set(storeId, {
      webhooks,
      timestamp: Date.now(),
    });

    return webhooks;
  }

  /**
   * Disparar evento de webhook
   */
  async triggerEvent(storeId, event, payload) {
    const webhooks = await this.getStoreWebhooks(storeId);
    
    // Filtrar webhooks que escuchan este evento
    const relevantWebhooks = webhooks.filter(
      wh => wh.enabled && wh.events.includes(event)
    );

    if (relevantWebhooks.length === 0) {
      return;
    }

    // Encolar envío de cada webhook
    for (const webhook of relevantWebhooks) {
      await jobQueue.addJob(JobTypes.SEND_WEBHOOK, {
        url: webhook.url,
        payload: {
          event,
          timestamp: new Date().toISOString(),
          storeId,
          data: payload,
        },
        headers: {
          'X-Webhook-Event': event,
          'X-Webhook-Signature': this.generateSignature(payload, webhook.secret),
          'X-Store-Id': storeId,
        },
        webhookId: webhook.id,
      }, {
        storeId,
        retries: 3,
      });
    }

    logger.info({
      storeId,
      event,
      webhookCount: relevantWebhooks.length,
    }, 'Webhook event triggered');
  }

  /**
   * Generar firma HMAC para el payload
   */
  generateSignature(payload, secret) {
    if (!secret) return '';
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Verificar firma de webhook entrante
   */
  verifySignature(payload, signature, secret) {
    const expected = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  }

  /**
   * Configurar webhook para una tienda
   */
  async configureWebhook(storeId, webhookConfig) {
    const { url, events, secret, name, enabled = true } = webhookConfig;

    // Validar URL
    try {
      new URL(url);
    } catch {
      throw new Error('URL inválida');
    }

    // Validar eventos
    const validEvents = Object.values(WebhookEvents);
    const invalidEvents = events.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      throw new Error(`Eventos inválidos: ${invalidEvents.join(', ')}`);
    }

    // Obtener configuración actual
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
    });

    let currentConfig = {};
    try {
      if (settings?.paymentNotes) {
        currentConfig = JSON.parse(settings.paymentNotes);
      }
    } catch {
      currentConfig = {};
    }

    // Agregar o actualizar webhook
    const webhooks = currentConfig.webhooks || [];
    const newWebhook = {
      id: crypto.randomUUID(),
      url,
      events,
      secret: secret || crypto.randomBytes(32).toString('hex'),
      name: name || `Webhook ${webhooks.length + 1}`,
      enabled,
      createdAt: new Date().toISOString(),
    };

    webhooks.push(newWebhook);
    currentConfig.webhooks = webhooks;

    // Guardar
    await prisma.storeSettings.update({
      where: { storeId },
      data: {
        paymentNotes: JSON.stringify(currentConfig),
      },
    });

    // Invalidar cache
    this.webhookCache.delete(storeId);

    logger.info({ storeId, webhookId: newWebhook.id, url }, 'Webhook configured');

    return newWebhook;
  }

  /**
   * Eliminar webhook
   */
  async deleteWebhook(storeId, webhookId) {
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
    });

    let currentConfig = {};
    try {
      if (settings?.paymentNotes) {
        currentConfig = JSON.parse(settings.paymentNotes);
      }
    } catch {
      return false;
    }

    const webhooks = currentConfig.webhooks || [];
    const index = webhooks.findIndex(wh => wh.id === webhookId);
    
    if (index === -1) {
      return false;
    }

    webhooks.splice(index, 1);
    currentConfig.webhooks = webhooks;

    await prisma.storeSettings.update({
      where: { storeId },
      data: {
        paymentNotes: JSON.stringify(currentConfig),
      },
    });

    // Invalidar cache
    this.webhookCache.delete(storeId);

    logger.info({ storeId, webhookId }, 'Webhook deleted');
    return true;
  }

  /**
   * Probar webhook (enviar evento de prueba)
   */
  async testWebhook(storeId, webhookId) {
    const webhooks = await this.getStoreWebhooks(storeId);
    const webhook = webhooks.find(wh => wh.id === webhookId);

    if (!webhook) {
      throw new Error('Webhook no encontrado');
    }

    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      storeId,
      data: {
        message: 'Este es un evento de prueba',
        webhookId,
      },
    };

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'webhook.test',
          'X-Webhook-Signature': this.generateSignature(testPayload.data, webhook.secret),
          'X-Store-Id': storeId,
        },
        body: JSON.stringify(testPayload),
      });

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Obtener eventos disponibles
   */
  getAvailableEvents() {
    return Object.entries(WebhookEvents).map(([key, value]) => ({
      key,
      event: value,
      description: this.getEventDescription(value),
    }));
  }

  /**
   * Obtener descripción de evento
   */
  getEventDescription(event) {
    const descriptions = {
      [WebhookEvents.ORDER_CREATED]: 'Cuando se crea un nuevo pedido',
      [WebhookEvents.ORDER_CONFIRMED]: 'Cuando se confirma un pedido',
      [WebhookEvents.ORDER_PREPARING]: 'Cuando se comienza a preparar',
      [WebhookEvents.ORDER_READY]: 'Cuando el pedido está listo',
      [WebhookEvents.ORDER_DELIVERED]: 'Cuando se entrega el pedido',
      [WebhookEvents.ORDER_CANCELLED]: 'Cuando se cancela un pedido',
      [WebhookEvents.PAYMENT_RECEIVED]: 'Cuando se recibe un pago',
      [WebhookEvents.STOCK_LOW]: 'Cuando el stock está bajo',
      [WebhookEvents.STORE_OPENED]: 'Cuando la tienda abre',
      [WebhookEvents.STORE_CLOSED]: 'Cuando la tienda cierra',
    };
    return descriptions[event] || event;
  }
}

export const webhookOutgoingService = new WebhookOutgoingService();
export default webhookOutgoingService;

