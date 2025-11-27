/**
 * Servicio de Sugerencias con IA
 * Recomendaciones personalizadas basadas en historial y patrones
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class AISuggestionsService {
  /**
   * Obtener productos recomendados para un cliente
   */
  async getRecommendationsForCustomer(customerPhone, storeId, limit = 5) {
    // Obtener historial del cliente
    const orders = await prisma.order.findMany({
      where: { customerPhone, storeId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    if (orders.length === 0) {
      // Cliente nuevo: recomendar productos populares
      return this.getPopularProducts(storeId, limit);
    }

    // Analizar preferencias
    const productFrequency = new Map();
    const categoryFrequency = new Map();

    orders.forEach(order => {
      order.items.forEach(item => {
        productFrequency.set(item.productId, (productFrequency.get(item.productId) || 0) + item.quantity);
        if (item.categoryId) {
          categoryFrequency.set(item.categoryId, (categoryFrequency.get(item.categoryId) || 0) + 1);
        }
      });
    });

    // Categorías favoritas
    const topCategories = [...categoryFrequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    // Productos comprados frecuentemente
    const frequentProducts = [...productFrequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    // Buscar productos relacionados que NO ha comprado
    const recommendations = await prisma.product.findMany({
      where: {
        storeId,
        isAvailable: true,
        categoryId: { in: topCategories },
        id: { notIn: frequentProducts },
      },
      take: limit,
      orderBy: { orderCount: 'desc' },
    });

    // Si no hay suficientes, agregar populares
    if (recommendations.length < limit) {
      const popular = await this.getPopularProducts(
        storeId, 
        limit - recommendations.length,
        [...frequentProducts, ...recommendations.map(r => r.id)]
      );
      recommendations.push(...popular);
    }

    return {
      recommendations,
      basedOn: 'purchase_history',
      topCategories,
    };
  }

  /**
   * Productos populares
   */
  async getPopularProducts(storeId, limit = 5, excludeIds = []) {
    return prisma.product.findMany({
      where: {
        storeId,
        isAvailable: true,
        id: { notIn: excludeIds },
      },
      orderBy: { orderCount: 'desc' },
      take: limit,
    });
  }

  /**
   * Sugerir complementos para un producto
   */
  async getSuggestedAddons(productId, storeId) {
    // Buscar qué otros productos se compran junto con este
    const ordersWithProduct = await prisma.orderItem.findMany({
      where: { productId },
      select: { orderId: true },
    });

    const orderIds = ordersWithProduct.map(o => o.orderId);

    // Productos comprados en esos mismos pedidos
    const relatedItems = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        orderId: { in: orderIds },
        productId: { not: productId },
      },
      _count: { _all: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 5,
    });

    const productIds = relatedItems.map(i => i.productId);

    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isAvailable: true,
      },
    });

    return products;
  }

  /**
   * Sugerir hora óptima de pedido
   */
  async getSuggestedOrderTime(storeId) {
    // Analizar tiempos de entrega por hora
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'delivered',
        deliveredAt: { not: null },
      },
      select: {
        createdAt: true,
        deliveredAt: true,
      },
      take: 500,
    });

    const hourlyStats = Array(24).fill(null).map(() => ({ count: 0, totalTime: 0 }));

    orders.forEach(order => {
      const hour = new Date(order.createdAt).getHours();
      const deliveryTime = (new Date(order.deliveredAt) - new Date(order.createdAt)) / 60000;
      hourlyStats[hour].count++;
      hourlyStats[hour].totalTime += deliveryTime;
    });

    // Encontrar horas con menor tiempo de entrega
    const hoursWithData = hourlyStats
      .map((stat, hour) => ({
        hour,
        avgTime: stat.count > 0 ? Math.round(stat.totalTime / stat.count) : null,
        orderCount: stat.count,
      }))
      .filter(h => h.avgTime !== null && h.orderCount >= 5);

    hoursWithData.sort((a, b) => a.avgTime - b.avgTime);

    return {
      bestHours: hoursWithData.slice(0, 3),
      worstHours: hoursWithData.slice(-3).reverse(),
      recommendation: hoursWithData[0] 
        ? `Mejor hora para pedir: ${hoursWithData[0].hour}:00 (${hoursWithData[0].avgTime} min promedio)`
        : null,
    };
  }

  /**
   * Predecir próximo pedido del cliente
   */
  async predictNextOrder(customerPhone, storeId) {
    const orders = await prisma.order.findMany({
      where: { customerPhone, storeId, status: 'delivered' },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (orders.length < 2) {
      return null;
    }

    // Calcular frecuencia de pedidos
    const intervals = [];
    for (let i = 0; i < orders.length - 1; i++) {
      const diff = new Date(orders[i].createdAt) - new Date(orders[i + 1].createdAt);
      intervals.push(diff / (1000 * 60 * 60 * 24)); // días
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const lastOrderDate = new Date(orders[0].createdAt);
    const predictedDate = new Date(lastOrderDate.getTime() + avgInterval * 24 * 60 * 60 * 1000);

    // Productos más probables
    const productCounts = new Map();
    orders.forEach(order => {
      order.items.forEach(item => {
        productCounts.set(item.productId, (productCounts.get(item.productId) || 0) + 1);
      });
    });

    const likelyProducts = [...productCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => ({ productId: id, probability: Math.round((count / orders.length) * 100) }));

    // Día de la semana más común
    const dayCounts = Array(7).fill(0);
    orders.forEach(order => {
      dayCounts[new Date(order.createdAt).getDay()]++;
    });
    const preferredDay = dayCounts.indexOf(Math.max(...dayCounts));
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    return {
      predictedDate,
      daysUntilOrder: Math.max(0, Math.round((predictedDate - new Date()) / (1000 * 60 * 60 * 24))),
      avgOrderInterval: Math.round(avgInterval),
      likelyProducts,
      preferredDay: days[preferredDay],
      avgOrderValue: Math.round(orders.reduce((sum, o) => sum + o.total, 0) / orders.length),
    };
  }

  /**
   * Detectar patrones de abandono
   */
  async detectChurnRisk(storeId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Clientes que compraban regularmente pero dejaron de hacerlo
    const previouslyActive = await prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
      select: { customerPhone: true },
      distinct: ['customerPhone'],
    });

    const recentlyActive = await prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { customerPhone: true },
      distinct: ['customerPhone'],
    });

    const recentSet = new Set(recentlyActive.map(o => o.customerPhone));
    const atRiskCustomers = previouslyActive
      .filter(o => !recentSet.has(o.customerPhone))
      .map(o => o.customerPhone);

    // Obtener detalles de clientes en riesgo
    const customerDetails = await Promise.all(
      atRiskCustomers.slice(0, 20).map(async phone => {
        const lastOrder = await prisma.order.findFirst({
          where: { customerPhone: phone, storeId },
          orderBy: { createdAt: 'desc' },
        });

        const orderCount = await prisma.order.count({
          where: { customerPhone: phone, storeId },
        });

        return {
          phone,
          lastOrderDate: lastOrder?.createdAt,
          daysSinceLastOrder: Math.round((Date.now() - new Date(lastOrder?.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
          totalOrders: orderCount,
        };
      })
    );

    return {
      totalAtRisk: atRiskCustomers.length,
      customers: customerDetails,
      recommendation: `${atRiskCustomers.length} clientes no han pedido en 30+ días. Considera enviar una promoción.`,
    };
  }

  /**
   * Sugerir precio óptimo
   */
  async suggestOptimalPrice(productId, storeId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) return null;

    // Analizar ventas históricas
    const salesData = await prisma.orderItem.findMany({
      where: { productId },
      include: {
        order: { select: { createdAt: true } },
      },
    });

    if (salesData.length < 10) {
      return {
        currentPrice: product.price,
        suggestion: 'Datos insuficientes para análisis',
        confidence: 'low',
      };
    }

    // Calcular elasticidad básica
    const avgQuantity = salesData.reduce((sum, s) => sum + s.quantity, 0) / salesData.length;
    
    // Buscar productos similares en la categoría
    const categoryProducts = await prisma.product.findMany({
      where: {
        storeId,
        categoryId: product.categoryId,
        id: { not: productId },
      },
      select: { price: true, orderCount: true },
    });

    const avgCategoryPrice = categoryProducts.length > 0
      ? categoryProducts.reduce((sum, p) => sum + p.price, 0) / categoryProducts.length
      : product.price;

    const priceDiff = ((product.price - avgCategoryPrice) / avgCategoryPrice) * 100;

    return {
      currentPrice: product.price,
      categoryAvgPrice: Math.round(avgCategoryPrice),
      priceDifferencePercent: Math.round(priceDiff),
      avgQuantityPerOrder: Math.round(avgQuantity * 10) / 10,
      totalSales: salesData.length,
      suggestion: priceDiff > 20 
        ? 'Precio por encima del promedio de categoría. Considera ajustar.'
        : priceDiff < -20
        ? 'Precio por debajo del promedio. Podrías aumentar margen.'
        : 'Precio alineado con la categoría.',
      confidence: salesData.length > 50 ? 'high' : 'medium',
    };
  }
}

export const aiSuggestionsService = new AISuggestionsService();
export default aiSuggestionsService;

