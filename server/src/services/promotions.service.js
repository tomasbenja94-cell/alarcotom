/**
 * Sistema de Eventos y Promociones
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class PromotionsService {
  PROMO_TYPES = {
    PERCENTAGE: 'percentage',
    FIXED: 'fixed',
    BOGO: 'bogo',
    FREE_ITEM: 'free_item',
    FREE_DELIVERY: 'free_delivery',
    BUNDLE: 'bundle',
  };

  /**
   * Crear promoción
   */
  async createPromotion(storeId, promoData) {
    const {
      name,
      description,
      type,
      value,
      code,
      startDate,
      endDate,
      minOrder,
      maxDiscount,
      usageLimit,
      perUserLimit,
      applicableProducts,
      applicableCategories,
      conditions,
      isAutomatic,
    } = promoData;

    const promotion = await prisma.promotion.create({
      data: {
        storeId,
        name,
        description,
        type,
        value,
        code: code?.toUpperCase(),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        minOrder,
        maxDiscount,
        usageLimit,
        usageCount: 0,
        perUserLimit,
        applicableProducts: applicableProducts ? JSON.stringify(applicableProducts) : null,
        applicableCategories: applicableCategories ? JSON.stringify(applicableCategories) : null,
        conditions: conditions ? JSON.stringify(conditions) : null,
        isAutomatic: isAutomatic || false,
        isActive: true,
      },
    });

    logger.info({ promotionId: promotion.id, name, type }, 'Promotion created');
    return promotion;
  }

  /**
   * Obtener promociones activas
   */
  async getActivePromotions(storeId) {
    const now = new Date();

    return prisma.promotion.findMany({
      where: {
        storeId,
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { usageLimit: null },
          { usageCount: { lt: prisma.promotion.fields.usageLimit } },
        ],
      },
    });
  }

  /**
   * Validar y aplicar promoción
   */
  async applyPromotion(storeId, code, cart, customerId = null) {
    const now = new Date();

    const promotion = await prisma.promotion.findFirst({
      where: {
        storeId,
        code: code.toUpperCase(),
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });

    if (!promotion) {
      throw new Error('Código promocional inválido o expirado');
    }

    // Verificar límite de uso
    if (promotion.usageLimit && promotion.usageCount >= promotion.usageLimit) {
      throw new Error('Esta promoción ha alcanzado su límite de usos');
    }

    // Verificar límite por usuario
    if (customerId && promotion.perUserLimit) {
      const userUsage = await prisma.promotionUsage.count({
        where: { promotionId: promotion.id, customerId },
      });
      if (userUsage >= promotion.perUserLimit) {
        throw new Error('Ya usaste esta promoción el máximo de veces permitido');
      }
    }

    // Verificar monto mínimo
    const cartTotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (promotion.minOrder && cartTotal < promotion.minOrder) {
      throw new Error(`Monto mínimo: $${promotion.minOrder}`);
    }

    // Calcular descuento
    const discount = this.calculateDiscount(promotion, cart);

    return {
      promotionId: promotion.id,
      promotionName: promotion.name,
      type: promotion.type,
      discount,
      message: `¡${promotion.name} aplicado!`,
    };
  }

  calculateDiscount(promotion, cart) {
    const applicableItems = this.getApplicableItems(promotion, cart.items);
    const applicableTotal = applicableItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    let discount = 0;

    switch (promotion.type) {
      case this.PROMO_TYPES.PERCENTAGE:
        discount = Math.round(applicableTotal * (promotion.value / 100));
        break;
      case this.PROMO_TYPES.FIXED:
        discount = promotion.value;
        break;
      case this.PROMO_TYPES.BOGO:
        // Buy One Get One - descuenta el item más barato
        const sorted = applicableItems.sort((a, b) => a.price - b.price);
        if (sorted.length >= 2) {
          discount = sorted[0].price;
        }
        break;
      case this.PROMO_TYPES.FREE_DELIVERY:
        discount = cart.deliveryFee || 0;
        break;
    }

    // Aplicar máximo descuento
    if (promotion.maxDiscount && discount > promotion.maxDiscount) {
      discount = promotion.maxDiscount;
    }

    return discount;
  }

  getApplicableItems(promotion, items) {
    if (!promotion.applicableProducts && !promotion.applicableCategories) {
      return items;
    }

    const productIds = promotion.applicableProducts ? JSON.parse(promotion.applicableProducts) : [];
    const categoryIds = promotion.applicableCategories ? JSON.parse(promotion.applicableCategories) : [];

    return items.filter(item => 
      productIds.includes(item.productId) || categoryIds.includes(item.categoryId)
    );
  }

  /**
   * Registrar uso de promoción
   */
  async recordUsage(promotionId, orderId, customerId, discount) {
    await prisma.promotionUsage.create({
      data: {
        promotionId,
        orderId,
        customerId,
        discountApplied: discount,
      },
    });

    await prisma.promotion.update({
      where: { id: promotionId },
      data: { usageCount: { increment: 1 } },
    });
  }

  /**
   * Crear evento especial
   */
  async createEvent(storeId, eventData) {
    const {
      name,
      description,
      date,
      startTime,
      endTime,
      type,
      specialMenu,
      ticketPrice,
      capacity,
      promotionId,
    } = eventData;

    const event = await prisma.storeEvent.create({
      data: {
        storeId,
        name,
        description,
        date: new Date(date),
        startTime,
        endTime,
        type, // 'happy_hour', 'live_music', 'special_menu', 'private', 'holiday'
        specialMenu: specialMenu ? JSON.stringify(specialMenu) : null,
        ticketPrice,
        capacity,
        promotionId,
        status: 'scheduled',
      },
    });

    logger.info({ eventId: event.id, name, type }, 'Event created');
    return event;
  }

  /**
   * Obtener eventos próximos
   */
  async getUpcomingEvents(storeId, days = 30) {
    const now = new Date();
    const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    return prisma.storeEvent.findMany({
      where: {
        storeId,
        date: { gte: now, lte: endDate },
        status: { not: 'cancelled' },
      },
      include: { promotion: true },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Estadísticas de promociones
   */
  async getPromotionStats(storeId, promotionId = null) {
    const where = { storeId };
    if (promotionId) where.promotionId = promotionId;

    const usages = await prisma.promotionUsage.findMany({
      where,
      include: { promotion: true },
    });

    const totalUsages = usages.length;
    const totalDiscount = usages.reduce((sum, u) => sum + u.discountApplied, 0);

    // Agrupar por promoción
    const byPromotion = {};
    usages.forEach(u => {
      if (!byPromotion[u.promotionId]) {
        byPromotion[u.promotionId] = {
          name: u.promotion.name,
          usages: 0,
          totalDiscount: 0,
        };
      }
      byPromotion[u.promotionId].usages++;
      byPromotion[u.promotionId].totalDiscount += u.discountApplied;
    });

    return {
      totalUsages,
      totalDiscount,
      avgDiscount: totalUsages > 0 ? Math.round(totalDiscount / totalUsages) : 0,
      byPromotion: Object.values(byPromotion).sort((a, b) => b.usages - a.usages),
    };
  }

  /**
   * Promociones automáticas
   */
  async getAutomaticPromotions(storeId, cart) {
    const now = new Date();
    
    const autoPromos = await prisma.promotion.findMany({
      where: {
        storeId,
        isAutomatic: true,
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });

    const applicable = [];

    for (const promo of autoPromos) {
      const cartTotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      if (!promo.minOrder || cartTotal >= promo.minOrder) {
        const discount = this.calculateDiscount(promo, cart);
        if (discount > 0) {
          applicable.push({
            ...promo,
            discount,
          });
        }
      }
    }

    return applicable;
  }
}

export const promotionsService = new PromotionsService();
export default promotionsService;

