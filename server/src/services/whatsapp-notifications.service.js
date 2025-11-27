/**
 * Sistema de Notificaciones WhatsApp Automáticas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class WhatsAppNotificationsService {
  /**
   * Templates de mensajes
   */
  TEMPLATES = {
    ORDER_CONFIRMED: {
      name: 'order_confirmed',
      message: (data) => `✅ *Pedido #${data.orderNumber} confirmado*\n\n` +
        `Hola ${data.customerName}!\n` +
        `Tu pedido fue confirmado y está siendo preparado.\n\n` +
        `📦 *Resumen:*\n${data.items}\n\n` +
        `💰 *Total:* $${data.total}\n` +
        `⏱️ *Tiempo estimado:* ${data.estimatedTime} min\n\n` +
        `Seguí tu pedido acá: ${data.trackingUrl}`,
    },

    ORDER_PREPARING: {
      name: 'order_preparing',
      message: (data) => `👨‍🍳 *Tu pedido está siendo preparado*\n\n` +
        `Pedido #${data.orderNumber}\n` +
        `Estamos cocinando tu pedido con mucho amor 🍳`,
    },

    ORDER_READY: {
      name: 'order_ready',
      message: (data) => data.type === 'pickup'
        ? `🎉 *Tu pedido está listo para retirar!*\n\n` +
          `Pedido #${data.orderNumber}\n` +
          `Pasá a buscarlo por ${data.storeAddress}\n\n` +
          `📍 ${data.storeAddress}`
        : `🚗 *Tu pedido está listo y saliendo!*\n\n` +
          `Pedido #${data.orderNumber}\n` +
          `El repartidor ya está en camino.`,
    },

    ORDER_ON_THE_WAY: {
      name: 'order_on_the_way',
      message: (data) => `🛵 *Tu pedido está en camino!*\n\n` +
        `Pedido #${data.orderNumber}\n` +
        `${data.driverName ? `Repartidor: ${data.driverName}\n` : ''}` +
        `⏱️ Llegada estimada: ${data.eta} min\n\n` +
        `Seguí el recorrido: ${data.trackingUrl}`,
    },

    ORDER_DELIVERED: {
      name: 'order_delivered',
      message: (data) => `✨ *Pedido entregado!*\n\n` +
        `Esperamos que disfrutes tu pedido #${data.orderNumber}\n\n` +
        `¿Cómo estuvo todo? Calificá tu experiencia:\n${data.ratingUrl}\n\n` +
        `¡Gracias por elegirnos! 💜`,
    },

    ORDER_CANCELLED: {
      name: 'order_cancelled',
      message: (data) => `❌ *Pedido cancelado*\n\n` +
        `Tu pedido #${data.orderNumber} fue cancelado.\n` +
        `${data.reason ? `Motivo: ${data.reason}\n` : ''}\n` +
        `Si tenés alguna consulta, escribinos.`,
    },

    PROMOTION: {
      name: 'promotion',
      message: (data) => `🎉 *${data.title}*\n\n` +
        `${data.description}\n\n` +
        `${data.code ? `🎟️ Usá el código: *${data.code}*\n` : ''}` +
        `${data.validUntil ? `⏰ Válido hasta: ${data.validUntil}\n` : ''}\n` +
        `Pedí ahora: ${data.orderUrl}`,
    },

    ABANDONED_CART: {
      name: 'abandoned_cart',
      message: (data) => `🛒 *¿Olvidaste algo?*\n\n` +
        `Hola ${data.customerName}!\n` +
        `Tenés productos esperándote en tu carrito.\n\n` +
        `${data.items}\n\n` +
        `Completá tu pedido: ${data.cartUrl}`,
    },

    LOYALTY_REWARD: {
      name: 'loyalty_reward',
      message: (data) => `🎁 *Tenés una recompensa!*\n\n` +
        `Hola ${data.customerName}!\n` +
        `Acumulaste ${data.points} puntos y podés canjear:\n\n` +
        `🏆 ${data.rewardName}\n\n` +
        `Canjeá tu premio: ${data.redeemUrl}`,
    },

    BIRTHDAY: {
      name: 'birthday',
      message: (data) => `🎂 *¡Feliz cumpleaños ${data.customerName}!*\n\n` +
        `Queremos celebrar con vos 🎉\n\n` +
        `Te regalamos: ${data.gift}\n` +
        `Código: *${data.code}*\n\n` +
        `Válido hoy. ¡Disfrutalo!`,
    },

    REORDER_REMINDER: {
      name: 'reorder_reminder',
      message: (data) => `👋 *Te extrañamos!*\n\n` +
        `Hola ${data.customerName}!\n` +
        `Hace ${data.daysSinceLastOrder} días que no pedís.\n\n` +
        `¿Querés repetir tu último pedido?\n${data.lastOrderItems}\n\n` +
        `Pedí de nuevo: ${data.reorderUrl}`,
    },
  };

  /**
   * Enviar notificación de estado de pedido
   */
  async sendOrderStatusNotification(orderId, status) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        store: true,
        items: { include: { product: true } },
        deliveryPerson: true,
      },
    });

    if (!order?.customer?.phone) {
      logger.warn({ orderId }, 'No phone number for order notification');
      return;
    }

    const templateMap = {
      confirmed: 'ORDER_CONFIRMED',
      preparing: 'ORDER_PREPARING',
      ready: 'ORDER_READY',
      on_the_way: 'ORDER_ON_THE_WAY',
      delivered: 'ORDER_DELIVERED',
      cancelled: 'ORDER_CANCELLED',
    };

    const templateKey = templateMap[status];
    if (!templateKey) return;

    const template = this.TEMPLATES[templateKey];
    const data = this.buildOrderData(order, status);
    const message = template.message(data);

    await this.sendMessage(order.customer.phone, message);

    // Registrar notificación
    await prisma.notificationLog.create({
      data: {
        type: 'whatsapp',
        template: template.name,
        recipientPhone: order.customer.phone,
        orderId,
        status: 'sent',
      },
    });

    logger.info({ orderId, status, phone: order.customer.phone }, 'WhatsApp notification sent');
  }

  buildOrderData(order, status) {
    const items = order.items.map(i => `• ${i.quantity}x ${i.product.name}`).join('\n');

    return {
      orderNumber: order.orderNumber,
      customerName: order.customer.name?.split(' ')[0] || 'Cliente',
      items,
      total: order.total.toLocaleString(),
      estimatedTime: order.estimatedDeliveryTime || 30,
      type: order.type,
      storeAddress: order.store.address,
      driverName: order.deliveryPerson?.name,
      eta: 15,
      trackingUrl: `${process.env.APP_URL}/track/${order.id}`,
      ratingUrl: `${process.env.APP_URL}/rate/${order.id}`,
      reason: order.cancellationReason,
    };
  }

  /**
   * Enviar mensaje de WhatsApp
   */
  async sendMessage(phone, message) {
    // Formatear número
    const formattedPhone = this.formatPhone(phone);

    // Aquí integrar con API de WhatsApp (Twilio, Meta, etc.)
    // Por ahora solo loguear
    logger.info({ phone: formattedPhone, messageLength: message.length }, 'WhatsApp message queued');

    // Ejemplo con Twilio:
    // await twilioClient.messages.create({
    //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    //   to: `whatsapp:${formattedPhone}`,
    //   body: message,
    // });

    return { success: true, phone: formattedPhone };
  }

  formatPhone(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (!cleaned.startsWith('54')) {
      cleaned = '54' + cleaned;
    }
    return '+' + cleaned;
  }

  /**
   * Enviar promoción masiva
   */
  async sendPromotion(storeId, promotionData, segment = 'all') {
    const customers = await this.getCustomersBySegment(storeId, segment);

    const template = this.TEMPLATES.PROMOTION;
    const message = template.message({
      ...promotionData,
      orderUrl: `${process.env.APP_URL}/store/${storeId}`,
    });

    let sent = 0;
    let failed = 0;

    for (const customer of customers) {
      if (!customer.phone) continue;

      try {
        await this.sendMessage(customer.phone, message);
        sent++;
      } catch (error) {
        failed++;
        logger.error({ customerId: customer.id, error }, 'Failed to send promotion');
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info({ storeId, sent, failed }, 'Promotion campaign completed');
    return { sent, failed };
  }

  async getCustomersBySegment(storeId, segment) {
    const where = { orders: { some: { storeId } } };

    switch (segment) {
      case 'active':
        where.orders = {
          some: {
            storeId,
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        };
        break;

      case 'inactive':
        // Clientes que no pidieron en 30+ días
        break;

      case 'vip':
        where.loyaltyTier = { in: ['gold', 'platinum'] };
        break;
    }

    return prisma.customer.findMany({
      where,
      select: { id: true, phone: true, name: true },
    });
  }

  /**
   * Recordatorio de carrito abandonado
   */
  async sendAbandonedCartReminder(customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer?.phone) return;

    const cart = await prisma.cart.findFirst({
      where: { customerId },
      include: { items: { include: { product: true } } },
    });

    if (!cart || cart.items.length === 0) return;

    const items = cart.items.map(i => `• ${i.quantity}x ${i.product.name}`).join('\n');

    const message = this.TEMPLATES.ABANDONED_CART.message({
      customerName: customer.name?.split(' ')[0] || 'Cliente',
      items,
      cartUrl: `${process.env.APP_URL}/cart`,
    });

    await this.sendMessage(customer.phone, message);
  }

  /**
   * Notificación de cumpleaños
   */
  async sendBirthdayGreeting(customerId, giftCode) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer?.phone) return;

    const message = this.TEMPLATES.BIRTHDAY.message({
      customerName: customer.name?.split(' ')[0] || 'Cliente',
      gift: '20% de descuento en tu pedido',
      code: giftCode,
    });

    await this.sendMessage(customer.phone, message);
  }

  /**
   * Recordatorio de reorden
   */
  async sendReorderReminder(customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer?.phone) return;

    const lastOrder = await prisma.order.findFirst({
      where: { customerId, status: 'delivered' },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: true } } },
    });

    if (!lastOrder) return;

    const daysSince = Math.floor((Date.now() - lastOrder.createdAt) / (1000 * 60 * 60 * 24));
    const items = lastOrder.items.slice(0, 3).map(i => `• ${i.product.name}`).join('\n');

    const message = this.TEMPLATES.REORDER_REMINDER.message({
      customerName: customer.name?.split(' ')[0] || 'Cliente',
      daysSinceLastOrder: daysSince,
      lastOrderItems: items,
      reorderUrl: `${process.env.APP_URL}/reorder/${lastOrder.id}`,
    });

    await this.sendMessage(customer.phone, message);
  }

  /**
   * Configurar preferencias de notificación
   */
  async updateNotificationPreferences(customerId, preferences) {
    return prisma.customer.update({
      where: { id: customerId },
      data: {
        whatsappNotifications: preferences.enabled,
        notificationPreferences: JSON.stringify(preferences.types || {}),
      },
    });
  }
}

export const whatsappNotificationsService = new WhatsAppNotificationsService();
export default whatsappNotificationsService;

