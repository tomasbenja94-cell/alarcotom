/**
 * Sistema de Favoritos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class FavoritesService {
  /**
   * Agregar producto a favoritos
   */
  async addFavorite(customerId, productId) {
    const existing = await prisma.favorite.findFirst({
      where: { customerId, productId },
    });

    if (existing) return existing;

    const favorite = await prisma.favorite.create({
      data: { customerId, productId },
    });

    logger.info({ customerId, productId }, 'Product added to favorites');
    return favorite;
  }

  /**
   * Remover de favoritos
   */
  async removeFavorite(customerId, productId) {
    await prisma.favorite.deleteMany({
      where: { customerId, productId },
    });

    return { success: true };
  }

  /**
   * Toggle favorito
   */
  async toggleFavorite(customerId, productId) {
    const existing = await prisma.favorite.findFirst({
      where: { customerId, productId },
    });

    if (existing) {
      await this.removeFavorite(customerId, productId);
      return { isFavorite: false };
    } else {
      await this.addFavorite(customerId, productId);
      return { isFavorite: true };
    }
  }

  /**
   * Obtener favoritos del cliente
   */
  async getFavorites(customerId, storeId = null) {
    const favorites = await prisma.favorite.findMany({
      where: {
        customerId,
        product: storeId ? { storeId } : undefined,
      },
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return favorites.map(f => ({
      id: f.id,
      addedAt: f.createdAt,
      product: {
        id: f.product.id,
        name: f.product.name,
        description: f.product.description,
        price: f.product.price,
        image: f.product.image,
        category: f.product.category?.name,
        isAvailable: f.product.isAvailable,
      },
    }));
  }

  /**
   * Verificar si producto es favorito
   */
  async isFavorite(customerId, productId) {
    const favorite = await prisma.favorite.findFirst({
      where: { customerId, productId },
    });

    return !!favorite;
  }

  /**
   * Verificar múltiples productos
   */
  async checkFavorites(customerId, productIds) {
    const favorites = await prisma.favorite.findMany({
      where: { customerId, productId: { in: productIds } },
      select: { productId: true },
    });

    const favoriteSet = new Set(favorites.map(f => f.productId));

    return productIds.reduce((acc, id) => {
      acc[id] = favoriteSet.has(id);
      return acc;
    }, {});
  }

  /**
   * Obtener productos frecuentes (basado en pedidos)
   */
  async getFrequentProducts(customerId, limit = 10) {
    const orderItems = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          customerId,
          status: 'delivered',
        },
      },
      _count: { productId: true },
      _sum: { quantity: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });

    const productIds = orderItems.map(i => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isAvailable: true },
      include: { category: true },
    });

    return orderItems.map(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return null;

      return {
        product: {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          category: product.category?.name,
        },
        orderCount: item._count.productId,
        totalQuantity: item._sum.quantity,
      };
    }).filter(Boolean);
  }

  /**
   * Sugerir favoritos basado en historial
   */
  async suggestFavorites(customerId, limit = 5) {
    // Obtener productos frecuentes que no son favoritos
    const frequentProducts = await this.getFrequentProducts(customerId, 20);
    const currentFavorites = await prisma.favorite.findMany({
      where: { customerId },
      select: { productId: true },
    });

    const favoriteIds = new Set(currentFavorites.map(f => f.productId));

    return frequentProducts
      .filter(fp => !favoriteIds.has(fp.product.id))
      .slice(0, limit)
      .map(fp => ({
        ...fp.product,
        reason: `Pediste ${fp.totalQuantity} veces`,
      }));
  }

  /**
   * Notificar sobre favoritos con descuento
   */
  async getFavoritesOnSale(customerId) {
    const favorites = await prisma.favorite.findMany({
      where: { customerId },
      include: {
        product: {
          include: {
            promotions: {
              where: {
                isActive: true,
                startDate: { lte: new Date() },
                endDate: { gte: new Date() },
              },
            },
          },
        },
      },
    });

    return favorites
      .filter(f => f.product.promotions.length > 0)
      .map(f => ({
        product: {
          id: f.product.id,
          name: f.product.name,
          price: f.product.price,
          image: f.product.image,
        },
        promotion: f.product.promotions[0],
      }));
  }

  /**
   * Estadísticas de favoritos (para admin)
   */
  async getFavoriteStats(storeId) {
    const stats = await prisma.favorite.groupBy({
      by: ['productId'],
      where: { product: { storeId } },
      _count: true,
      orderBy: { _count: { productId: 'desc' } },
      take: 20,
    });

    const productIds = stats.map(s => s.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    return stats.map(s => {
      const product = products.find(p => p.id === s.productId);
      return {
        productId: s.productId,
        productName: product?.name,
        favoriteCount: s._count,
      };
    });
  }

  /**
   * Limpiar favoritos no disponibles
   */
  async cleanUnavailableFavorites(customerId) {
    const favorites = await prisma.favorite.findMany({
      where: { customerId },
      include: { product: { select: { isAvailable: true } } },
    });

    const unavailableIds = favorites
      .filter(f => !f.product.isAvailable)
      .map(f => f.id);

    if (unavailableIds.length > 0) {
      await prisma.favorite.deleteMany({
        where: { id: { in: unavailableIds } },
      });
    }

    return { removed: unavailableIds.length };
  }
}

export const favoritesService = new FavoritesService();
export default favoritesService;

