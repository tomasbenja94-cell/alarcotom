/**
 * Servicio de Fidelización
 * Puntos, niveles y recompensas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

// Configuración de niveles
const LEVELS = {
  bronce: { minPoints: 0, discount: 0, multiplier: 1, benefits: [] },
  plata: { minPoints: 500, discount: 5, multiplier: 1.2, benefits: ['Envío gratis 1x mes'] },
  oro: { minPoints: 2000, discount: 10, multiplier: 1.5, benefits: ['Envío gratis', 'Acceso anticipado'] },
  platino: { minPoints: 5000, discount: 15, multiplier: 2, benefits: ['Envío gratis', 'Prioridad', 'Regalos exclusivos'] },
};

// Puntos por acción
const POINTS_CONFIG = {
  orderBase: 10,           // Puntos base por pedido
  perDollar: 1,            // Puntos por cada $1 gastado
  referral: 100,           // Puntos por referir a alguien
  referralBonus: 50,       // Puntos para el referido
  firstOrder: 50,          // Bonus primer pedido
  review: 20,              // Puntos por dejar reseña
  birthday: 200,           // Puntos de cumpleaños
};

class LoyaltyService {
  /**
   * Obtener o crear perfil de fidelización
   */
  async getOrCreateProfile(userId) {
    let user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    return user;
  }

  /**
   * Calcular nivel basado en puntos
   */
  calculateLevel(points) {
    if (points >= LEVELS.platino.minPoints) return 'platino';
    if (points >= LEVELS.oro.minPoints) return 'oro';
    if (points >= LEVELS.plata.minPoints) return 'plata';
    return 'bronce';
  }

  /**
   * Agregar puntos a un usuario
   */
  async addPoints(userId, points, reason, metadata = {}) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const newPoints = user.points + points;
    const newLevel = this.calculateLevel(newPoints);
    const levelChanged = newLevel !== user.level;

    // Actualizar usuario
    await prisma.user.update({
      where: { id: userId },
      data: {
        points: newPoints,
        level: newLevel,
      },
    });

    logger.info({
      userId,
      points,
      reason,
      newTotal: newPoints,
      levelChanged,
    }, 'Points added');

    return {
      pointsAdded: points,
      newTotal: newPoints,
      level: newLevel,
      levelChanged,
      levelBenefits: levelChanged ? LEVELS[newLevel].benefits : null,
    };
  }

  /**
   * Procesar puntos por pedido
   */
  async processOrderPoints(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order || !order.userId || order.status !== 'delivered') {
      return null;
    }

    const user = order.user;
    const levelConfig = LEVELS[user.level] || LEVELS.bronce;

    // Calcular puntos
    let points = POINTS_CONFIG.orderBase;
    points += Math.floor(order.total * POINTS_CONFIG.perDollar);
    
    // Aplicar multiplicador de nivel
    points = Math.floor(points * levelConfig.multiplier);

    // Bonus primer pedido
    if (user.totalOrders === 0) {
      points += POINTS_CONFIG.firstOrder;
    }

    // Agregar puntos
    const result = await this.addPoints(user.id, points, 'order', { orderId });

    // Actualizar estadísticas del usuario
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totalOrders: { increment: 1 },
        totalSpent: { increment: order.total },
      },
    });

    return result;
  }

  /**
   * Canjear puntos por descuento
   */
  async redeemPoints(userId, pointsToRedeem) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    if (user.points < pointsToRedeem) {
      throw new Error('Puntos insuficientes');
    }

    // 100 puntos = $1 de descuento
    const discountValue = pointsToRedeem / 100;

    await prisma.user.update({
      where: { id: userId },
      data: {
        points: { decrement: pointsToRedeem },
      },
    });

    logger.info({
      userId,
      pointsRedeemed: pointsToRedeem,
      discountValue,
    }, 'Points redeemed');

    return {
      pointsRedeemed: pointsToRedeem,
      discountValue,
      remainingPoints: user.points - pointsToRedeem,
    };
  }

  /**
   * Procesar referido
   */
  async processReferral(referrerId, referredId) {
    // Puntos para quien refiere
    await this.addPoints(referrerId, POINTS_CONFIG.referral, 'referral', { referredId });
    
    // Puntos para el referido
    await this.addPoints(referredId, POINTS_CONFIG.referralBonus, 'referral_bonus', { referrerId });

    logger.info({ referrerId, referredId }, 'Referral processed');

    return {
      referrerPoints: POINTS_CONFIG.referral,
      referredPoints: POINTS_CONFIG.referralBonus,
    };
  }

  /**
   * Obtener resumen de fidelización
   */
  async getLoyaltySummary(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const levelConfig = LEVELS[user.level];
    const nextLevel = this.getNextLevel(user.level);
    const nextLevelConfig = nextLevel ? LEVELS[nextLevel] : null;

    return {
      currentPoints: user.points,
      level: user.level,
      levelDiscount: levelConfig.discount,
      levelBenefits: levelConfig.benefits,
      nextLevel,
      pointsToNextLevel: nextLevelConfig ? nextLevelConfig.minPoints - user.points : 0,
      totalOrders: user.totalOrders,
      totalSpent: user.totalSpent,
      pointsValue: user.points / 100, // Valor en $ de los puntos
    };
  }

  /**
   * Obtener siguiente nivel
   */
  getNextLevel(currentLevel) {
    const levelOrder = ['bronce', 'plata', 'oro', 'platino'];
    const currentIndex = levelOrder.indexOf(currentLevel);
    return currentIndex < levelOrder.length - 1 ? levelOrder[currentIndex + 1] : null;
  }

  /**
   * Aplicar descuento de nivel a un pedido
   */
  calculateLevelDiscount(total, level) {
    const levelConfig = LEVELS[level] || LEVELS.bronce;
    return total * (levelConfig.discount / 100);
  }

  /**
   * Obtener configuración de niveles
   */
  getLevelsConfig() {
    return LEVELS;
  }

  /**
   * Obtener configuración de puntos
   */
  getPointsConfig() {
    return POINTS_CONFIG;
  }
}

export const loyaltyService = new LoyaltyService();
export default loyaltyService;

