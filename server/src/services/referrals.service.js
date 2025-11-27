/**
 * Sistema de Referidos con Recompensas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

class ReferralsService {
  /**
   * Generar código de referido único
   */
  generateReferralCode(customerId) {
    const hash = crypto.createHash('md5').update(customerId + Date.now()).digest('hex');
    return hash.substring(0, 8).toUpperCase();
  }

  /**
   * Obtener o crear código de referido
   */
  async getOrCreateReferralCode(customerId) {
    let customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { referralCode: true },
    });

    if (customer?.referralCode) return customer.referralCode;

    const code = this.generateReferralCode(customerId);
    await prisma.customer.update({
      where: { id: customerId },
      data: { referralCode: code },
    });

    return code;
  }

  /**
   * Aplicar código de referido
   */
  async applyReferralCode(newCustomerId, referralCode) {
    // Buscar quien refirió
    const referrer = await prisma.customer.findFirst({
      where: { referralCode: referralCode.toUpperCase() },
    });

    if (!referrer) throw new Error('Código de referido inválido');
    if (referrer.id === newCustomerId) throw new Error('No puedes usar tu propio código');

    // Verificar que no haya usado código antes
    const existingReferral = await prisma.referral.findFirst({
      where: { referredId: newCustomerId },
    });

    if (existingReferral) throw new Error('Ya usaste un código de referido');

    // Crear referencia
    const referral = await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredId: newCustomerId,
        code: referralCode,
        status: 'pending',
      },
    });

    logger.info({ referrerId: referrer.id, referredId: newCustomerId }, 'Referral applied');
    return referral;
  }

  /**
   * Completar referido (cuando el referido hace su primer pedido)
   */
  async completeReferral(customerId, orderId) {
    const referral = await prisma.referral.findFirst({
      where: { referredId: customerId, status: 'pending' },
    });

    if (!referral) return null;

    // Obtener configuración de recompensas
    const config = await this.getReferralConfig();

    // Actualizar referido
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        orderId,
      },
    });

    // Dar recompensa al referidor
    if (config.referrerReward > 0) {
      await prisma.customer.update({
        where: { id: referral.referrerId },
        data: { credits: { increment: config.referrerReward } },
      });
    }

    // Dar recompensa al referido
    if (config.referredReward > 0) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { credits: { increment: config.referredReward } },
      });
    }

    logger.info({ referralId: referral.id, referrerReward: config.referrerReward }, 'Referral completed');
    return { referrerReward: config.referrerReward, referredReward: config.referredReward };
  }

  /**
   * Configuración de referidos
   */
  async getReferralConfig() {
    // En producción, obtener de DB o config
    return {
      referrerReward: 500, // Créditos para quien refiere
      referredReward: 300, // Créditos para el referido
      minOrderAmount: 1000, // Monto mínimo del primer pedido
      maxReferrals: 50, // Máximo de referidos por usuario
    };
  }

  /**
   * Estadísticas de referidos de un cliente
   */
  async getCustomerReferralStats(customerId) {
    const code = await this.getOrCreateReferralCode(customerId);

    const referrals = await prisma.referral.findMany({
      where: { referrerId: customerId },
      include: {
        referred: { select: { name: true, createdAt: true } },
      },
    });

    const completed = referrals.filter(r => r.status === 'completed');
    const config = await this.getReferralConfig();

    return {
      code,
      shareUrl: `https://app.tutienda.com/ref/${code}`,
      totalReferrals: referrals.length,
      completedReferrals: completed.length,
      pendingReferrals: referrals.length - completed.length,
      totalEarned: completed.length * config.referrerReward,
      referrals: referrals.map(r => ({
        name: r.referred?.name || 'Cliente',
        status: r.status,
        date: r.createdAt,
        reward: r.status === 'completed' ? config.referrerReward : 0,
      })),
    };
  }

  /**
   * Leaderboard de referidos
   */
  async getReferralLeaderboard(limit = 10) {
    const topReferrers = await prisma.referral.groupBy({
      by: ['referrerId'],
      where: { status: 'completed' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    const customerIds = topReferrers.map(r => r.referrerId);
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true },
    });

    const config = await this.getReferralConfig();

    return topReferrers.map((r, index) => {
      const customer = customers.find(c => c.id === r.referrerId);
      return {
        rank: index + 1,
        name: customer?.name || 'Anónimo',
        referrals: r._count.id,
        earned: r._count.id * config.referrerReward,
      };
    });
  }
}

export const referralsService = new ReferralsService();
export default referralsService;

