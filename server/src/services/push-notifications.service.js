/**
 * Sistema de Notificaciones Push Segmentadas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class PushNotificationsService {
  /**
   * Segmentos predefinidos
   */
  SEGMENTS = {
    ALL: 'all',
    NEW_CUSTOMERS: 'new_customers',
    VIP_CUSTOMERS: 'vip_customers',
    INACTIVE: 'inactive',
    HIGH_SPENDERS: 'high_spenders',
    FREQUENT_BUYERS: 'frequent_buyers',
    CART_ABANDONERS: 'cart_abandoners',
    BIRTHDAY_TODAY: 'birthday_today',
    BY_LOCATION: 'by_location',
    BY_PRODUCT: 'by_product',
  };

  /**
   * Obtener usuarios por segmento
   */
  async getSegmentUsers(storeId, segment, options = {}) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    switch (segment) {
      case this.SEGMENTS.ALL:
        return prisma.customer.findMany({
          where: { pushToken: { not: null } },
          select: { id: true, pushToken: true, name: true },
        });

      case this.SEGMENTS.NEW_CUSTOMERS:
        return prisma.customer.findMany({
          where: {
            pushToken: { not: null },
            createdAt: { gte: thirtyDaysAgo },
          },
          select: { id: true, pushToken: true, name: true },
        });

      case this.SEGMENTS.VIP_CUSTOMERS:
        return prisma.customer.findMany({
          where: {
            pushToken: { not: null },
            loyalty: { tier: { in: ['gold', 'platinum'] } },
          },
          select: { id: true, pushToken: true, name: true },
        });

      case this.SEGMENTS.INACTIVE:
        return prisma.customer.findMany({
          where: {
            pushToken: { not: null },
            orders: { none: { createdAt: { gte: ninetyDaysAgo } } },
          },
          select: { id: true, pushToken: true, name: true },
        });

      case this.SEGMENTS.HIGH_SPENDERS:
        const highSpenders = await prisma.customer.findMany({
          where: { pushToken: { not: null } },
          include: {
            orders: {
              where: { status: 'delivered', createdAt: { gte: thirtyDaysAgo } },
              select: { total: true },
            },
          },
        });
        return highSpenders
          .filter(c => c.orders.reduce((sum, o) => sum + o.total, 0) > (options.minSpend || 10000))
          .map(({ id, pushToken, name }) => ({ id, pushToken, name }));

      case this.SEGMENTS.FREQUENT_BUYERS:
        const frequent = await prisma.customer.findMany({
          where: { pushToken: { not: null } },
          include: {
            _count: {
              select: { orders: { where: { createdAt: { gte: thirtyDaysAgo } } } },
            },
          },
        });
        return frequent
          .filter(c => c._count.orders >= (options.minOrders || 5))
          .map(({ id, pushToken, name }) => ({ id, pushToken, name }));

      case this.SEGMENTS.BIRTHDAY_TODAY:
        const today = new Date();
        return prisma.customer.findMany({
          where: {
            pushToken: { not: null },
            birthMonth: today.getMonth() + 1,
            birthDay: today.getDate(),
          },
          select: { id: true, pushToken: true, name: true },
        });

      case this.SEGMENTS.BY_LOCATION:
        return prisma.customer.findMany({
          where: {
            pushToken: { not: null },
            city: options.city,
          },
          select: { id: true, pushToken: true, name: true },
        });

      case this.SEGMENTS.BY_PRODUCT:
        return prisma.customer.findMany({
          where: {
            pushToken: { not: null },
            orders: {
              some: {
                items: { some: { productId: options.productId } },
              },
            },
          },
          select: { id: true, pushToken: true, name: true },
        });

      default:
        return [];
    }
  }

  /**
   * Enviar notificación a segmento
   */
  async sendToSegment(storeId, segment, notification, options = {}) {
    const users = await this.getSegmentUsers(storeId, segment, options);
    
    if (users.length === 0) {
      return { sent: 0, failed: 0, message: 'No hay usuarios en este segmento' };
    }

    const campaign = await prisma.pushCampaign.create({
      data: {
        storeId,
        segment,
        title: notification.title,
        body: notification.body,
        targetCount: users.length,
        status: 'sending',
      },
    });

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await this.sendPush(user.pushToken, {
          ...notification,
          body: notification.body.replace('{{name}}', user.name || 'Cliente'),
        });
        sent++;
      } catch (error) {
        failed++;
        logger.error({ userId: user.id, error: error.message }, 'Push failed');
      }
    }

    await prisma.pushCampaign.update({
      where: { id: campaign.id },
      data: { sentCount: sent, failedCount: failed, status: 'completed', completedAt: new Date() },
    });

    logger.info({ campaignId: campaign.id, sent, failed }, 'Push campaign completed');
    return { campaignId: campaign.id, sent, failed };
  }

  /**
   * Enviar push individual
   */
  async sendPush(token, notification) {
    // Implementación con Firebase/Expo/etc
    logger.info({ token: token.slice(0, 20), title: notification.title }, 'Sending push');
    // await firebase.messaging().send({ token, notification });
    return true;
  }

  /**
   * Programar campaña
   */
  async scheduleCampaign(storeId, segment, notification, scheduledFor, options = {}) {
    const users = await this.getSegmentUsers(storeId, segment, options);

    const campaign = await prisma.pushCampaign.create({
      data: {
        storeId,
        segment,
        title: notification.title,
        body: notification.body,
        targetCount: users.length,
        status: 'scheduled',
        scheduledFor: new Date(scheduledFor),
        options: JSON.stringify(options),
      },
    });

    logger.info({ campaignId: campaign.id, scheduledFor }, 'Campaign scheduled');
    return campaign;
  }

  /**
   * Obtener estadísticas de campañas
   */
  async getCampaignStats(storeId) {
    const campaigns = await prisma.pushCampaign.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const totals = await prisma.pushCampaign.aggregate({
      where: { storeId },
      _sum: { sentCount: true, failedCount: true },
      _count: true,
    });

    return {
      campaigns,
      totals: {
        campaigns: totals._count,
        sent: totals._sum.sentCount || 0,
        failed: totals._sum.failedCount || 0,
      },
    };
  }

  /**
   * Notificaciones automáticas por eventos
   */
  async sendOrderStatusNotification(orderId, status) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order?.customer?.pushToken) return;

    const messages = {
      confirmed: { title: '✅ Pedido confirmado', body: `Tu pedido #${order.orderNumber} está siendo preparado` },
      preparing: { title: '👨‍🍳 En preparación', body: `Tu pedido #${order.orderNumber} se está preparando` },
      ready: { title: '🎉 ¡Listo!', body: `Tu pedido #${order.orderNumber} está listo para recoger` },
      on_the_way: { title: '🛵 En camino', body: `Tu pedido #${order.orderNumber} va en camino` },
      delivered: { title: '📦 Entregado', body: `¡Tu pedido #${order.orderNumber} fue entregado! ¿Qué tal estuvo?` },
    };

    if (messages[status]) {
      await this.sendPush(order.customer.pushToken, messages[status]);
    }
  }
}

export const pushNotificationsService = new PushNotificationsService();
export default pushNotificationsService;
