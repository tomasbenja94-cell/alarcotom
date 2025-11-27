/**
 * Calculadora de Tiempo de Preparación Inteligente
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class PrepTimeService {
  /**
   * Calcular tiempo estimado para un pedido
   */
  async calculatePrepTime(storeId, items, options = {}) {
    const { includeDelivery = true, deliveryDistance = 0 } = options;

    // Obtener configuración de la tienda
    const config = await this.getStoreConfig(storeId);

    // Tiempo base de preparación
    let prepTime = config.basePrepTime;

    // Sumar tiempo por cada item
    for (const item of items) {
      const productTime = await this.getProductPrepTime(item.productId, item.quantity);
      prepTime += productTime;
    }

    // Ajustar por carga actual
    const loadFactor = await this.getCurrentLoadFactor(storeId);
    prepTime = Math.ceil(prepTime * loadFactor);

    // Ajustar por hora del día
    const hourFactor = this.getHourFactor();
    prepTime = Math.ceil(prepTime * hourFactor);

    // Tiempo de delivery
    let deliveryTime = 0;
    if (includeDelivery && deliveryDistance > 0) {
      deliveryTime = this.calculateDeliveryTime(deliveryDistance, config);
    }

    const totalTime = prepTime + deliveryTime;

    return {
      prepTime,
      deliveryTime,
      totalTime,
      range: {
        min: Math.max(config.minPrepTime, totalTime - 5),
        max: totalTime + 10,
      },
      factors: {
        load: loadFactor,
        hour: hourFactor,
        items: items.length,
      },
    };
  }

  /**
   * Obtener configuración de tiempos de la tienda
   */
  async getStoreConfig(storeId) {
    const settings = await prisma.storeSettings.findUnique({ where: { storeId } });

    const defaults = {
      basePrepTime: 10, // minutos base
      minPrepTime: 15,
      maxPrepTime: 60,
      deliverySpeedKmPerMin: 0.5, // 30 km/h aprox
      deliveryBaseTime: 5,
      maxConcurrentOrders: 10,
    };

    if (!settings?.prepTimeConfig) return defaults;

    try {
      return { ...defaults, ...JSON.parse(settings.prepTimeConfig) };
    } catch {
      return defaults;
    }
  }

  /**
   * Obtener tiempo de preparación de un producto
   */
  async getProductPrepTime(productId, quantity) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { prepTime: true, category: { select: { prepTime: true } } },
    });

    // Tiempo del producto o de la categoría o default
    const baseTime = product?.prepTime || product?.category?.prepTime || 3;

    // El tiempo no escala linealmente con la cantidad
    // 1 item = 100%, 2 items = 150%, 3+ items = 175%
    const quantityFactor = quantity === 1 ? 1 : quantity === 2 ? 1.5 : 1.75;

    return Math.ceil(baseTime * quantityFactor);
  }

  /**
   * Calcular factor de carga actual
   */
  async getCurrentLoadFactor(storeId) {
    const config = await this.getStoreConfig(storeId);

    // Contar pedidos activos
    const activeOrders = await prisma.order.count({
      where: {
        storeId,
        status: { in: ['pending', 'confirmed', 'preparing'] },
      },
    });

    // Factor: 1.0 si hay pocos pedidos, hasta 2.0 si está al máximo
    const loadRatio = activeOrders / config.maxConcurrentOrders;
    return Math.min(2, 1 + loadRatio * 0.5);
  }

  /**
   * Factor según hora del día
   */
  getHourFactor() {
    const hour = new Date().getHours();

    // Horas pico: 12-14 y 20-22
    if ((hour >= 12 && hour <= 14) || (hour >= 20 && hour <= 22)) {
      return 1.3;
    }

    // Horas tranquilas
    if (hour < 11 || (hour > 15 && hour < 19) || hour > 23) {
      return 0.9;
    }

    return 1.0;
  }

  /**
   * Calcular tiempo de delivery
   */
  calculateDeliveryTime(distanceKm, config) {
    const travelTime = Math.ceil(distanceKm / config.deliverySpeedKmPerMin);
    return config.deliveryBaseTime + travelTime;
  }

  /**
   * Actualizar tiempo real de un pedido
   */
  async updateOrderEstimate(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) return null;

    const estimate = await this.calculatePrepTime(
      order.storeId,
      order.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      { includeDelivery: !!order.customerAddress }
    );

    await prisma.order.update({
      where: { id: orderId },
      data: {
        estimatedPrepTime: estimate.prepTime,
        estimatedDeliveryTime: estimate.deliveryTime,
        estimatedReadyAt: new Date(Date.now() + estimate.prepTime * 60000),
      },
    });

    return estimate;
  }

  /**
   * Aprender de pedidos completados
   */
  async learnFromCompletedOrder(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order || !order.prepStartedAt || !order.prepCompletedAt) return;

    const actualPrepTime = Math.round(
      (new Date(order.prepCompletedAt).getTime() - new Date(order.prepStartedAt).getTime()) / 60000
    );

    // Actualizar tiempo promedio de cada producto
    for (const item of order.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          avgPrepTime: {
            // Promedio móvil
            set: await this.calculateMovingAverage(item.productId, actualPrepTime / order.items.length),
          },
        },
      });
    }

    logger.info({ orderId, actualPrepTime }, 'Learned from completed order');
  }

  /**
   * Calcular promedio móvil
   */
  async calculateMovingAverage(productId, newTime) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { avgPrepTime: true, prepTimeCount: true },
    });

    const currentAvg = product?.avgPrepTime || newTime;
    const count = (product?.prepTimeCount || 0) + 1;

    // Promedio móvil exponencial
    const alpha = 0.2;
    return Math.round(currentAvg * (1 - alpha) + newTime * alpha);
  }

  /**
   * Obtener estadísticas de tiempos
   */
  async getTimeStats(storeId, days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'delivered',
        createdAt: { gte: startDate },
        prepStartedAt: { not: null },
        prepCompletedAt: { not: null },
      },
      select: {
        estimatedPrepTime: true,
        prepStartedAt: true,
        prepCompletedAt: true,
        createdAt: true,
      },
    });

    if (orders.length === 0) {
      return { avgPrepTime: 0, accuracy: 0, samples: 0 };
    }

    let totalActual = 0;
    let totalEstimated = 0;
    let accurateCount = 0;

    for (const order of orders) {
      const actual = Math.round(
        (new Date(order.prepCompletedAt).getTime() - new Date(order.prepStartedAt).getTime()) / 60000
      );
      totalActual += actual;
      totalEstimated += order.estimatedPrepTime || 0;

      // Consideramos "preciso" si está dentro del 20%
      if (order.estimatedPrepTime) {
        const diff = Math.abs(actual - order.estimatedPrepTime) / order.estimatedPrepTime;
        if (diff <= 0.2) accurateCount++;
      }
    }

    return {
      avgPrepTime: Math.round(totalActual / orders.length),
      avgEstimated: Math.round(totalEstimated / orders.length),
      accuracy: Math.round((accurateCount / orders.length) * 100),
      samples: orders.length,
    };
  }
}

export const prepTimeService = new PrepTimeService();
export default prepTimeService;

