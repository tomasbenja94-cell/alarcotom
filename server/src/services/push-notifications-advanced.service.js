/**
 * Sistema Avanzado de Notificaciones Push
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import webpush from 'web-push';

class PushNotificationsAdvancedService {
  constructor() {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        `mailto:${process.env.CONTACT_EMAIL || 'admin@example.com'}`,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    }
  }

  NOTIFICATION_TYPES = {
    ORDER_STATUS: 'order_status',
    PROMOTION: 'promotion',
    REMINDER: 'reminder',
    LOYALTY: 'loyalty',
    SYSTEM: 'system',
    MARKETING: 'marketing',
    TRANSACTIONAL: 'transactional',
  };

  /**
   * Registrar suscripción push
   */
  async registerSubscription(userId, subscription, deviceInfo = {}) {
    const existing = await prisma.pushSubscription.findFirst({
      where: { userId, endpoint: subscription.endpoint },
    });

    if (existing) {
      return prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          keys: JSON.stringify(subscription.keys),
          deviceInfo: JSON.stringify(deviceInfo),
          lastActiveAt: new Date(),
        },
      });
    }

    return prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: subscription.endpoint,
        keys: JSON.stringify(subscription.keys),
        deviceInfo: JSON.stringify(deviceInfo),
        isActive: true,
      },
    });
  }

  /**
   * Enviar notificación a usuario
   */
  async sendToUser(userId, notification) {
    const { title, body, icon, badge, data, type, actions } = notification;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
    });

    if (subscriptions.length === 0) {
      logger.warn({ userId }, 'No push subscriptions found');
      return { sent: 0 };
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: icon || '/icons/notification.png',
      badge: badge || '/icons/badge.png',
      data: { ...data, type },
      actions: actions || [],
      timestamp: Date.now(),
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: JSON.parse(sub.keys),
        }, payload);

        sent++;

        // Registrar notificación enviada
        await prisma.pushNotificationLog.create({
          data: {
            subscriptionId: sub.id,
            userId,
            type,
            title,
            body,
            status: 'sent',
          },
        });
      } catch (error) {
        failed++;
        logger.error({ error, subscriptionId: sub.id }, 'Push notification failed');

        // Desactivar suscripción si expiró
        if (error.statusCode === 410 || error.statusCode === 404) {
          await prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
        }
      }
    }

    return { sent, failed };
  }

  /**
   * Enviar a múltiples usuarios
   */
  async sendToUsers(userIds, notification) {
    const results = { sent: 0, failed: 0 };

    for (const userId of userIds) {
      const result = await this.sendToUser(userId, notification);
      results.sent += result.sent;
      results.failed += result.failed;
    }

    return results;
  }

  /**
   * Enviar a segmento de usuarios
   */
  async sendToSegment(storeId, segment, notification) {
    let userIds = [];

    switch (segment) {
      case 'all':
        const allSubs = await prisma.pushSubscription.findMany({
          where: { user: { orders: { some: { storeId } } }, isActive: true },
          select: { userId: true },
        });
        userIds = [...new Set(allSubs.map(s => s.userId))];
        break;

      case 'active':
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const activeSubs = await prisma.pushSubscription.findMany({
          where: {
            user: { orders: { some: { storeId, createdAt: { gte: thirtyDaysAgo } } } },
            isActive: true,
          },
          select: { userId: true },
        });
        userIds = [...new Set(activeSubs.map(s => s.userId))];
        break;

      case 'inactive':
        const inactiveSubs = await prisma.pushSubscription.findMany({
          where: {
            user: {
              orders: { some: { storeId } },
              NOT: { orders: { some: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } } },
            },
            isActive: true,
          },
          select: { userId: true },
        });
        userIds = [...new Set(inactiveSubs.map(s => s.userId))];
        break;

      case 'vip':
        const vipSubs = await prisma.pushSubscription.findMany({
          where: { user: { loyaltyTier: { in: ['gold', 'platinum'] } }, isActive: true },
          select: { userId: true },
        });
        userIds = [...new Set(vipSubs.map(s => s.userId))];
        break;
    }

    logger.info({ segment, userCount: userIds.length }, 'Sending to segment');
    return this.sendToUsers(userIds, notification);
  }

  /**
   * Programar notificación
   */
  async scheduleNotification(notification, sendAt) {
    return prisma.scheduledNotification.create({
      data: {
        ...notification,
        data: JSON.stringify(notification.data || {}),
        actions: JSON.stringify(notification.actions || []),
        sendAt: new Date(sendAt),
        status: 'scheduled',
      },
    });
  }

  /**
   * Procesar notificaciones programadas
   */
  async processScheduledNotifications() {
    const pending = await prisma.scheduledNotification.findMany({
      where: { status: 'scheduled', sendAt: { lte: new Date() } },
    });

    for (const notif of pending) {
      try {
        if (notif.userId) {
          await this.sendToUser(notif.userId, {
            ...notif,
            data: JSON.parse(notif.data || '{}'),
            actions: JSON.parse(notif.actions || '[]'),
          });
        } else if (notif.segment) {
          await this.sendToSegment(notif.storeId, notif.segment, {
            ...notif,
            data: JSON.parse(notif.data || '{}'),
            actions: JSON.parse(notif.actions || '[]'),
          });
        }

        await prisma.scheduledNotification.update({
          where: { id: notif.id },
          data: { status: 'sent', sentAt: new Date() },
        });
      } catch (error) {
        logger.error({ notificationId: notif.id, error }, 'Failed to send scheduled notification');
        await prisma.scheduledNotification.update({
          where: { id: notif.id },
          data: { status: 'failed', error: error.message },
        });
      }
    }

    return { processed: pending.length };
  }

  /**
   * Notificaciones de estado de pedido
   */
  async sendOrderStatusNotification(orderId, status) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, store: true },
    });

    if (!order?.customer?.userId) return;

    const messages = {
      confirmed: { title: '✅ Pedido confirmado', body: `Tu pedido #${order.orderNumber} fue confirmado` },
      preparing: { title: '👨‍🍳 Preparando tu pedido', body: `Tu pedido #${order.orderNumber} está siendo preparado` },
      ready: { title: '🍽️ Pedido listo', body: `Tu pedido #${order.orderNumber} está listo para retirar` },
      on_the_way: { title: '🚗 Pedido en camino', body: `Tu pedido #${order.orderNumber} está en camino` },
      delivered: { title: '🎉 Pedido entregado', body: `Tu pedido #${order.orderNumber} fue entregado. ¡Buen provecho!` },
    };

    const message = messages[status];
    if (!message) return;

    return this.sendToUser(order.customer.userId, {
      ...message,
      icon: order.store.logo,
      type: this.NOTIFICATION_TYPES.ORDER_STATUS,
      data: { orderId, orderNumber: order.orderNumber, status },
      actions: [
        { action: 'view', title: 'Ver pedido' },
        status === 'delivered' ? { action: 'rate', title: 'Calificar' } : null,
      ].filter(Boolean),
    });
  }

  /**
   * Notificación de promoción
   */
  async sendPromotionNotification(storeId, promotion) {
    return this.sendToSegment(storeId, 'active', {
      title: `🎉 ${promotion.title}`,
      body: promotion.description,
      icon: promotion.image,
      type: this.NOTIFICATION_TYPES.PROMOTION,
      data: { promotionId: promotion.id, code: promotion.code },
      actions: [{ action: 'view', title: 'Ver oferta' }],
    });
  }

  /**
   * Recordatorio de carrito abandonado
   */
  async sendAbandonedCartReminder(userId, cartItems) {
    const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    return this.sendToUser(userId, {
      title: '🛒 ¿Olvidaste algo?',
      body: `Tienes ${itemCount} productos en tu carrito esperándote`,
      type: this.NOTIFICATION_TYPES.REMINDER,
      data: { type: 'abandoned_cart' },
      actions: [{ action: 'checkout', title: 'Completar pedido' }],
    });
  }

  /**
   * Notificación de puntos de lealtad
   */
  async sendLoyaltyNotification(userId, event, data) {
    const messages = {
      points_earned: { title: '⭐ ¡Ganaste puntos!', body: `Sumaste ${data.points} puntos a tu cuenta` },
      level_up: { title: '🎊 ¡Subiste de nivel!', body: `Ahora sos cliente ${data.newLevel}` },
      reward_available: { title: '🎁 Recompensa disponible', body: `Podés canjear: ${data.rewardName}` },
    };

    const message = messages[event];
    if (!message) return;

    return this.sendToUser(userId, {
      ...message,
      type: this.NOTIFICATION_TYPES.LOYALTY,
      data: { event, ...data },
    });
  }

  /**
   * Configurar preferencias de notificación
   */
  async updatePreferences(userId, preferences) {
    return prisma.notificationPreferences.upsert({
      where: { userId },
      update: preferences,
      create: { userId, ...preferences },
    });
  }

  /**
   * Estadísticas de notificaciones
   */
  async getStats(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [sent, clicked, subscriptions] = await Promise.all([
      prisma.pushNotificationLog.count({
        where: { createdAt: { gte: startDate }, status: 'sent' },
      }),
      prisma.pushNotificationLog.count({
        where: { createdAt: { gte: startDate }, clickedAt: { not: null } },
      }),
      prisma.pushSubscription.count({
        where: { isActive: true },
      }),
    ]);

    return {
      period: `${days} días`,
      totalSent: sent,
      totalClicked: clicked,
      clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
      activeSubscriptions: subscriptions,
    };
  }

  /**
   * Registrar click en notificación
   */
  async recordClick(notificationId) {
    await prisma.pushNotificationLog.update({
      where: { id: notificationId },
      data: { clickedAt: new Date() },
    });
  }
}

export const pushNotificationsAdvancedService = new PushNotificationsAdvancedService();
export default pushNotificationsAdvancedService;

