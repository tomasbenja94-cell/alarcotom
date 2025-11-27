/**
 * Sistema de Productos Destacados y Populares
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class FeaturedProductsService {
  /**
   * Obtener productos destacados
   */
  async getFeatured(storeId, limit = 6) {
    return prisma.product.findMany({
      where: {
        storeId,
        isAvailable: true,
        isFeatured: true,
      },
      include: { category: true },
      orderBy: { featuredOrder: 'asc' },
      take: limit,
    });
  }

  /**
   * Establecer producto como destacado
   */
  async setFeatured(productId, isFeatured, order = 0) {
    await prisma.product.update({
      where: { id: productId },
      data: { isFeatured, featuredOrder: order },
    });

    return { success: true };
  }

  /**
   * Reordenar productos destacados
   */
  async reorderFeatured(storeId, productIds) {
    const updates = productIds.map((id, index) =>
      prisma.product.update({
        where: { id },
        data: { featuredOrder: index },
      })
    );

    await prisma.$transaction(updates);
    return { success: true };
  }

  /**
   * Obtener productos más vendidos
   */
  async getBestSellers(storeId, days = 30, limit = 10) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const sales = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          storeId,
          status: 'delivered',
          createdAt: { gte: startDate },
        },
      },
      _sum: { quantity: true },
      _count: true,
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    const productIds = sales.map(s => s.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isAvailable: true },
      include: { category: true },
    });

    return sales.map(s => {
      const product = products.find(p => p.id === s.productId);
      if (!product) return null;
      return {
        ...product,
        totalSold: s._sum.quantity,
        orderCount: s._count,
      };
    }).filter(Boolean);
  }

  /**
   * Obtener productos nuevos
   */
  async getNewProducts(storeId, days = 14, limit = 8) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return prisma.product.findMany({
      where: {
        storeId,
        isAvailable: true,
        createdAt: { gte: startDate },
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Obtener productos con descuento
   */
  async getOnSale(storeId, limit = 10) {
    return prisma.product.findMany({
      where: {
        storeId,
        isAvailable: true,
        discountPrice: { not: null },
        discountPrice: { gt: 0 },
      },
      include: { category: true },
      orderBy: { discountPercent: 'desc' },
      take: limit,
    });
  }

  /**
   * Obtener productos recomendados para cliente
   */
  async getRecommended(storeId, customerId, limit = 6) {
    // Basado en historial de compras
    const recentOrders = await prisma.orderItem.findMany({
      where: {
        order: { customerId, status: 'delivered' },
      },
      select: { productId: true, product: { select: { categoryId: true } } },
      orderBy: { order: { createdAt: 'desc' } },
      take: 20,
    });

    if (recentOrders.length === 0) {
      // Sin historial, retornar best sellers
      return this.getBestSellers(storeId, 30, limit);
    }

    // Categorías favoritas
    const categoryCounts = {};
    recentOrders.forEach(item => {
      if (item.product?.categoryId) {
        categoryCounts[item.product.categoryId] = (categoryCounts[item.product.categoryId] || 0) + 1;
      }
    });

    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    // Productos comprados recientemente
    const purchasedIds = recentOrders.map(o => o.productId);

    // Buscar productos similares no comprados
    const recommended = await prisma.product.findMany({
      where: {
        storeId,
        isAvailable: true,
        categoryId: { in: topCategories },
        id: { notIn: purchasedIds },
      },
      include: { category: true },
      orderBy: { orderCount: 'desc' },
      take: limit,
    });

    return recommended;
  }

  /**
   * Productos populares esta semana
   */
  async getTrendingThisWeek(storeId, limit = 8) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Ventas esta semana
    const thisWeek = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: { storeId, status: 'delivered', createdAt: { gte: weekAgo } },
      },
      _sum: { quantity: true },
    });

    // Ventas semana pasada
    const lastWeek = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          storeId,
          status: 'delivered',
          createdAt: { gte: twoWeeksAgo, lt: weekAgo },
        },
      },
      _sum: { quantity: true },
    });

    // Calcular tendencia
    const trends = thisWeek.map(tw => {
      const lw = lastWeek.find(l => l.productId === tw.productId);
      const lastWeekSales = lw?._sum.quantity || 0;
      const thisWeekSales = tw._sum.quantity || 0;
      const growth = lastWeekSales > 0
        ? ((thisWeekSales - lastWeekSales) / lastWeekSales) * 100
        : thisWeekSales > 0 ? 100 : 0;

      return {
        productId: tw.productId,
        thisWeekSales,
        lastWeekSales,
        growth,
      };
    }).sort((a, b) => b.growth - a.growth);

    const topTrending = trends.slice(0, limit);
    const products = await prisma.product.findMany({
      where: { id: { in: topTrending.map(t => t.productId) }, isAvailable: true },
      include: { category: true },
    });

    return topTrending.map(t => {
      const product = products.find(p => p.id === t.productId);
      if (!product) return null;
      return {
        ...product,
        trend: {
          thisWeek: t.thisWeekSales,
          lastWeek: t.lastWeekSales,
          growth: Math.round(t.growth),
        },
      };
    }).filter(Boolean);
  }

  /**
   * Secciones del home
   */
  async getHomeSections(storeId, customerId = null) {
    const [featured, bestSellers, newProducts, onSale, recommended] = await Promise.all([
      this.getFeatured(storeId, 6),
      this.getBestSellers(storeId, 30, 6),
      this.getNewProducts(storeId, 14, 6),
      this.getOnSale(storeId, 6),
      customerId ? this.getRecommended(storeId, customerId, 6) : Promise.resolve([]),
    ]);

    const sections = [];

    if (featured.length > 0) {
      sections.push({ id: 'featured', title: '⭐ Destacados', products: featured });
    }

    if (recommended.length > 0) {
      sections.push({ id: 'recommended', title: '💡 Para vos', products: recommended });
    }

    if (bestSellers.length > 0) {
      sections.push({ id: 'best_sellers', title: '🔥 Los más pedidos', products: bestSellers });
    }

    if (newProducts.length > 0) {
      sections.push({ id: 'new', title: '✨ Nuevos', products: newProducts });
    }

    if (onSale.length > 0) {
      sections.push({ id: 'on_sale', title: '🏷️ Ofertas', products: onSale });
    }

    return sections;
  }

  /**
   * Actualizar contador de pedidos
   */
  async incrementOrderCount(productId) {
    await prisma.product.update({
      where: { id: productId },
      data: { orderCount: { increment: 1 } },
    });
  }
}

export const featuredProductsService = new FeaturedProductsService();
export default featuredProductsService;

