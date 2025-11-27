/**
 * Sistema de Calificaciones y Reviews
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class ReviewsService {
  /**
   * Crear review de pedido
   */
  async createReview(orderId, customerId, reviewData) {
    const { rating, comment, deliveryRating, foodRating, tags } = reviewData;

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Pedido no encontrado');
    if (order.customerId !== customerId) throw new Error('No autorizado');
    if (order.status !== 'delivered') throw new Error('Solo puedes calificar pedidos entregados');

    // Verificar si ya existe review
    const existing = await prisma.orderReview.findFirst({ where: { orderId } });
    if (existing) throw new Error('Ya calificaste este pedido');

    const review = await prisma.orderReview.create({
      data: {
        orderId,
        customerId,
        storeId: order.storeId,
        rating,
        comment,
        deliveryRating,
        foodRating,
        tags: tags || [],
      },
    });

    // Actualizar promedio de la tienda
    await this.updateStoreRating(order.storeId);

    // Actualizar rating del repartidor si aplica
    if (order.deliveryPersonId && deliveryRating) {
      await this.updateDriverRating(order.deliveryPersonId);
    }

    logger.info({ reviewId: review.id, orderId, rating }, 'Review created');
    return review;
  }

  /**
   * Actualizar promedio de tienda
   */
  async updateStoreRating(storeId) {
    const stats = await prisma.orderReview.aggregate({
      where: { storeId },
      _avg: { rating: true, foodRating: true, deliveryRating: true },
      _count: true,
    });

    await prisma.store.update({
      where: { id: storeId },
      data: {
        avgRating: Math.round((stats._avg.rating || 0) * 10) / 10,
        reviewCount: stats._count,
      },
    });
  }

  /**
   * Actualizar rating del repartidor
   */
  async updateDriverRating(driverId) {
    const stats = await prisma.orderReview.aggregate({
      where: { order: { deliveryPersonId: driverId } },
      _avg: { deliveryRating: true },
      _count: true,
    });

    await prisma.deliveryDriver.update({
      where: { id: driverId },
      data: {
        avgRating: Math.round((stats._avg.deliveryRating || 0) * 10) / 10,
        reviewCount: stats._count,
      },
    });
  }

  /**
   * Obtener reviews de tienda
   */
  async getStoreReviews(storeId, options = {}) {
    const { limit = 20, offset = 0, minRating, sortBy = 'recent' } = options;

    const where = { storeId };
    if (minRating) where.rating = { gte: minRating };

    const orderBy = sortBy === 'recent' 
      ? { createdAt: 'desc' }
      : sortBy === 'highest' 
        ? { rating: 'desc' }
        : { rating: 'asc' };

    const [reviews, total] = await Promise.all([
      prisma.orderReview.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          order: { select: { orderNumber: true, createdAt: true } },
        },
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.orderReview.count({ where }),
    ]);

    return {
      reviews: reviews.map(r => ({
        id: r.id,
        rating: r.rating,
        foodRating: r.foodRating,
        deliveryRating: r.deliveryRating,
        comment: r.comment,
        tags: r.tags,
        customerName: r.customer?.name?.split(' ')[0] || 'Cliente',
        orderNumber: r.order?.orderNumber,
        createdAt: r.createdAt,
        response: r.storeResponse,
        responseAt: r.responseAt,
      })),
      total,
      hasMore: offset + reviews.length < total,
    };
  }

  /**
   * Responder a review (tienda)
   */
  async respondToReview(reviewId, storeId, response) {
    const review = await prisma.orderReview.findUnique({ where: { id: reviewId } });
    if (!review || review.storeId !== storeId) throw new Error('Review no encontrada');

    await prisma.orderReview.update({
      where: { id: reviewId },
      data: {
        storeResponse: response,
        responseAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Obtener estadísticas de reviews
   */
  async getReviewStats(storeId) {
    const [stats, distribution, recentTrend] = await Promise.all([
      prisma.orderReview.aggregate({
        where: { storeId },
        _avg: { rating: true, foodRating: true, deliveryRating: true },
        _count: true,
      }),
      prisma.orderReview.groupBy({
        by: ['rating'],
        where: { storeId },
        _count: true,
      }),
      prisma.orderReview.findMany({
        where: {
          storeId,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { rating: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Distribución por estrellas
    const ratingDistribution = [5, 4, 3, 2, 1].map(star => {
      const count = distribution.find(d => d.rating === star)?._count || 0;
      return {
        stars: star,
        count,
        percent: stats._count > 0 ? Math.round((count / stats._count) * 100) : 0,
      };
    });

    // Tags más comunes
    const allReviews = await prisma.orderReview.findMany({
      where: { storeId },
      select: { tags: true },
    });

    const tagCounts = {};
    allReviews.forEach(r => {
      r.tags?.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      avgRating: Math.round((stats._avg.rating || 0) * 10) / 10,
      avgFoodRating: Math.round((stats._avg.foodRating || 0) * 10) / 10,
      avgDeliveryRating: Math.round((stats._avg.deliveryRating || 0) * 10) / 10,
      totalReviews: stats._count,
      distribution: ratingDistribution,
      topTags,
      trend: recentTrend.map(r => ({
        date: r.createdAt.toISOString().split('T')[0],
        rating: r.rating,
      })),
    };
  }

  /**
   * Verificar si puede calificar
   */
  async canReview(orderId, customerId) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return { canReview: false, reason: 'Pedido no encontrado' };
    if (order.customerId !== customerId) return { canReview: false, reason: 'No autorizado' };
    if (order.status !== 'delivered') return { canReview: false, reason: 'Pedido no entregado' };

    const existing = await prisma.orderReview.findFirst({ where: { orderId } });
    if (existing) return { canReview: false, reason: 'Ya calificaste', existingReview: existing };

    return { canReview: true };
  }

  /**
   * Tags sugeridos
   */
  getSuggestedTags() {
    return {
      positive: ['Rápido', 'Delicioso', 'Buena porción', 'Buen precio', 'Amable', 'Caliente', 'Fresco'],
      negative: ['Lento', 'Frío', 'Poca cantidad', 'Caro', 'Incompleto', 'Mal empacado'],
    };
  }

  /**
   * Reviews pendientes de respuesta
   */
  async getPendingResponses(storeId) {
    return prisma.orderReview.findMany({
      where: {
        storeId,
        storeResponse: null,
        rating: { lte: 3 }, // Priorizar reviews negativas
      },
      include: {
        customer: { select: { name: true } },
        order: { select: { orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}

export const reviewsService = new ReviewsService();
export default reviewsService;
