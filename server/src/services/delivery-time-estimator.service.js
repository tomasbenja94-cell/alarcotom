/**
 * Estimador Inteligente de Tiempo de Entrega
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DeliveryTimeEstimatorService {
  /**
   * Estimar tiempo de entrega
   */
  async estimate(storeId, orderData) {
    const { items, deliveryLat, deliveryLng, type } = orderData;

    // Componentes del tiempo
    const preparationTime = await this.estimatePreparationTime(storeId, items);
    const deliveryTime = type === 'delivery'
      ? await this.estimateDeliveryTime(storeId, deliveryLat, deliveryLng)
      : 0;
    const queueTime = await this.estimateQueueTime(storeId);

    const totalMinutes = preparationTime + deliveryTime + queueTime;

    // Agregar buffer según hora del día
    const buffer = this.getTimeBuffer(storeId);

    const finalEstimate = Math.round(totalMinutes + buffer);

    return {
      totalMinutes: finalEstimate,
      breakdown: {
        preparation: preparationTime,
        delivery: deliveryTime,
        queue: queueTime,
        buffer,
      },
      range: {
        min: Math.max(10, finalEstimate - 10),
        max: finalEstimate + 15,
      },
      confidence: this.calculateConfidence(queueTime),
    };
  }

  /**
   * Estimar tiempo de preparación basado en items
   */
  async estimatePreparationTime(storeId, items) {
    if (!items || items.length === 0) return 15;

    let totalTime = 0;
    let maxItemTime = 0;

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { preparationTime: true, category: { select: { avgPrepTime: true } } },
      });

      const itemTime = product?.preparationTime || product?.category?.avgPrepTime || 10;
      const itemTotalTime = itemTime + (item.quantity - 1) * Math.ceil(itemTime * 0.3);

      maxItemTime = Math.max(maxItemTime, itemTime);
      totalTime += itemTotalTime * 0.5; // Preparación en paralelo
    }

    // El tiempo es el máximo item + parte del resto (preparación paralela)
    return Math.round(maxItemTime + totalTime * 0.3);
  }

  /**
   * Estimar tiempo de delivery basado en distancia y tráfico
   */
  async estimateDeliveryTime(storeId, lat, lng) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store || !lat || !lng) return 20;

    const distance = this.calculateDistance(store.lat, store.lng, lat, lng);

    // Tiempo base: 3 min/km en moto
    let baseTime = distance * 3;

    // Factor de tráfico según hora
    const hour = new Date().getHours();
    let trafficMultiplier = 1;

    if ((hour >= 12 && hour <= 14) || (hour >= 19 && hour <= 21)) {
      trafficMultiplier = 1.5; // Hora pico
    } else if (hour >= 7 && hour <= 9) {
      trafficMultiplier = 1.3; // Hora pico mañana
    }

    // Factor clima (simplificado)
    const weatherMultiplier = 1; // Integrar con API de clima

    return Math.round(baseTime * trafficMultiplier * weatherMultiplier + 5); // +5 min entrega
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Estimar tiempo de cola basado en pedidos activos
   */
  async estimateQueueTime(storeId) {
    const activeOrders = await prisma.order.count({
      where: {
        storeId,
        status: { in: ['pending', 'confirmed', 'preparing'] },
      },
    });

    // Cada pedido activo agrega ~5 min
    return Math.min(activeOrders * 5, 30); // Máximo 30 min de cola
  }

  /**
   * Buffer según hora del día y día de la semana
   */
  getTimeBuffer() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Fin de semana
    if (day === 0 || day === 6) {
      if (hour >= 12 && hour <= 15) return 15;
      if (hour >= 19 && hour <= 22) return 20;
    }

    // Entre semana
    if (hour >= 12 && hour <= 14) return 10;
    if (hour >= 19 && hour <= 21) return 15;

    return 5;
  }

  calculateConfidence(queueTime) {
    if (queueTime <= 5) return 'high';
    if (queueTime <= 15) return 'medium';
    return 'low';
  }

  /**
   * Actualizar tiempos de preparación basado en histórico
   */
  async updatePreparationTimes(storeId) {
    const recentOrders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'delivered',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        preparedAt: { not: null },
      },
      include: { items: { select: { productId: true, quantity: true } } },
    });

    const productTimes = {};

    recentOrders.forEach(order => {
      if (!order.preparedAt || !order.confirmedAt) return;

      const prepTime = (order.preparedAt - order.confirmedAt) / 60000;
      const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
      const avgPerItem = prepTime / itemCount;

      order.items.forEach(item => {
        if (!productTimes[item.productId]) {
          productTimes[item.productId] = [];
        }
        productTimes[item.productId].push(avgPerItem);
      });
    });

    // Actualizar tiempos promedio
    for (const [productId, times] of Object.entries(productTimes)) {
      if (times.length >= 5) {
        const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        await prisma.product.update({
          where: { id: productId },
          data: { preparationTime: avg },
        });
      }
    }

    return { updated: Object.keys(productTimes).length };
  }

  /**
   * Obtener estadísticas de precisión
   */
  async getAccuracyStats(storeId, days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'delivered',
        createdAt: { gte: startDate },
        estimatedDeliveryTime: { not: null },
        deliveredAt: { not: null },
      },
      select: {
        createdAt: true,
        estimatedDeliveryTime: true,
        deliveredAt: true,
      },
    });

    if (orders.length === 0) return { accuracy: 0, avgDeviation: 0 };

    let onTime = 0;
    let totalDeviation = 0;

    orders.forEach(order => {
      const estimated = order.estimatedDeliveryTime;
      const actual = Math.round((order.deliveredAt - order.createdAt) / 60000);
      const deviation = actual - estimated;

      totalDeviation += Math.abs(deviation);
      if (deviation <= 10) onTime++;
    });

    return {
      totalOrders: orders.length,
      onTimePercent: Math.round((onTime / orders.length) * 100),
      avgDeviation: Math.round(totalDeviation / orders.length),
    };
  }

  /**
   * Obtener tiempo estimado actual para mostrar en tienda
   */
  async getCurrentEstimate(storeId) {
    const queueTime = await this.estimateQueueTime(storeId);
    const buffer = this.getTimeBuffer();
    const basePrep = 15;

    const estimate = basePrep + queueTime + buffer;

    let status = 'normal';
    if (queueTime > 20) status = 'busy';
    if (queueTime > 30) status = 'very_busy';

    return {
      deliveryMinutes: estimate + 15, // +15 para delivery promedio
      pickupMinutes: estimate,
      status,
      message: status === 'very_busy'
        ? '⚠️ Alta demanda - tiempos más largos'
        : status === 'busy'
          ? '🔥 Estamos ocupados'
          : '✅ Tiempos normales',
    };
  }
}

export const deliveryTimeEstimatorService = new DeliveryTimeEstimatorService();
export default deliveryTimeEstimatorService;

