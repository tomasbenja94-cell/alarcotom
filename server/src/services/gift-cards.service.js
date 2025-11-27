/**
 * Sistema de Gift Cards / Tarjetas de Regalo
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

class GiftCardsService {
  /**
   * Crear gift card
   */
  async createGiftCard(storeId, giftCardData) {
    const {
      amount, purchaserId, recipientEmail, recipientName,
      message, designId, deliveryDate,
    } = giftCardData;

    const code = this.generateCode();

    const giftCard = await prisma.giftCard.create({
      data: {
        storeId,
        code,
        initialAmount: amount,
        currentBalance: amount,
        purchaserId,
        recipientEmail,
        recipientName,
        message,
        designId,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date(),
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año
      },
    });

    // Programar envío si tiene fecha futura
    if (deliveryDate && new Date(deliveryDate) > new Date()) {
      await prisma.scheduledTask.create({
        data: {
          type: 'send_gift_card',
          referenceId: giftCard.id,
          scheduledFor: new Date(deliveryDate),
        },
      });
    } else {
      await this.sendGiftCardEmail(giftCard);
    }

    logger.info({ giftCardId: giftCard.id, amount }, 'Gift card created');
    return giftCard;
  }

  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) code += '-';
      code += chars[crypto.randomInt(chars.length)];
    }
    return code;
  }

  async sendGiftCardEmail(giftCard) {
    // Integrar con servicio de email
    logger.info({ giftCardId: giftCard.id, email: giftCard.recipientEmail }, 'Gift card email sent');
  }

  /**
   * Verificar gift card
   */
  async verifyGiftCard(code) {
    const giftCard = await prisma.giftCard.findUnique({ where: { code } });

    if (!giftCard) {
      return { valid: false, error: 'Código inválido' };
    }

    if (giftCard.status !== 'active') {
      return { valid: false, error: 'Gift card inactiva' };
    }

    if (giftCard.expiresAt < new Date()) {
      return { valid: false, error: 'Gift card expirada' };
    }

    if (giftCard.currentBalance <= 0) {
      return { valid: false, error: 'Sin saldo disponible' };
    }

    return {
      valid: true,
      balance: giftCard.currentBalance,
      expiresAt: giftCard.expiresAt,
    };
  }

  /**
   * Usar gift card en pedido
   */
  async redeemGiftCard(code, orderId, amount) {
    const giftCard = await prisma.giftCard.findUnique({ where: { code } });

    if (!giftCard || giftCard.status !== 'active') {
      throw new Error('Gift card inválida');
    }

    if (giftCard.currentBalance < amount) {
      throw new Error('Saldo insuficiente');
    }

    const newBalance = giftCard.currentBalance - amount;

    await prisma.$transaction([
      prisma.giftCard.update({
        where: { id: giftCard.id },
        data: {
          currentBalance: newBalance,
          status: newBalance === 0 ? 'depleted' : 'active',
          lastUsedAt: new Date(),
        },
      }),
      prisma.giftCardTransaction.create({
        data: {
          giftCardId: giftCard.id,
          orderId,
          amount: -amount,
          balanceAfter: newBalance,
          type: 'redemption',
        },
      }),
    ]);

    logger.info({ giftCardId: giftCard.id, amount, newBalance }, 'Gift card redeemed');
    return { success: true, amountUsed: amount, remainingBalance: newBalance };
  }

  /**
   * Recargar gift card
   */
  async reloadGiftCard(code, amount, purchaserId) {
    const giftCard = await prisma.giftCard.findUnique({ where: { code } });

    if (!giftCard) throw new Error('Gift card no encontrada');
    if (giftCard.status === 'cancelled') throw new Error('Gift card cancelada');

    const newBalance = giftCard.currentBalance + amount;

    await prisma.$transaction([
      prisma.giftCard.update({
        where: { id: giftCard.id },
        data: {
          currentBalance: newBalance,
          status: 'active',
        },
      }),
      prisma.giftCardTransaction.create({
        data: {
          giftCardId: giftCard.id,
          amount,
          balanceAfter: newBalance,
          type: 'reload',
          purchaserId,
        },
      }),
    ]);

    logger.info({ giftCardId: giftCard.id, amount, newBalance }, 'Gift card reloaded');
    return { success: true, newBalance };
  }

  /**
   * Obtener historial de transacciones
   */
  async getTransactionHistory(code) {
    const giftCard = await prisma.giftCard.findUnique({
      where: { code },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          include: { order: { select: { orderNumber: true } } },
        },
      },
    });

    if (!giftCard) throw new Error('Gift card no encontrada');

    return {
      code: giftCard.code,
      initialAmount: giftCard.initialAmount,
      currentBalance: giftCard.currentBalance,
      status: giftCard.status,
      expiresAt: giftCard.expiresAt,
      transactions: giftCard.transactions.map(t => ({
        date: t.createdAt,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        orderNumber: t.order?.orderNumber,
      })),
    };
  }

  /**
   * Cancelar gift card
   */
  async cancelGiftCard(giftCardId, reason) {
    const giftCard = await prisma.giftCard.findUnique({ where: { id: giftCardId } });
    if (!giftCard) throw new Error('Gift card no encontrada');

    await prisma.giftCard.update({
      where: { id: giftCardId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    // Procesar reembolso si corresponde
    if (giftCard.currentBalance > 0) {
      // Integrar con sistema de pagos para reembolso
    }

    logger.info({ giftCardId, reason }, 'Gift card cancelled');
    return { success: true, refundAmount: giftCard.currentBalance };
  }

  /**
   * Obtener gift cards de tienda
   */
  async getStoreGiftCards(storeId, filters = {}) {
    const { status, startDate, endDate } = filters;

    return prisma.giftCard.findMany({
      where: {
        storeId,
        status: status || undefined,
        createdAt: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Estadísticas de gift cards
   */
  async getGiftCardStats(storeId, year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const giftCards = await prisma.giftCard.findMany({
      where: { storeId, createdAt: { gte: startDate, lte: endDate } },
    });

    const totalSold = giftCards.reduce((sum, gc) => sum + gc.initialAmount, 0);
    const totalRedeemed = giftCards.reduce((sum, gc) => sum + (gc.initialAmount - gc.currentBalance), 0);
    const unredeemed = totalSold - totalRedeemed;

    return {
      year,
      totalCards: giftCards.length,
      totalSold,
      totalRedeemed,
      unredeemed,
      redemptionRate: totalSold > 0 ? Math.round((totalRedeemed / totalSold) * 100) : 0,
      avgAmount: giftCards.length > 0 ? Math.round(totalSold / giftCards.length) : 0,
      byStatus: {
        active: giftCards.filter(gc => gc.status === 'active').length,
        depleted: giftCards.filter(gc => gc.status === 'depleted').length,
        expired: giftCards.filter(gc => gc.status === 'expired').length,
        cancelled: giftCards.filter(gc => gc.status === 'cancelled').length,
      },
    };
  }

  /**
   * Obtener diseños disponibles
   */
  async getDesigns(storeId) {
    return prisma.giftCardDesign.findMany({
      where: { storeId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Verificar gift cards por expirar
   */
  async checkExpiringCards(storeId, daysAhead = 30) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysAhead);

    return prisma.giftCard.findMany({
      where: {
        storeId,
        status: 'active',
        currentBalance: { gt: 0 },
        expiresAt: { lte: threshold, gte: new Date() },
      },
    });
  }
}

export const giftCardsService = new GiftCardsService();
export default giftCardsService;
