/**
 * Sistema de Referidos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

class ReferralService {
  /**
   * Configurar programa de referidos
   */
  async configureProgram(storeId, config) {
    const {
      referrerReward, refereeReward, rewardType,
      minOrderAmount, maxReferrals, expirationDays,
    } = config;

    return prisma.referralProgram.upsert({
      where: { storeId },
      update: {
        referrerReward,
        refereeReward,
        rewardType, // 'credit', 'discount_percent', 'free_delivery', 'points'
        minOrderAmount: minOrderAmount || 0,
        maxReferrals: maxReferrals || null,
        expirationDays: expirationDays || 30,
        isActive: true,
      },
      create: {
        storeId,
        referrerReward,
        refereeReward,
        rewardType,
        minOrderAmount: minOrderAmount || 0,
        maxReferrals,
        expirationDays: expirationDays || 30,
        isActive: true,
      },
    });
  }

  /**
   * Generar código de referido para cliente
   */
  async generateReferralCode(customerId) {
    const existing = await prisma.referralCode.findFirst({
      where: { customerId, isActive: true },
    });

    if (existing) return existing;

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    const code = this.createUniqueCode(customer?.name);

    return prisma.referralCode.create({
      data: {
        customerId,
        code,
        isActive: true,
      },
    });
  }

  createUniqueCode(name) {
    const prefix = name ? name.slice(0, 3).toUpperCase() : 'REF';
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}${random}`;
  }

  /**
   * Aplicar código de referido
   */
  async applyReferralCode(code, newCustomerId, storeId) {
    const referralCode = await prisma.referralCode.findFirst({
      where: { code, isActive: true },
      include: { customer: true },
    });

    if (!referralCode) {
      return { success: false, error: 'Código inválido' };
    }

    if (referralCode.customerId === newCustomerId) {
      return { success: false, error: 'No puedes usar tu propio código' };
    }

    // Verificar si ya fue referido
    const existingReferral = await prisma.referral.findFirst({
      where: { refereeId: newCustomerId },
    });

    if (existingReferral) {
      return { success: false, error: 'Ya fuiste referido anteriormente' };
    }

    // Obtener programa
    const program = await prisma.referralProgram.findUnique({ where: { storeId } });
    if (!program?.isActive) {
      return { success: false, error: 'Programa de referidos no activo' };
    }

    // Verificar límite de referidos
    if (program.maxReferrals) {
      const referralCount = await prisma.referral.count({
        where: { referrerId: referralCode.customerId, status: 'completed' },
      });

      if (referralCount >= program.maxReferrals) {
        return { success: false, error: 'El código ha alcanzado su límite de usos' };
      }
    }

    // Crear referido pendiente
    const referral = await prisma.referral.create({
      data: {
        referrerId: referralCode.customerId,
        refereeId: newCustomerId,
        referralCodeId: referralCode.id,
        storeId,
        status: 'pending',
        expiresAt: new Date(Date.now() + program.expirationDays * 24 * 60 * 60 * 1000),
      },
    });

    logger.info({ referralId: referral.id, code }, 'Referral code applied');
    return {
      success: true,
      referralId: referral.id,
      refereeReward: program.refereeReward,
      rewardType: program.rewardType,
      minOrderAmount: program.minOrderAmount,
    };
  }

  /**
   * Completar referido (después de primera compra)
   */
  async completeReferral(refereeId, orderId, orderTotal) {
    const referral = await prisma.referral.findFirst({
      where: { refereeId, status: 'pending' },
      include: { store: { include: { referralProgram: true } } },
    });

    if (!referral) return null;

    const program = referral.store.referralProgram;
    if (!program) return null;

    // Verificar monto mínimo
    if (orderTotal < program.minOrderAmount) {
      return { success: false, error: `Monto mínimo: $${program.minOrderAmount}` };
    }

    // Verificar expiración
    if (referral.expiresAt < new Date()) {
      await prisma.referral.update({
        where: { id: referral.id },
        data: { status: 'expired' },
      });
      return { success: false, error: 'Referido expirado' };
    }

    // Otorgar recompensas
    await this.grantReward(referral.referrerId, program.referrerReward, program.rewardType, referral.storeId);
    await this.grantReward(referral.refereeId, program.refereeReward, program.rewardType, referral.storeId);

    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        completingOrderId: orderId,
        referrerRewardAmount: program.referrerReward,
        refereeRewardAmount: program.refereeReward,
      },
    });

    logger.info({ referralId: referral.id }, 'Referral completed');
    return {
      success: true,
      referrerReward: program.referrerReward,
      refereeReward: program.refereeReward,
    };
  }

  async grantReward(customerId, amount, type, storeId) {
    switch (type) {
      case 'credit':
        await prisma.customerCredit.create({
          data: {
            customerId,
            storeId,
            amount,
            type: 'referral',
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        });
        break;

      case 'points':
        await prisma.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: { increment: amount } },
        });
        break;

      case 'discount_percent':
        await prisma.customerCoupon.create({
          data: {
            customerId,
            storeId,
            code: `REF${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            discountPercent: amount,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
        break;

      case 'free_delivery':
        await prisma.customerPerk.create({
          data: {
            customerId,
            storeId,
            type: 'free_delivery',
            usesRemaining: amount,
          },
        });
        break;
    }
  }

  /**
   * Obtener estadísticas de referidos del cliente
   */
  async getCustomerReferralStats(customerId) {
    const [code, referrals, totalEarned] = await Promise.all([
      prisma.referralCode.findFirst({ where: { customerId, isActive: true } }),
      prisma.referral.findMany({
        where: { referrerId: customerId },
        include: { referee: { select: { name: true } } },
      }),
      prisma.referral.aggregate({
        where: { referrerId: customerId, status: 'completed' },
        _sum: { referrerRewardAmount: true },
      }),
    ]);

    return {
      referralCode: code?.code,
      totalReferrals: referrals.length,
      completedReferrals: referrals.filter(r => r.status === 'completed').length,
      pendingReferrals: referrals.filter(r => r.status === 'pending').length,
      totalEarned: totalEarned._sum.referrerRewardAmount || 0,
      referrals: referrals.map(r => ({
        refereeName: r.referee?.name || 'Usuario',
        status: r.status,
        rewardAmount: r.referrerRewardAmount,
        completedAt: r.completedAt,
      })),
    };
  }

  /**
   * Obtener link de referido
   */
  async getReferralLink(customerId, storeId) {
    let code = await prisma.referralCode.findFirst({
      where: { customerId, isActive: true },
    });

    if (!code) {
      code = await this.generateReferralCode(customerId);
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });

    return {
      code: code.code,
      link: `${process.env.APP_URL}/r/${code.code}`,
      shareText: `¡Pedí en ${store?.name || 'nuestra app'} con mi código ${code.code} y ambos ganamos!`,
    };
  }

  /**
   * Estadísticas del programa
   */
  async getProgramStats(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [total, completed, totalRewards] = await Promise.all([
      prisma.referral.count({
        where: { storeId, createdAt: { gte: startDate } },
      }),
      prisma.referral.count({
        where: { storeId, status: 'completed', createdAt: { gte: startDate } },
      }),
      prisma.referral.aggregate({
        where: { storeId, status: 'completed', createdAt: { gte: startDate } },
        _sum: { referrerRewardAmount: true, refereeRewardAmount: true },
      }),
    ]);

    return {
      period: `${days} días`,
      totalReferrals: total,
      completedReferrals: completed,
      conversionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalRewardsGiven: (totalRewards._sum.referrerRewardAmount || 0) + (totalRewards._sum.refereeRewardAmount || 0),
    };
  }

  /**
   * Top referidores
   */
  async getTopReferrers(storeId, limit = 10) {
    const referrers = await prisma.referral.groupBy({
      by: ['referrerId'],
      where: { storeId, status: 'completed' },
      _count: true,
      _sum: { referrerRewardAmount: true },
      orderBy: { _count: { referrerId: 'desc' } },
      take: limit,
    });

    const customers = await prisma.customer.findMany({
      where: { id: { in: referrers.map(r => r.referrerId) } },
      select: { id: true, name: true },
    });

    return referrers.map(r => ({
      customerId: r.referrerId,
      customerName: customers.find(c => c.id === r.referrerId)?.name || 'Usuario',
      referralCount: r._count,
      totalEarned: r._sum.referrerRewardAmount || 0,
    }));
  }
}

export const referralService = new ReferralService();
export default referralService;
