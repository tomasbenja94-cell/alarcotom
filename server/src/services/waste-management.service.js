/**
 * Sistema de Gestión de Desperdicios
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class WasteManagementService {
  WASTE_REASONS = {
    EXPIRED: 'expired',
    DAMAGED: 'damaged',
    OVERPRODUCTION: 'overproduction',
    CUSTOMER_RETURN: 'customer_return',
    QUALITY_ISSUE: 'quality_issue',
    SPILLAGE: 'spillage',
    OTHER: 'other',
  };

  /**
   * Registrar desperdicio
   */
  async recordWaste(storeId, wasteData) {
    const { productId, ingredientId, quantity, unit, reason, cost, notes, recordedBy } = wasteData;

    const waste = await prisma.wasteRecord.create({
      data: {
        storeId,
        productId,
        ingredientId,
        quantity,
        unit,
        reason,
        cost: cost || await this.calculateCost(productId, ingredientId, quantity),
        notes,
        recordedBy,
      },
    });

    // Actualizar inventario si es ingrediente
    if (ingredientId) {
      await prisma.ingredient.update({
        where: { id: ingredientId },
        data: { currentStock: { decrement: quantity } },
      });
    }

    logger.info({ wasteId: waste.id, reason, cost: waste.cost }, 'Waste recorded');
    return waste;
  }

  async calculateCost(productId, ingredientId, quantity) {
    if (ingredientId) {
      const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
      return ingredient ? ingredient.costPerUnit * quantity : 0;
    }
    if (productId) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      return product?.recipeCost ? product.recipeCost * quantity : 0;
    }
    return 0;
  }

  /**
   * Obtener resumen de desperdicios
   */
  async getWasteSummary(storeId, startDate, endDate) {
    const wastes = await prisma.wasteRecord.findMany({
      where: {
        storeId,
        createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      include: {
        product: { select: { name: true } },
        ingredient: { select: { name: true } },
      },
    });

    const totalCost = wastes.reduce((sum, w) => sum + w.cost, 0);

    // Por razón
    const byReason = {};
    wastes.forEach(w => {
      if (!byReason[w.reason]) byReason[w.reason] = { count: 0, cost: 0 };
      byReason[w.reason].count++;
      byReason[w.reason].cost += w.cost;
    });

    // Por producto/ingrediente
    const byItem = {};
    wastes.forEach(w => {
      const name = w.product?.name || w.ingredient?.name || 'Desconocido';
      if (!byItem[name]) byItem[name] = { count: 0, cost: 0, quantity: 0 };
      byItem[name].count++;
      byItem[name].cost += w.cost;
      byItem[name].quantity += w.quantity;
    });

    // Por día
    const byDay = {};
    wastes.forEach(w => {
      const day = w.createdAt.toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { count: 0, cost: 0 };
      byDay[day].count++;
      byDay[day].cost += w.cost;
    });

    return {
      period: { startDate, endDate },
      totalRecords: wastes.length,
      totalCost,
      avgDailyCost: Object.keys(byDay).length > 0 ? Math.round(totalCost / Object.keys(byDay).length) : 0,
      byReason: Object.entries(byReason).map(([reason, data]) => ({
        reason,
        ...data,
        percentage: Math.round((data.cost / totalCost) * 100) || 0,
      })).sort((a, b) => b.cost - a.cost),
      byItem: Object.entries(byItem).map(([name, data]) => ({
        name,
        ...data,
      })).sort((a, b) => b.cost - a.cost).slice(0, 10),
      dailyTrend: Object.entries(byDay).map(([date, data]) => ({
        date,
        ...data,
      })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Calcular % de desperdicio vs ventas
   */
  async getWasteRatio(storeId, startDate, endDate) {
    const [wastes, sales] = await Promise.all([
      prisma.wasteRecord.aggregate({
        where: {
          storeId,
          createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
        },
        _sum: { cost: true },
      }),
      prisma.order.aggregate({
        where: {
          storeId,
          status: 'delivered',
          createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
        },
        _sum: { total: true },
      }),
    ]);

    const wasteCost = wastes._sum.cost || 0;
    const salesTotal = sales._sum.total || 0;
    const ratio = salesTotal > 0 ? (wasteCost / salesTotal) * 100 : 0;

    return {
      wasteCost,
      salesTotal,
      wasteRatio: Math.round(ratio * 100) / 100,
      benchmark: ratio <= 2 ? 'excellent' : ratio <= 5 ? 'good' : ratio <= 10 ? 'needs_improvement' : 'critical',
      industryAvg: 4, // Promedio de industria ~4%
    };
  }

  /**
   * Alertas de productos próximos a vencer
   */
  async getExpiringItems(storeId, daysAhead = 3) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysAhead);

    return prisma.inventoryBatch.findMany({
      where: {
        storeId,
        expirationDate: { lte: threshold, gte: new Date() },
        remainingQuantity: { gt: 0 },
      },
      include: { ingredient: true },
      orderBy: { expirationDate: 'asc' },
    });
  }

  /**
   * Sugerencias para reducir desperdicio
   */
  async getReductionSuggestions(storeId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const wastes = await prisma.wasteRecord.findMany({
      where: { storeId, createdAt: { gte: thirtyDaysAgo } },
      include: { product: true, ingredient: true },
    });

    const suggestions = [];

    // Analizar por razón
    const byReason = {};
    wastes.forEach(w => {
      byReason[w.reason] = (byReason[w.reason] || 0) + w.cost;
    });

    if (byReason[this.WASTE_REASONS.OVERPRODUCTION] > byReason[this.WASTE_REASONS.EXPIRED]) {
      suggestions.push({
        priority: 'high',
        type: 'production',
        message: 'Reducir producción anticipada. Considerar sistema de producción bajo demanda.',
      });
    }

    if (byReason[this.WASTE_REASONS.EXPIRED]) {
      suggestions.push({
        priority: 'high',
        type: 'inventory',
        message: 'Implementar sistema FIFO estricto y revisar cantidades de pedido a proveedores.',
      });
    }

    // Productos más desperdiciados
    const topWasted = {};
    wastes.forEach(w => {
      const name = w.product?.name || w.ingredient?.name;
      if (name) topWasted[name] = (topWasted[name] || 0) + w.cost;
    });

    const sorted = Object.entries(topWasted).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      suggestions.push({
        priority: 'medium',
        type: 'menu',
        message: `"${sorted[0][0]}" es el item más desperdiciado. Considerar ajustar porción o promocionar más.`,
      });
    }

    return suggestions;
  }

  /**
   * Registrar donación (alternativa a desperdicio)
   */
  async recordDonation(storeId, donationData) {
    const { items, recipientOrg, notes, recordedBy } = donationData;

    let totalValue = 0;
    for (const item of items) {
      totalValue += await this.calculateCost(item.productId, item.ingredientId, item.quantity);
    }

    const donation = await prisma.foodDonation.create({
      data: {
        storeId,
        items: JSON.stringify(items),
        totalValue,
        recipientOrg,
        notes,
        recordedBy,
      },
    });

    logger.info({ donationId: donation.id, totalValue, recipientOrg }, 'Donation recorded');
    return donation;
  }

  /**
   * Reporte de sostenibilidad
   */
  async getSustainabilityReport(storeId, year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const [wastes, donations] = await Promise.all([
      prisma.wasteRecord.aggregate({
        where: { storeId, createdAt: { gte: startDate, lte: endDate } },
        _sum: { cost: true, quantity: true },
        _count: true,
      }),
      prisma.foodDonation.aggregate({
        where: { storeId, createdAt: { gte: startDate, lte: endDate } },
        _sum: { totalValue: true },
        _count: true,
      }),
    ]);

    return {
      year,
      waste: {
        totalCost: wastes._sum.cost || 0,
        totalKg: wastes._sum.quantity || 0,
        records: wastes._count,
      },
      donations: {
        totalValue: donations._sum.totalValue || 0,
        count: donations._count,
      },
      diversionRate: wastes._sum.cost && donations._sum.totalValue
        ? Math.round((donations._sum.totalValue / (wastes._sum.cost + donations._sum.totalValue)) * 100)
        : 0,
    };
  }
}

export const wasteManagementService = new WasteManagementService();
export default wasteManagementService;
