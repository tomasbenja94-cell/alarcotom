/**
 * Sistema de Badges y Logros
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

// Definición de badges
const BADGES = {
  // Pedidos
  FIRST_ORDER: { id: 'first_order', name: 'Primer Pedido', icon: '🎉', description: 'Realizaste tu primer pedido', points: 50 },
  ORDER_5: { id: 'order_5', name: 'Cliente Frecuente', icon: '⭐', description: '5 pedidos completados', points: 100 },
  ORDER_25: { id: 'order_25', name: 'Super Cliente', icon: '🌟', description: '25 pedidos completados', points: 250 },
  ORDER_100: { id: 'order_100', name: 'Cliente VIP', icon: '👑', description: '100 pedidos completados', points: 500 },
  
  // Gastos
  SPENDER_1K: { id: 'spender_1k', name: 'Buen Gusto', icon: '💰', description: 'Gastaste $1,000 en total', points: 100 },
  SPENDER_10K: { id: 'spender_10k', name: 'Gran Inversor', icon: '💎', description: 'Gastaste $10,000 en total', points: 300 },
  
  // Social
  FIRST_REVIEW: { id: 'first_review', name: 'Crítico', icon: '📝', description: 'Dejaste tu primera reseña', points: 30 },
  REFERRAL_1: { id: 'referral_1', name: 'Embajador', icon: '🤝', description: 'Referiste a tu primer amigo', points: 100 },
  REFERRAL_10: { id: 'referral_10', name: 'Influencer', icon: '📣', description: 'Referiste a 10 amigos', points: 500 },
  
  // Especiales
  NIGHT_OWL: { id: 'night_owl', name: 'Noctámbulo', icon: '🦉', description: 'Pedido después de medianoche', points: 50 },
  EARLY_BIRD: { id: 'early_bird', name: 'Madrugador', icon: '🐦', description: 'Pedido antes de las 8am', points: 50 },
  WEEKEND_WARRIOR: { id: 'weekend_warrior', name: 'Fin de Semana', icon: '🎊', description: '10 pedidos en fin de semana', points: 100 },
  
  // Fidelidad
  STREAK_7: { id: 'streak_7', name: 'Racha Semanal', icon: '🔥', description: '7 días seguidos con pedidos', points: 200 },
  ANNIVERSARY: { id: 'anniversary', name: 'Aniversario', icon: '🎂', description: '1 año como cliente', points: 300 },
};

class BadgesService {
  /**
   * Verificar y otorgar badges después de un pedido
   */
  async checkAndAwardBadges(customerId, orderId) {
    const awarded = [];
    const customer = await this.getCustomerStats(customerId);

    // Verificar cada badge
    for (const [key, badge] of Object.entries(BADGES)) {
      const hasIt = await this.hasBadge(customerId, badge.id);
      if (hasIt) continue;

      const earned = await this.checkBadgeCondition(badge.id, customer, orderId);
      if (earned) {
        await this.awardBadge(customerId, badge.id);
        awarded.push(badge);
      }
    }

    return awarded;
  }

  /**
   * Verificar condición de badge
   */
  async checkBadgeCondition(badgeId, stats, orderId) {
    const order = orderId ? await prisma.order.findUnique({ where: { id: orderId } }) : null;

    switch (badgeId) {
      case 'first_order': return stats.totalOrders === 1;
      case 'order_5': return stats.totalOrders >= 5;
      case 'order_25': return stats.totalOrders >= 25;
      case 'order_100': return stats.totalOrders >= 100;
      case 'spender_1k': return stats.totalSpent >= 1000;
      case 'spender_10k': return stats.totalSpent >= 10000;
      case 'first_review': return stats.totalReviews >= 1;
      case 'referral_1': return stats.totalReferrals >= 1;
      case 'referral_10': return stats.totalReferrals >= 10;
      case 'night_owl': 
        return order && new Date(order.createdAt).getHours() >= 0 && new Date(order.createdAt).getHours() < 5;
      case 'early_bird':
        return order && new Date(order.createdAt).getHours() >= 5 && new Date(order.createdAt).getHours() < 8;
      case 'weekend_warrior': return stats.weekendOrders >= 10;
      case 'streak_7': return stats.currentStreak >= 7;
      case 'anniversary': 
        const daysSinceJoin = (Date.now() - new Date(stats.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceJoin >= 365;
      default: return false;
    }
  }

  /**
   * Obtener estadísticas del cliente
   */
  async getCustomerStats(customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        orders: { where: { status: 'delivered' } },
        reviews: true,
        referrals: { where: { status: 'completed' } },
      },
    });

    if (!customer) return null;

    const weekendOrders = customer.orders.filter(o => {
      const day = new Date(o.createdAt).getDay();
      return day === 0 || day === 6;
    }).length;

    return {
      totalOrders: customer.orders.length,
      totalSpent: customer.orders.reduce((sum, o) => sum + o.total, 0),
      totalReviews: customer.reviews.length,
      totalReferrals: customer.referrals.length,
      weekendOrders,
      currentStreak: await this.calculateStreak(customerId),
      createdAt: customer.createdAt,
    };
  }

  /**
   * Calcular racha de días
   */
  async calculateStreak(customerId) {
    const orders = await prisma.order.findMany({
      where: { customerId, status: 'delivered' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (orders.length === 0) return 0;

    let streak = 1;
    let lastDate = new Date(orders[0].createdAt).toDateString();

    for (let i = 1; i < orders.length; i++) {
      const orderDate = new Date(orders[i].createdAt).toDateString();
      const lastDateTime = new Date(lastDate).getTime();
      const orderDateTime = new Date(orderDate).getTime();
      const diffDays = (lastDateTime - orderDateTime) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        streak++;
        lastDate = orderDate;
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Verificar si tiene badge
   */
  async hasBadge(customerId, badgeId) {
    const badge = await prisma.customerBadge.findFirst({
      where: { customerId, badgeId },
    });
    return !!badge;
  }

  /**
   * Otorgar badge
   */
  async awardBadge(customerId, badgeId) {
    const badge = BADGES[badgeId.toUpperCase()] || Object.values(BADGES).find(b => b.id === badgeId);
    if (!badge) return null;

    await prisma.customerBadge.create({
      data: { customerId, badgeId, earnedAt: new Date() },
    });

    // Dar puntos
    if (badge.points > 0) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { loyaltyPoints: { increment: badge.points } },
      });
    }

    logger.info({ customerId, badgeId }, 'Badge awarded');
    return badge;
  }

  /**
   * Obtener badges de un cliente
   */
  async getCustomerBadges(customerId) {
    const earned = await prisma.customerBadge.findMany({
      where: { customerId },
      orderBy: { earnedAt: 'desc' },
    });

    const allBadges = Object.values(BADGES).map(badge => ({
      ...badge,
      earned: earned.some(e => e.badgeId === badge.id),
      earnedAt: earned.find(e => e.badgeId === badge.id)?.earnedAt,
    }));

    return {
      earned: allBadges.filter(b => b.earned),
      locked: allBadges.filter(b => !b.earned),
      totalPoints: allBadges.filter(b => b.earned).reduce((sum, b) => sum + b.points, 0),
    };
  }

  /**
   * Obtener todos los badges disponibles
   */
  getAllBadges() {
    return Object.values(BADGES);
  }
}

export const badgesService = new BadgesService();
export default badgesService;

