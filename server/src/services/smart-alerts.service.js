/**
 * Sistema de Alertas Inteligentes
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class SmartAlertsService {
  ALERT_TYPES = {
    LOW_STOCK: 'low_stock',
    HIGH_DEMAND: 'high_demand',
    LOW_SALES: 'low_sales',
    NEGATIVE_REVIEW: 'negative_review',
    LONG_WAIT_TIME: 'long_wait_time',
    CANCELLED_ORDERS: 'cancelled_orders',
    PEAK_HOUR: 'peak_hour',
    GOAL_ACHIEVED: 'goal_achieved',
    GOAL_AT_RISK: 'goal_at_risk',
    NEW_COMPETITOR: 'new_competitor',
    DRIVER_OFFLINE: 'driver_offline',
    SYSTEM_ERROR: 'system_error',
  };

  SEVERITY = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' };

  /**
   * Crear alerta
   */
  async createAlert(storeId, type, data, severity = 'medium') {
    const alert = await prisma.alert.create({
      data: {
        storeId,
        type,
        title: this.getAlertTitle(type, data),
        message: this.getAlertMessage(type, data),
        severity,
        data: JSON.stringify(data),
        isRead: false,
        isDismissed: false,
      },
    });

    // Notificar en tiempo real via WebSocket
    this.broadcastAlert(storeId, alert);

    logger.info({ alertId: alert.id, type, severity }, 'Alert created');
    return alert;
  }

  getAlertTitle(type, data) {
    const titles = {
      [this.ALERT_TYPES.LOW_STOCK]: `Stock bajo: ${data.productName}`,
      [this.ALERT_TYPES.HIGH_DEMAND]: 'Alta demanda detectada',
      [this.ALERT_TYPES.LOW_SALES]: 'Ventas por debajo de lo esperado',
      [this.ALERT_TYPES.NEGATIVE_REVIEW]: 'Nueva reseña negativa',
      [this.ALERT_TYPES.LONG_WAIT_TIME]: 'Tiempo de espera elevado',
      [this.ALERT_TYPES.CANCELLED_ORDERS]: 'Aumento en cancelaciones',
      [this.ALERT_TYPES.PEAK_HOUR]: 'Hora pico detectada',
      [this.ALERT_TYPES.GOAL_ACHIEVED]: '🎉 Meta alcanzada',
      [this.ALERT_TYPES.GOAL_AT_RISK]: 'Meta en riesgo',
      [this.ALERT_TYPES.DRIVER_OFFLINE]: 'Repartidores insuficientes',
    };
    return titles[type] || 'Alerta';
  }

  getAlertMessage(type, data) {
    const messages = {
      [this.ALERT_TYPES.LOW_STOCK]: `${data.productName} tiene solo ${data.quantity} unidades`,
      [this.ALERT_TYPES.HIGH_DEMAND]: `${data.ordersInLastHour} pedidos en la última hora`,
      [this.ALERT_TYPES.LOW_SALES]: `Ventas ${data.percentBelow}% por debajo del promedio`,
      [this.ALERT_TYPES.NEGATIVE_REVIEW]: `Rating: ${data.rating}/5 - "${data.comment?.substring(0, 50)}..."`,
      [this.ALERT_TYPES.LONG_WAIT_TIME]: `Tiempo promedio: ${data.avgMinutes} min (normal: ${data.expectedMinutes} min)`,
      [this.ALERT_TYPES.CANCELLED_ORDERS]: `${data.cancelledCount} cancelaciones en las últimas ${data.hours} horas`,
      [this.ALERT_TYPES.PEAK_HOUR]: `Prepárate: ${data.expectedOrders} pedidos esperados`,
      [this.ALERT_TYPES.GOAL_ACHIEVED]: `¡Felicidades! ${data.goalName} completado`,
      [this.ALERT_TYPES.GOAL_AT_RISK]: `${data.goalName}: ${data.progress}% completado, quedan ${data.daysLeft} días`,
      [this.ALERT_TYPES.DRIVER_OFFLINE]: `Solo ${data.availableDrivers} repartidores disponibles`,
    };
    return messages[type] || data.message || '';
  }

  broadcastAlert(storeId, alert) {
    // Implementar con WebSocket service
    logger.debug({ storeId, alertId: alert.id }, 'Broadcasting alert');
  }

  /**
   * Ejecutar verificaciones automáticas
   */
  async runChecks(storeId) {
    const alerts = [];

    const checks = [
      this.checkLowStock(storeId),
      this.checkHighDemand(storeId),
      this.checkLowSales(storeId),
      this.checkWaitTimes(storeId),
      this.checkCancellations(storeId),
      this.checkDriverAvailability(storeId),
      this.checkGoals(storeId),
    ];

    const results = await Promise.all(checks);
    results.forEach(result => {
      if (result) alerts.push(...(Array.isArray(result) ? result : [result]));
    });

    return alerts;
  }

  async checkLowStock(storeId) {
    const lowStock = await prisma.inventory.findMany({
      where: {
        storeId,
        quantity: { lte: 5 },
      },
      include: { product: true },
    });

    const alerts = [];
    for (const item of lowStock) {
      const existing = await prisma.alert.findFirst({
        where: {
          storeId,
          type: this.ALERT_TYPES.LOW_STOCK,
          isDismissed: false,
          data: { contains: item.productId },
        },
      });

      if (!existing) {
        const alert = await this.createAlert(storeId, this.ALERT_TYPES.LOW_STOCK, {
          productId: item.productId,
          productName: item.product.name,
          quantity: item.quantity,
        }, item.quantity === 0 ? this.SEVERITY.CRITICAL : this.SEVERITY.HIGH);
        alerts.push(alert);
      }
    }
    return alerts;
  }

  async checkHighDemand(storeId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentOrders = await prisma.order.count({
      where: { storeId, createdAt: { gte: oneHourAgo } },
    });

    // Comparar con promedio histórico
    const avgHourlyOrders = await this.getAvgHourlyOrders(storeId);

    if (recentOrders > avgHourlyOrders * 1.5) {
      return this.createAlert(storeId, this.ALERT_TYPES.HIGH_DEMAND, {
        ordersInLastHour: recentOrders,
        avgHourly: avgHourlyOrders,
      }, this.SEVERITY.MEDIUM);
    }
    return null;
  }

  async getAvgHourlyOrders(storeId) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const orders = await prisma.order.count({
      where: { storeId, createdAt: { gte: sevenDaysAgo } },
    });
    return Math.round(orders / (7 * 24));
  }

  async checkLowSales(storeId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySales = await prisma.order.aggregate({
      where: { storeId, createdAt: { gte: today }, status: 'delivered' },
      _sum: { total: true },
    });

    const avgDailySales = await this.getAvgDailySales(storeId);
    const currentSales = todaySales._sum.total || 0;
    const hourOfDay = new Date().getHours();
    const expectedByNow = (avgDailySales / 24) * hourOfDay;

    if (currentSales < expectedByNow * 0.5 && hourOfDay >= 12) {
      return this.createAlert(storeId, this.ALERT_TYPES.LOW_SALES, {
        currentSales,
        expectedByNow: Math.round(expectedByNow),
        percentBelow: Math.round((1 - currentSales / expectedByNow) * 100),
      }, this.SEVERITY.MEDIUM);
    }
    return null;
  }

  async getAvgDailySales(storeId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sales = await prisma.order.aggregate({
      where: { storeId, createdAt: { gte: thirtyDaysAgo }, status: 'delivered' },
      _sum: { total: true },
    });
    return (sales._sum.total || 0) / 30;
  }

  async checkWaitTimes(storeId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentOrders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'delivered',
        deliveredAt: { gte: oneHourAgo },
      },
    });

    if (recentOrders.length < 3) return null;

    const avgWaitMinutes = recentOrders.reduce((sum, o) => {
      const wait = (o.deliveredAt - o.createdAt) / 60000;
      return sum + wait;
    }, 0) / recentOrders.length;

    if (avgWaitMinutes > 45) {
      return this.createAlert(storeId, this.ALERT_TYPES.LONG_WAIT_TIME, {
        avgMinutes: Math.round(avgWaitMinutes),
        expectedMinutes: 30,
        ordersAnalyzed: recentOrders.length,
      }, avgWaitMinutes > 60 ? this.SEVERITY.HIGH : this.SEVERITY.MEDIUM);
    }
    return null;
  }

  async checkCancellations(storeId) {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    
    const cancelled = await prisma.order.count({
      where: { storeId, status: 'cancelled', updatedAt: { gte: threeHoursAgo } },
    });

    if (cancelled >= 3) {
      return this.createAlert(storeId, this.ALERT_TYPES.CANCELLED_ORDERS, {
        cancelledCount: cancelled,
        hours: 3,
      }, cancelled >= 5 ? this.SEVERITY.HIGH : this.SEVERITY.MEDIUM);
    }
    return null;
  }

  async checkDriverAvailability(storeId) {
    const availableDrivers = await prisma.deliveryDriver.count({
      where: { storeId, status: 'available', isActive: true },
    });

    const pendingDeliveries = await prisma.order.count({
      where: { storeId, status: { in: ['ready', 'on_the_way'] } },
    });

    if (availableDrivers === 0 && pendingDeliveries > 0) {
      return this.createAlert(storeId, this.ALERT_TYPES.DRIVER_OFFLINE, {
        availableDrivers,
        pendingDeliveries,
      }, this.SEVERITY.HIGH);
    }
    return null;
  }

  async checkGoals(storeId) {
    const activeGoals = await prisma.goal.findMany({
      where: { storeId, status: 'active', endDate: { gte: new Date() } },
    });

    const alerts = [];

    for (const goal of activeGoals) {
      const daysLeft = Math.ceil((goal.endDate - new Date()) / (24 * 60 * 60 * 1000));
      const progress = (goal.currentValue / goal.targetValue) * 100;

      if (progress >= 100 && !goal.achievedAt) {
        alerts.push(await this.createAlert(storeId, this.ALERT_TYPES.GOAL_ACHIEVED, {
          goalId: goal.id,
          goalName: goal.name,
        }, this.SEVERITY.LOW));

        await prisma.goal.update({
          where: { id: goal.id },
          data: { achievedAt: new Date(), status: 'achieved' },
        });
      } else if (daysLeft <= 3 && progress < 80) {
        alerts.push(await this.createAlert(storeId, this.ALERT_TYPES.GOAL_AT_RISK, {
          goalId: goal.id,
          goalName: goal.name,
          progress: Math.round(progress),
          daysLeft,
        }, this.SEVERITY.MEDIUM));
      }
    }

    return alerts;
  }

  /**
   * Obtener alertas activas
   */
  async getActiveAlerts(storeId) {
    return prisma.alert.findMany({
      where: { storeId, isDismissed: false },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Marcar alerta como leída
   */
  async markAsRead(alertId) {
    await prisma.alert.update({
      where: { id: alertId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Descartar alerta
   */
  async dismissAlert(alertId) {
    await prisma.alert.update({
      where: { id: alertId },
      data: { isDismissed: true, dismissedAt: new Date() },
    });
  }
}

export const smartAlertsService = new SmartAlertsService();
export default smartAlertsService;

