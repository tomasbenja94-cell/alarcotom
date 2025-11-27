/**
 * Sistema de Costos por Producto
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class ProductCostsService {
  /**
   * Configurar costo de un producto
   */
  async setProductCost(productId, costData) {
    const { 
      ingredientsCost = 0,
      packagingCost = 0,
      laborCost = 0,
      overheadCost = 0,
      otherCosts = 0,
      notes = null,
    } = costData;

    const totalCost = ingredientsCost + packagingCost + laborCost + overheadCost + otherCosts;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error('Producto no encontrado');

    const margin = product.price > 0 
      ? Math.round(((product.price - totalCost) / product.price) * 100 * 100) / 100
      : 0;

    await prisma.productCost.upsert({
      where: { productId },
      update: {
        ingredientsCost,
        packagingCost,
        laborCost,
        overheadCost,
        otherCosts,
        totalCost,
        margin,
        notes,
        updatedAt: new Date(),
      },
      create: {
        productId,
        ingredientsCost,
        packagingCost,
        laborCost,
        overheadCost,
        otherCosts,
        totalCost,
        margin,
        notes,
      },
    });

    logger.info({ productId, totalCost, margin }, 'Product cost updated');
    return { totalCost, margin };
  }

  /**
   * Obtener costo de un producto
   */
  async getProductCost(productId) {
    const cost = await prisma.productCost.findUnique({
      where: { productId },
      include: {
        product: { select: { name: true, price: true } },
      },
    });

    if (!cost) {
      return null;
    }

    return {
      ...cost,
      profit: cost.product.price - cost.totalCost,
      marginPercent: cost.margin,
    };
  }

  /**
   * Calcular rentabilidad de todos los productos
   */
  async getProductsProfitability(storeId) {
    const products = await prisma.product.findMany({
      where: { storeId },
      include: {
        cost: true,
        _count: {
          select: { orderItems: true },
        },
      },
    });

    return products.map(product => {
      const cost = product.cost?.totalCost || 0;
      const profit = product.price - cost;
      const margin = product.price > 0 ? (profit / product.price) * 100 : 0;

      return {
        id: product.id,
        name: product.name,
        price: product.price,
        cost,
        profit,
        margin: Math.round(margin * 100) / 100,
        salesCount: product._count.orderItems,
        totalProfit: profit * product._count.orderItems,
        hasCostData: !!product.cost,
      };
    }).sort((a, b) => b.totalProfit - a.totalProfit);
  }

  /**
   * Análisis de rentabilidad por categoría
   */
  async getCategoryProfitability(storeId) {
    const categories = await prisma.category.findMany({
      where: { storeId },
      include: {
        products: {
          include: { cost: true },
        },
      },
    });

    return categories.map(category => {
      let totalRevenue = 0;
      let totalCost = 0;
      let productsWithCost = 0;

      category.products.forEach(product => {
        if (product.cost) {
          totalRevenue += product.price;
          totalCost += product.cost.totalCost;
          productsWithCost++;
        }
      });

      const avgMargin = totalRevenue > 0 
        ? ((totalRevenue - totalCost) / totalRevenue) * 100 
        : 0;

      return {
        id: category.id,
        name: category.name,
        productCount: category.products.length,
        productsWithCost,
        avgMargin: Math.round(avgMargin * 100) / 100,
        totalRevenue,
        totalCost,
      };
    });
  }

  /**
   * Sugerir precio basado en margen objetivo
   */
  suggestPrice(cost, targetMargin) {
    if (targetMargin >= 100) throw new Error('El margen no puede ser 100% o más');
    return Math.ceil(cost / (1 - targetMargin / 100));
  }

  /**
   * Calcular punto de equilibrio
   */
  async calculateBreakeven(storeId, fixedCosts) {
    const products = await this.getProductsProfitability(storeId);
    
    // Calcular margen promedio ponderado
    let totalSales = 0;
    let weightedMargin = 0;

    products.forEach(p => {
      if (p.salesCount > 0 && p.hasCostData) {
        totalSales += p.salesCount;
        weightedMargin += p.margin * p.salesCount;
      }
    });

    const avgMargin = totalSales > 0 ? weightedMargin / totalSales : 0;
    const avgTicket = products.reduce((sum, p) => sum + p.price * p.salesCount, 0) / totalSales || 0;

    // Punto de equilibrio en ventas
    const breakevenSales = avgMargin > 0 ? fixedCosts / (avgMargin / 100) : 0;
    const breakevenOrders = avgTicket > 0 ? Math.ceil(breakevenSales / avgTicket) : 0;

    return {
      fixedCosts,
      avgMargin: Math.round(avgMargin * 100) / 100,
      avgTicket: Math.round(avgTicket),
      breakevenSales: Math.round(breakevenSales),
      breakevenOrders,
    };
  }

  /**
   * Reporte de márgenes
   */
  async getMarginReport(storeId, dateRange = {}) {
    const { startDate, endDate } = dateRange;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'delivered',
        createdAt: { gte: start, lte: end },
      },
      include: {
        items: {
          include: {
            product: { include: { cost: true } },
          },
        },
      },
    });

    let totalRevenue = 0;
    let totalCost = 0;
    let itemsWithCost = 0;
    let itemsWithoutCost = 0;

    orders.forEach(order => {
      order.items.forEach(item => {
        totalRevenue += item.subtotal;
        if (item.product?.cost) {
          totalCost += item.product.cost.totalCost * item.quantity;
          itemsWithCost++;
        } else {
          itemsWithoutCost++;
        }
      });
    });

    const grossProfit = totalRevenue - totalCost;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      period: { start, end },
      totalRevenue,
      totalCost,
      grossProfit,
      grossMargin: Math.round(grossMargin * 100) / 100,
      ordersCount: orders.length,
      dataCompleteness: {
        itemsWithCost,
        itemsWithoutCost,
        percentage: Math.round((itemsWithCost / (itemsWithCost + itemsWithoutCost)) * 100),
      },
    };
  }

  /**
   * Productos con bajo margen
   */
  async getLowMarginProducts(storeId, threshold = 20) {
    const products = await this.getProductsProfitability(storeId);
    return products
      .filter(p => p.hasCostData && p.margin < threshold)
      .sort((a, b) => a.margin - b.margin);
  }

  /**
   * Productos más rentables
   */
  async getMostProfitableProducts(storeId, limit = 10) {
    const products = await this.getProductsProfitability(storeId);
    return products
      .filter(p => p.hasCostData && p.salesCount > 0)
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, limit);
  }

  /**
   * Actualización masiva de costos
   */
  async bulkUpdateCosts(storeId, updates) {
    const results = { success: 0, failed: 0, errors: [] };

    for (const update of updates) {
      try {
        await this.setProductCost(update.productId, update);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({ productId: update.productId, error: error.message });
      }
    }

    return results;
  }
}

export const productCostsService = new ProductCostsService();
export default productCostsService;

