/**
 * Sistema Avanzado de Cupones
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

class CouponsService {
  DISCOUNT_TYPES = {
    PERCENTAGE: 'percentage',
    FIXED: 'fixed',
    FREE_DELIVERY: 'free_delivery',
    FREE_PRODUCT: 'free_product',
    BUY_X_GET_Y: 'buy_x_get_y',
  };

  /**
   * Crear cupón
   */
  async createCoupon(storeId, couponData) {
    const {
      code, name, description, discountType, discountValue,
      minOrder, maxDiscount, usageLimit, usageLimitPerUser,
      startDate, endDate, applicableProducts, applicableCategories,
      firstOrderOnly, newCustomersOnly, specificCustomers,
    } = couponData;

    const coupon = await prisma.coupon.create({
      data: {
        storeId,
        code: code?.toUpperCase() || this.generateCode(),
        name,
        description,
        discountType,
        discountValue,
        minOrder: minOrder || 0,
        maxDiscount,
        usageLimit,
        usageLimitPerUser: usageLimitPerUser || 1,
        usageCount: 0,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        applicableProducts: applicableProducts || [],
        applicableCategories: applicableCategories || [],
        conditions: JSON.stringify({
          firstOrderOnly,
          newCustomersOnly,
          specificCustomers,
        }),
        isActive: true,
      },
    });

    logger.info({ couponId: coupon.id, code: coupon.code }, 'Coupon created');
    return coupon;
  }

  generateCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Validar cupón
   */
  async validateCoupon(code, customerId, cartItems, orderTotal) {
    const coupon = await prisma.coupon.findFirst({
      where: { code: code.toUpperCase(), isActive: true },
    });

    if (!coupon) {
      return { valid: false, error: 'Cupón no encontrado' };
    }

    // Verificar fechas
    const now = new Date();
    if (coupon.startDate && coupon.startDate > now) {
      return { valid: false, error: 'Cupón aún no está activo' };
    }
    if (coupon.endDate && coupon.endDate < now) {
      return { valid: false, error: 'Cupón expirado' };
    }

    // Verificar límite de uso global
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return { valid: false, error: 'Cupón agotado' };
    }

    // Verificar límite por usuario
    if (customerId && coupon.usageLimitPerUser) {
      const userUsage = await prisma.couponUsage.count({
        where: { couponId: coupon.id, customerId },
      });

      if (userUsage >= coupon.usageLimitPerUser) {
        return { valid: false, error: 'Ya usaste este cupón' };
      }
    }

    // Verificar condiciones especiales
    const conditions = JSON.parse(coupon.conditions || '{}');

    if (conditions.firstOrderOnly && customerId) {
      const previousOrders = await prisma.order.count({
        where: { customerId, status: 'delivered' },
      });

      if (previousOrders > 0) {
        return { valid: false, error: 'Solo válido para primer pedido' };
      }
    }

    if (conditions.newCustomersOnly && customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      const daysSinceCreation = (now - customer.createdAt) / (1000 * 60 * 60 * 24);

      if (daysSinceCreation > 30) {
        return { valid: false, error: 'Solo válido para nuevos clientes' };
      }
    }

    if (conditions.specificCustomers?.length > 0 && customerId) {
      if (!conditions.specificCustomers.includes(customerId)) {
        return { valid: false, error: 'Cupón no válido para tu cuenta' };
      }
    }

    // Verificar monto mínimo
    if (coupon.minOrder && orderTotal < coupon.minOrder) {
      return {
        valid: false,
        error: `Monto mínimo: $${coupon.minOrder}`,
        minOrder: coupon.minOrder,
      };
    }

    // Verificar productos/categorías aplicables
    if (coupon.applicableProducts?.length > 0 || coupon.applicableCategories?.length > 0) {
      const applicableItems = cartItems.filter(item => {
        if (coupon.applicableProducts?.includes(item.productId)) return true;
        if (coupon.applicableCategories?.includes(item.categoryId)) return true;
        return false;
      });

      if (applicableItems.length === 0) {
        return { valid: false, error: 'Cupón no aplica a estos productos' };
      }
    }

    // Calcular descuento
    const discount = this.calculateDiscount(coupon, cartItems, orderTotal);

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        discountType: coupon.discountType,
      },
      discount,
    };
  }

  calculateDiscount(coupon, cartItems, orderTotal) {
    let discount = 0;
    let applicableTotal = orderTotal;

    // Si hay productos específicos, calcular solo sobre esos
    if (coupon.applicableProducts?.length > 0 || coupon.applicableCategories?.length > 0) {
      applicableTotal = cartItems
        .filter(item =>
          coupon.applicableProducts?.includes(item.productId) ||
          coupon.applicableCategories?.includes(item.categoryId)
        )
        .reduce((sum, item) => sum + item.subtotal, 0);
    }

    switch (coupon.discountType) {
      case this.DISCOUNT_TYPES.PERCENTAGE:
        discount = Math.round(applicableTotal * (coupon.discountValue / 100));
        break;

      case this.DISCOUNT_TYPES.FIXED:
        discount = coupon.discountValue;
        break;

      case this.DISCOUNT_TYPES.FREE_DELIVERY:
        discount = 0; // Se maneja aparte
        break;

      case this.DISCOUNT_TYPES.FREE_PRODUCT:
        // discountValue es el productId gratis
        const freeProduct = cartItems.find(i => i.productId === coupon.discountValue);
        if (freeProduct) discount = freeProduct.unitPrice;
        break;
    }

    // Aplicar máximo descuento
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }

    return discount;
  }

  /**
   * Aplicar cupón a orden
   */
  async applyCoupon(couponId, orderId, customerId, discountAmount) {
    await prisma.$transaction([
      prisma.couponUsage.create({
        data: { couponId, orderId, customerId, discountAmount },
      }),
      prisma.coupon.update({
        where: { id: couponId },
        data: { usageCount: { increment: 1 } },
      }),
    ]);

    logger.info({ couponId, orderId, discountAmount }, 'Coupon applied');
    return { success: true };
  }

  /**
   * Generar cupón único para cliente
   */
  async generatePersonalCoupon(customerId, storeId, config) {
    const { discountType, discountValue, validDays, reason } = config;

    const code = `${reason?.slice(0, 3).toUpperCase() || 'PER'}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const coupon = await prisma.coupon.create({
      data: {
        storeId,
        code,
        name: `Cupón personal`,
        discountType,
        discountValue,
        usageLimit: 1,
        usageLimitPerUser: 1,
        endDate: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000),
        conditions: JSON.stringify({ specificCustomers: [customerId] }),
        isActive: true,
      },
    });

    return coupon;
  }

  /**
   * Cupones activos del cliente
   */
  async getCustomerCoupons(customerId, storeId) {
    const now = new Date();

    // Cupones generales activos
    const generalCoupons = await prisma.coupon.findMany({
      where: {
        storeId,
        isActive: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
        conditions: { not: { contains: 'specificCustomers' } },
      },
    });

    // Cupones específicos del cliente
    const personalCoupons = await prisma.coupon.findMany({
      where: {
        storeId,
        isActive: true,
        conditions: { contains: customerId },
      },
    });

    // Filtrar los ya usados
    const usedCoupons = await prisma.couponUsage.findMany({
      where: { customerId },
      select: { couponId: true },
    });
    const usedIds = new Set(usedCoupons.map(u => u.couponId));

    const allCoupons = [...generalCoupons, ...personalCoupons]
      .filter(c => {
        if (usedIds.has(c.id) && c.usageLimitPerUser === 1) return false;
        if (c.usageLimit && c.usageCount >= c.usageLimit) return false;
        return true;
      });

    return allCoupons.map(c => ({
      code: c.code,
      name: c.name,
      description: c.description,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrder: c.minOrder,
      endDate: c.endDate,
    }));
  }

  /**
   * Estadísticas de cupón
   */
  async getCouponStats(couponId) {
    const [coupon, usages, revenue] = await Promise.all([
      prisma.coupon.findUnique({ where: { id: couponId } }),
      prisma.couponUsage.findMany({
        where: { couponId },
        include: { order: { select: { total: true } } },
      }),
      prisma.couponUsage.aggregate({
        where: { couponId },
        _sum: { discountAmount: true },
      }),
    ]);

    const totalOrders = usages.length;
    const totalRevenue = usages.reduce((sum, u) => sum + (u.order?.total || 0), 0);
    const totalDiscount = revenue._sum.discountAmount || 0;

    return {
      coupon: { code: coupon.code, name: coupon.name },
      usageCount: totalOrders,
      usageLimit: coupon.usageLimit,
      totalDiscount,
      totalRevenue,
      avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      roi: totalDiscount > 0 ? Math.round((totalRevenue / totalDiscount) * 100) / 100 : 0,
    };
  }

  /**
   * Listar cupones de tienda
   */
  async getStoreCoupons(storeId, includeExpired = false) {
    const where = { storeId };

    if (!includeExpired) {
      where.OR = [
        { endDate: null },
        { endDate: { gte: new Date() } },
      ];
    }

    return prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Desactivar cupón
   */
  async deactivateCoupon(couponId) {
    await prisma.coupon.update({
      where: { id: couponId },
      data: { isActive: false },
    });

    return { success: true };
  }

  /**
   * Cupones por expirar (para notificar)
   */
  async getExpiringCoupons(storeId, daysAhead = 3) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysAhead);

    return prisma.coupon.findMany({
      where: {
        storeId,
        isActive: true,
        endDate: { lte: threshold, gte: new Date() },
        usageCount: { lt: prisma.coupon.fields.usageLimit },
      },
    });
  }
}

export const couponsService = new CouponsService();
export default couponsService;

