/**
 * Servicio de Analytics y Conversión
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class AnalyticsService {
  /**
   * Registrar evento
   */
  async trackEvent(event, properties = {}) {
    const { storeId, userId, sessionId, eventType, data } = event;

    await prisma.analyticsEvent.create({
      data: {
        storeId,
        userId,
        sessionId,
        eventType,
        properties: JSON.stringify({ ...properties, ...data }),
        timestamp: new Date(),
        userAgent: properties.userAgent,
        ipAddress: properties.ip,
      },
    });
  }

  /**
   * Eventos predefinidos
   */
  async trackPageView(storeId, page, sessionId, userId = null) {
    await this.trackEvent({
      storeId,
      userId,
      sessionId,
      eventType: 'page_view',
      data: { page },
    });
  }

  async trackProductView(storeId, productId, sessionId, userId = null) {
    await this.trackEvent({
      storeId,
      userId,
      sessionId,
      eventType: 'product_view',
      data: { productId },
    });
  }

  async trackAddToCart(storeId, productId, quantity, sessionId, userId = null) {
    await this.trackEvent({
      storeId,
      userId,
      sessionId,
      eventType: 'add_to_cart',
      data: { productId, quantity },
    });
  }

  async trackCheckoutStart(storeId, cartValue, itemCount, sessionId, userId = null) {
    await this.trackEvent({
      storeId,
      userId,
      sessionId,
      eventType: 'checkout_start',
      data: { cartValue, itemCount },
    });
  }

  async trackOrderComplete(storeId, orderId, orderValue, sessionId, userId = null) {
    await this.trackEvent({
      storeId,
      userId,
      sessionId,
      eventType: 'order_complete',
      data: { orderId, orderValue },
    });
  }

  /**
   * Funnel de conversión
   */
  async getConversionFunnel(storeId, dateRange = {}) {
    const { startDate, endDate } = this.getDateRange(dateRange);

    const events = await prisma.analyticsEvent.groupBy({
      by: ['eventType'],
      where: {
        storeId,
        timestamp: { gte: startDate, lte: endDate },
        eventType: {
          in: ['page_view', 'product_view', 'add_to_cart', 'checkout_start', 'order_complete'],
        },
      },
      _count: { _all: true },
    });

    const counts = {};
    events.forEach(e => {
      counts[e.eventType] = e._count._all;
    });

    const funnel = [
      { step: 'Visitas', count: counts.page_view || 0, icon: '👁️' },
      { step: 'Vieron productos', count: counts.product_view || 0, icon: '🍕' },
      { step: 'Agregaron al carrito', count: counts.add_to_cart || 0, icon: '🛒' },
      { step: 'Iniciaron checkout', count: counts.checkout_start || 0, icon: '💳' },
      { step: 'Completaron pedido', count: counts.order_complete || 0, icon: '✅' },
    ];

    // Calcular tasas de conversión
    for (let i = 1; i < funnel.length; i++) {
      const prev = funnel[i - 1].count;
      const curr = funnel[i].count;
      funnel[i].conversionRate = prev > 0 ? Math.round((curr / prev) * 100) : 0;
      funnel[i].dropoff = prev > 0 ? Math.round(((prev - curr) / prev) * 100) : 0;
    }

    // Tasa de conversión global
    const globalRate = funnel[0].count > 0 
      ? Math.round((funnel[4].count / funnel[0].count) * 100 * 100) / 100 
      : 0;

    return {
      funnel,
      globalConversionRate: globalRate,
      period: { startDate, endDate },
    };
  }

  /**
   * Productos más vistos vs comprados
   */
  async getProductPerformance(storeId, dateRange = {}) {
    const { startDate, endDate } = this.getDateRange(dateRange);

    // Vistas por producto
    const views = await prisma.analyticsEvent.groupBy({
      by: ['properties'],
      where: {
        storeId,
        eventType: 'product_view',
        timestamp: { gte: startDate, lte: endDate },
      },
      _count: { _all: true },
    });

    // Agregar al carrito por producto
    const addToCart = await prisma.analyticsEvent.groupBy({
      by: ['properties'],
      where: {
        storeId,
        eventType: 'add_to_cart',
        timestamp: { gte: startDate, lte: endDate },
      },
      _count: { _all: true },
    });

    // Combinar datos
    const productStats = new Map();

    views.forEach(v => {
      try {
        const props = JSON.parse(v.properties);
        if (props.productId) {
          productStats.set(props.productId, {
            productId: props.productId,
            views: v._count._all,
            addToCart: 0,
          });
        }
      } catch {}
    });

    addToCart.forEach(a => {
      try {
        const props = JSON.parse(a.properties);
        if (props.productId) {
          const existing = productStats.get(props.productId) || { productId: props.productId, views: 0 };
          existing.addToCart = a._count._all;
          productStats.set(props.productId, existing);
        }
      } catch {}
    });

    // Calcular tasa de conversión por producto
    const results = Array.from(productStats.values()).map(p => ({
      ...p,
      conversionRate: p.views > 0 ? Math.round((p.addToCart / p.views) * 100) : 0,
    }));

    // Ordenar por vistas
    results.sort((a, b) => b.views - a.views);

    return results.slice(0, 20);
  }

  /**
   * Análisis de carritos abandonados
   */
  async getAbandonedCarts(storeId, dateRange = {}) {
    const { startDate, endDate } = this.getDateRange(dateRange);

    // Sesiones que agregaron al carrito
    const cartSessions = await prisma.analyticsEvent.findMany({
      where: {
        storeId,
        eventType: 'add_to_cart',
        timestamp: { gte: startDate, lte: endDate },
      },
      select: { sessionId: true },
      distinct: ['sessionId'],
    });

    // Sesiones que completaron pedido
    const completedSessions = await prisma.analyticsEvent.findMany({
      where: {
        storeId,
        eventType: 'order_complete',
        timestamp: { gte: startDate, lte: endDate },
      },
      select: { sessionId: true },
      distinct: ['sessionId'],
    });

    const completedSet = new Set(completedSessions.map(s => s.sessionId));
    const abandonedCount = cartSessions.filter(s => !completedSet.has(s.sessionId)).length;

    const abandonmentRate = cartSessions.length > 0
      ? Math.round((abandonedCount / cartSessions.length) * 100)
      : 0;

    return {
      totalCarts: cartSessions.length,
      completedCarts: completedSessions.length,
      abandonedCarts: abandonedCount,
      abandonmentRate,
    };
  }

  /**
   * Tiempo promedio hasta la compra
   */
  async getTimeToConversion(storeId, dateRange = {}) {
    const { startDate, endDate } = this.getDateRange(dateRange);

    // Obtener sesiones con primera visita y compra
    const sessions = await prisma.$queryRaw`
      SELECT 
        "sessionId",
        MIN(CASE WHEN "eventType" = 'page_view' THEN timestamp END) as first_visit,
        MIN(CASE WHEN "eventType" = 'order_complete' THEN timestamp END) as purchase_time
      FROM "AnalyticsEvent"
      WHERE "storeId" = ${storeId}
        AND timestamp >= ${startDate}
        AND timestamp <= ${endDate}
      GROUP BY "sessionId"
      HAVING MIN(CASE WHEN "eventType" = 'order_complete' THEN timestamp END) IS NOT NULL
    `;

    if (sessions.length === 0) {
      return { avgMinutes: 0, samples: 0 };
    }

    const times = sessions.map(s => {
      const diff = new Date(s.purchase_time) - new Date(s.first_visit);
      return diff / 60000; // minutos
    });

    const avgMinutes = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

    return {
      avgMinutes,
      samples: sessions.length,
      distribution: {
        under5min: times.filter(t => t < 5).length,
        '5to15min': times.filter(t => t >= 5 && t < 15).length,
        '15to30min': times.filter(t => t >= 15 && t < 30).length,
        over30min: times.filter(t => t >= 30).length,
      },
    };
  }

  /**
   * Métricas por hora del día
   */
  async getHourlyMetrics(storeId, dateRange = {}) {
    const { startDate, endDate } = this.getDateRange(dateRange);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        createdAt: true,
        total: true,
      },
    });

    const hourlyStats = Array(24).fill(null).map((_, hour) => ({
      hour,
      orders: 0,
      revenue: 0,
    }));

    orders.forEach(order => {
      const hour = new Date(order.createdAt).getHours();
      hourlyStats[hour].orders++;
      hourlyStats[hour].revenue += order.total;
    });

    // Encontrar horas pico
    const peakHour = hourlyStats.reduce((max, h) => h.orders > max.orders ? h : max, hourlyStats[0]);

    return {
      hourlyStats,
      peakHour: peakHour.hour,
      peakOrders: peakHour.orders,
    };
  }

  /**
   * Dashboard completo
   */
  async getDashboard(storeId, dateRange = {}) {
    const [funnel, abandonedCarts, timeToConversion, hourlyMetrics] = await Promise.all([
      this.getConversionFunnel(storeId, dateRange),
      this.getAbandonedCarts(storeId, dateRange),
      this.getTimeToConversion(storeId, dateRange),
      this.getHourlyMetrics(storeId, dateRange),
    ]);

    return {
      funnel,
      abandonedCarts,
      timeToConversion,
      hourlyMetrics,
    };
  }

  // Helpers
  getDateRange(range) {
    const endDate = range.endDate ? new Date(range.endDate) : new Date();
    const startDate = range.startDate 
      ? new Date(range.startDate) 
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    return { startDate, endDate };
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;

