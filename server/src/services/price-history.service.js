/**
 * Sistema de Historial de Precios
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class PriceHistoryService {
  /**
   * Registrar cambio de precio
   */
  async recordPriceChange(productId, oldPrice, newPrice, changedBy, reason = null) {
    if (oldPrice === newPrice) return null;

    const record = await prisma.priceHistory.create({
      data: {
        productId,
        oldPrice,
        newPrice,
        changePercent: oldPrice > 0 ? Math.round(((newPrice - oldPrice) / oldPrice) * 100 * 100) / 100 : 0,
        changedBy,
        reason,
      },
    });

    logger.info({ productId, oldPrice, newPrice }, 'Price change recorded');
    return record;
  }

  /**
   * Obtener historial de un producto
   */
  async getProductPriceHistory(productId, limit = 50) {
    return prisma.priceHistory.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Obtener precio más bajo histórico
   */
  async getLowestPrice(productId) {
    const result = await prisma.priceHistory.aggregate({
      where: { productId },
      _min: { newPrice: true },
    });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { price: true },
    });

    const lowestHistorical = result._min.newPrice || product?.price || 0;
    const currentPrice = product?.price || 0;

    return {
      lowestPrice: Math.min(lowestHistorical, currentPrice),
      currentPrice,
      isAtLowest: currentPrice <= lowestHistorical,
    };
  }

  /**
   * Análisis de tendencia de precios
   */
  async getPriceTrend(productId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const history = await prisma.priceHistory.findMany({
      where: {
        productId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (history.length < 2) return { trend: 'stable', changes: 0 };

    const firstPrice = history[0].oldPrice;
    const lastPrice = history[history.length - 1].newPrice;
    const changePercent = ((lastPrice - firstPrice) / firstPrice) * 100;

    return {
      trend: changePercent > 5 ? 'up' : changePercent < -5 ? 'down' : 'stable',
      changePercent: Math.round(changePercent * 100) / 100,
      changes: history.length,
      firstPrice,
      lastPrice,
      history: history.map(h => ({
        date: h.createdAt,
        price: h.newPrice,
      })),
    };
  }

  /**
   * Productos con cambios de precio recientes
   */
  async getRecentPriceChanges(storeId, days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const changes = await prisma.priceHistory.findMany({
      where: {
        createdAt: { gte: startDate },
        product: { storeId },
      },
      include: {
        product: { select: { id: true, name: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return changes;
  }

  /**
   * Estadísticas de cambios de precio
   */
  async getPriceChangeStats(storeId, dateRange = {}) {
    const { startDate, endDate } = dateRange;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const changes = await prisma.priceHistory.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        product: { storeId },
      },
    });

    const increases = changes.filter(c => c.newPrice > c.oldPrice);
    const decreases = changes.filter(c => c.newPrice < c.oldPrice);

    return {
      totalChanges: changes.length,
      increases: increases.length,
      decreases: decreases.length,
      avgIncreasePercent: increases.length > 0
        ? Math.round(increases.reduce((sum, c) => sum + c.changePercent, 0) / increases.length * 100) / 100
        : 0,
      avgDecreasePercent: decreases.length > 0
        ? Math.round(decreases.reduce((sum, c) => sum + Math.abs(c.changePercent), 0) / decreases.length * 100) / 100
        : 0,
    };
  }

  /**
   * Alerta de precio bajo (para clientes)
   */
  async checkPriceAlerts(productId) {
    const alerts = await prisma.priceAlert.findMany({
      where: { productId, isActive: true },
      include: { customer: true },
    });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { price: true, name: true },
    });

    const triggered = [];

    for (const alert of alerts) {
      if (product.price <= alert.targetPrice) {
        triggered.push({
          customerId: alert.customerId,
          productName: product.name,
          currentPrice: product.price,
          targetPrice: alert.targetPrice,
        });

        // Desactivar alerta
        await prisma.priceAlert.update({
          where: { id: alert.id },
          data: { isActive: false, triggeredAt: new Date() },
        });
      }
    }

    return triggered;
  }

  /**
   * Crear alerta de precio
   */
  async createPriceAlert(customerId, productId, targetPrice) {
    return prisma.priceAlert.create({
      data: { customerId, productId, targetPrice, isActive: true },
    });
  }
}

export const priceHistoryService = new PriceHistoryService();
export default priceHistoryService;

