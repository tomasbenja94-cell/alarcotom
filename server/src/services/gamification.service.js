/**
 * Sistema de Gamificación y Fidelización
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class GamificationService {
  ACHIEVEMENTS = {
    FIRST_ORDER: { id: 'first_order', name: 'Primera Compra', points: 50, icon: '🎉' },
    FIVE_ORDERS: { id: 'five_orders', name: 'Cliente Frecuente', points: 100, icon: '⭐' },
    TEN_ORDERS: { id: 'ten_orders', name: 'Super Fan', points: 200, icon: '🌟' },
    FIFTY_ORDERS: { id: 'fifty_orders', name: 'Leyenda', points: 500, icon: '👑' },
    FIRST_REVIEW: { id: 'first_review', name: 'Crítico', points: 30, icon: '📝' },
    FIVE_REVIEWS: { id: 'five_reviews', name: 'Influencer', points: 100, icon: '📣' },
    REFERRAL: { id: 'referral', name: 'Embajador', points: 150, icon: '🤝' },
    NIGHT_OWL: { id: 'night_owl', name: 'Noctámbulo', points: 50, icon: '🦉' },
    EARLY_BIRD: { id: 'early_bird', name: 'Madrugador', points: 50, icon: '🐦' },
    BIG_SPENDER: { id: 'big_spender', name: 'Gran Gasto', points: 100, icon: '💰' },
    STREAK_7: { id: 'streak_7', name: 'Racha de 7 días', points: 200, icon: '🔥' },
    STREAK_30: { id: 'streak_30', name: 'Racha de 30 días', points: 500, icon: '💎' },
    CATEGORY_EXPLORER: { id: 'category_explorer', name: 'Explorador', points: 75, icon: '🧭' },
    BIRTHDAY: { id: 'birthday', name: 'Cumpleañero', points: 100, icon: '🎂' },
  };

  TIERS = [
    { name: 'Bronce', minPoints: 0, multiplier: 1, color: '#CD7F32', perks: [] },
    { name: 'Plata', minPoints: 500, multiplier: 1.25, color: '#C0C0C0', perks: ['Envío gratis 1x/mes'] },
    { name: 'Oro', minPoints: 1500, multiplier: 1.5, color: '#FFD700', perks: ['Envío gratis', '10% descuento'] },
    { name: 'Platino', minPoints: 5000, multiplier: 2, color: '#E5E4E2', perks: ['Envío gratis', '15% descuento', 'Acceso anticipado'] },
    { name: 'Diamante', minPoints: 15000, multiplier: 3, color: '#B9F2FF', perks: ['Todo Platino', 'Productos exclusivos', 'Soporte VIP'] },
  ];

  /**
   * Procesar orden y otorgar puntos/logros
   */
  async processOrder(customerId, order) {
    const pointsEarned = [];
    const achievementsUnlocked = [];

    // Puntos base por orden
    const basePoints = Math.floor(order.total / 10);
    const tier = await this.getCustomerTier(customerId);
    const multipliedPoints = Math.floor(basePoints * tier.multiplier);

    await this.addPoints(customerId, multipliedPoints, 'order', order.id);
    pointsEarned.push({ reason: 'Compra', points: multipliedPoints });

    // Verificar logros
    const orderCount = await prisma.order.count({
      where: { customerId, status: 'delivered' },
    });

    if (orderCount === 1) {
      const ach = await this.unlockAchievement(customerId, 'FIRST_ORDER');
      if (ach) achievementsUnlocked.push(ach);
    }
    if (orderCount === 5) {
      const ach = await this.unlockAchievement(customerId, 'FIVE_ORDERS');
      if (ach) achievementsUnlocked.push(ach);
    }
    if (orderCount === 10) {
      const ach = await this.unlockAchievement(customerId, 'TEN_ORDERS');
      if (ach) achievementsUnlocked.push(ach);
    }
    if (orderCount === 50) {
      const ach = await this.unlockAchievement(customerId, 'FIFTY_ORDERS');
      if (ach) achievementsUnlocked.push(ach);
    }

    // Logro por hora
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) {
      const ach = await this.unlockAchievement(customerId, 'NIGHT_OWL');
      if (ach) achievementsUnlocked.push(ach);
    }
    if (hour >= 6 && hour < 9) {
      const ach = await this.unlockAchievement(customerId, 'EARLY_BIRD');
      if (ach) achievementsUnlocked.push(ach);
    }

    // Logro por monto
    if (order.total >= 5000) {
      const ach = await this.unlockAchievement(customerId, 'BIG_SPENDER');
      if (ach) achievementsUnlocked.push(ach);
    }

    // Verificar racha
    const streakResult = await this.updateStreak(customerId);
    if (streakResult.achievement) {
      achievementsUnlocked.push(streakResult.achievement);
    }

    return { pointsEarned, achievementsUnlocked, newTier: await this.checkTierUpgrade(customerId) };
  }

  /**
   * Agregar puntos
   */
  async addPoints(customerId, points, reason, referenceId = null) {
    await prisma.customerLoyalty.upsert({
      where: { customerId },
      update: { totalPoints: { increment: points } },
      create: { customerId, totalPoints: points },
    });

    await prisma.pointsHistory.create({
      data: { customerId, points, reason, referenceId },
    });

    logger.info({ customerId, points, reason }, 'Points added');
  }

  /**
   * Desbloquear logro
   */
  async unlockAchievement(customerId, achievementKey) {
    const achievement = this.ACHIEVEMENTS[achievementKey];
    if (!achievement) return null;

    const existing = await prisma.customerAchievement.findFirst({
      where: { customerId, achievementId: achievement.id },
    });

    if (existing) return null;

    await prisma.customerAchievement.create({
      data: {
        customerId,
        achievementId: achievement.id,
        unlockedAt: new Date(),
      },
    });

    await this.addPoints(customerId, achievement.points, 'achievement', achievement.id);

    logger.info({ customerId, achievement: achievement.name }, 'Achievement unlocked');
    return achievement;
  }

  /**
   * Obtener tier del cliente
   */
  async getCustomerTier(customerId) {
    const loyalty = await prisma.customerLoyalty.findUnique({ where: { customerId } });
    const points = loyalty?.totalPoints || 0;

    for (let i = this.TIERS.length - 1; i >= 0; i--) {
      if (points >= this.TIERS[i].minPoints) {
        return this.TIERS[i];
      }
    }
    return this.TIERS[0];
  }

  /**
   * Verificar upgrade de tier
   */
  async checkTierUpgrade(customerId) {
    const loyalty = await prisma.customerLoyalty.findUnique({ where: { customerId } });
    if (!loyalty) return null;

    const currentTier = await this.getCustomerTier(customerId);
    
    if (loyalty.currentTier !== currentTier.name) {
      await prisma.customerLoyalty.update({
        where: { customerId },
        data: { currentTier: currentTier.name },
      });
      return currentTier;
    }
    return null;
  }

  /**
   * Actualizar racha
   */
  async updateStreak(customerId) {
    const loyalty = await prisma.customerLoyalty.findUnique({ where: { customerId } });
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let newStreak = 1;
    let achievement = null;

    if (loyalty?.lastOrderDate) {
      const lastDate = loyalty.lastOrderDate.toISOString().split('T')[0];
      if (lastDate === yesterday) {
        newStreak = (loyalty.currentStreak || 0) + 1;
      } else if (lastDate === today) {
        newStreak = loyalty.currentStreak || 1;
      }
    }

    await prisma.customerLoyalty.update({
      where: { customerId },
      data: {
        currentStreak: newStreak,
        longestStreak: { set: Math.max(newStreak, loyalty?.longestStreak || 0) },
        lastOrderDate: new Date(),
      },
    });

    if (newStreak === 7) {
      achievement = await this.unlockAchievement(customerId, 'STREAK_7');
    } else if (newStreak === 30) {
      achievement = await this.unlockAchievement(customerId, 'STREAK_30');
    }

    return { streak: newStreak, achievement };
  }

  /**
   * Canjear puntos
   */
  async redeemPoints(customerId, rewardId) {
    const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
    if (!reward || !reward.isActive) throw new Error('Recompensa no disponible');

    const loyalty = await prisma.customerLoyalty.findUnique({ where: { customerId } });
    if (!loyalty || loyalty.totalPoints < reward.pointsCost) {
      throw new Error('Puntos insuficientes');
    }

    await prisma.customerLoyalty.update({
      where: { customerId },
      data: { totalPoints: { decrement: reward.pointsCost } },
    });

    const redemption = await prisma.rewardRedemption.create({
      data: {
        customerId,
        rewardId,
        pointsSpent: reward.pointsCost,
        code: this.generateRedemptionCode(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    logger.info({ customerId, rewardId, points: reward.pointsCost }, 'Reward redeemed');
    return redemption;
  }

  generateRedemptionCode() {
    return 'RWD' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
  }

  /**
   * Obtener perfil de gamificación
   */
  async getCustomerProfile(customerId) {
    const [loyalty, achievements, redemptions] = await Promise.all([
      prisma.customerLoyalty.findUnique({ where: { customerId } }),
      prisma.customerAchievement.findMany({ where: { customerId } }),
      prisma.rewardRedemption.findMany({
        where: { customerId },
        include: { reward: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const tier = await this.getCustomerTier(customerId);
    const nextTier = this.TIERS.find(t => t.minPoints > (loyalty?.totalPoints || 0));

    return {
      points: loyalty?.totalPoints || 0,
      tier,
      nextTier,
      pointsToNextTier: nextTier ? nextTier.minPoints - (loyalty?.totalPoints || 0) : null,
      currentStreak: loyalty?.currentStreak || 0,
      longestStreak: loyalty?.longestStreak || 0,
      achievements: achievements.map(a => ({
        ...this.ACHIEVEMENTS[Object.keys(this.ACHIEVEMENTS).find(k => this.ACHIEVEMENTS[k].id === a.achievementId)],
        unlockedAt: a.unlockedAt,
      })),
      availableAchievements: Object.values(this.ACHIEVEMENTS).filter(
        a => !achievements.find(ua => ua.achievementId === a.id)
      ),
      recentRedemptions: redemptions,
    };
  }

  /**
   * Leaderboard
   */
  async getLeaderboard(storeId, limit = 10) {
    const customers = await prisma.customerLoyalty.findMany({
      where: {
        customer: { orders: { some: { storeId } } },
      },
      include: { customer: { select: { name: true } } },
      orderBy: { totalPoints: 'desc' },
      take: limit,
    });

    return customers.map((c, i) => ({
      rank: i + 1,
      customerId: c.customerId,
      name: c.customer.name,
      points: c.totalPoints,
      tier: this.TIERS.find(t => c.totalPoints >= t.minPoints)?.name || 'Bronce',
      streak: c.currentStreak,
    }));
  }
}

export const gamificationService = new GamificationService();
export default gamificationService;

