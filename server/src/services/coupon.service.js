/**
 * Servicio de Cupones Dinámicos
 * Soporta restricciones por zona, horario, método de pago, nivel de usuario, etc.
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class CouponService {
  /**
   * Validar y aplicar cupón a un pedido
   */
  async validateCoupon(code, orderData, userId = null) {
    const { storeId, total, paymentMethod, zone, items } = orderData;

    // Buscar cupón
    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      return { valid: false, error: 'Cupón no encontrado' };
    }

    // Verificar si está activo
    if (!coupon.isActive) {
      return { valid: false, error: 'Cupón no está activo' };
    }

    // Verificar fechas de validez
    const now = new Date();
    if (coupon.validFrom && now < new Date(coupon.validFrom)) {
      return { valid: false, error: 'Cupón aún no está vigente' };
    }
    if (coupon.validUntil && now > new Date(coupon.validUntil)) {
      return { valid: false, error: 'Cupón expirado' };
    }

    // Verificar tienda
    if (coupon.storeId && coupon.storeId !== storeId) {
      return { valid: false, error: 'Cupón no válido para esta tienda' };
    }

    // Verificar uso global
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return { valid: false, error: 'Cupón agotado' };
    }

    // Verificar uso por usuario
    if (userId && coupon.userLimit) {
      const userUsage = await prisma.userCoupon.count({
        where: { couponId: coupon.id, userId },
      });
      if (userUsage >= coupon.userLimit) {
        return { valid: false, error: 'Ya usaste este cupón el máximo de veces permitido' };
      }
    }

    // Verificar monto mínimo
    if (coupon.minOrderAmount && total < coupon.minOrderAmount) {
      return { 
        valid: false, 
        error: `Monto mínimo requerido: $${coupon.minOrderAmount}` 
      };
    }

    // Verificar nivel de usuario requerido
    if (coupon.requiredLevel && userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { level: true },
      });
      
      const levelOrder = ['bronce', 'plata', 'oro', 'platino'];
      const userLevelIndex = levelOrder.indexOf(user?.level || 'bronce');
      const requiredLevelIndex = levelOrder.indexOf(coupon.requiredLevel);
      
      if (userLevelIndex < requiredLevelIndex) {
        return { 
          valid: false, 
          error: `Requiere nivel ${coupon.requiredLevel} o superior` 
        };
      }
    }

    // Verificar restricciones adicionales (JSON)
    const restrictions = this.parseRestrictions(coupon);

    // Verificar zona
    if (restrictions.zones?.length > 0 && zone) {
      if (!restrictions.zones.includes(zone)) {
        return { valid: false, error: 'Cupón no válido para tu zona' };
      }
    }

    // Verificar método de pago
    if (restrictions.paymentMethods?.length > 0 && paymentMethod) {
      if (!restrictions.paymentMethods.includes(paymentMethod)) {
        return { 
          valid: false, 
          error: `Cupón solo válido para: ${restrictions.paymentMethods.join(', ')}` 
        };
      }
    }

    // Verificar horario
    if (restrictions.validHours) {
      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinutes;
      
      const [startH, startM] = restrictions.validHours.from.split(':').map(Number);
      const [endH, endM] = restrictions.validHours.to.split(':').map(Number);
      const startTime = startH * 60 + startM;
      const endTime = endH * 60 + endM;
      
      // Manejar horarios que cruzan medianoche
      if (startTime <= endTime) {
        if (currentTime < startTime || currentTime > endTime) {
          return { 
            valid: false, 
            error: `Cupón válido solo de ${restrictions.validHours.from} a ${restrictions.validHours.to}` 
          };
        }
      } else {
        if (currentTime < startTime && currentTime > endTime) {
          return { 
            valid: false, 
            error: `Cupón válido solo de ${restrictions.validHours.from} a ${restrictions.validHours.to}` 
          };
        }
      }
    }

    // Verificar días de la semana
    if (restrictions.validDays?.length > 0) {
      const currentDay = now.getDay(); // 0 = Domingo
      if (!restrictions.validDays.includes(currentDay)) {
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const validDayNames = restrictions.validDays.map(d => dayNames[d]).join(', ');
        return { 
          valid: false, 
          error: `Cupón válido solo: ${validDayNames}` 
        };
      }
    }

    // Verificar categorías de productos
    if (restrictions.categoryIds?.length > 0 && items) {
      const hasValidProduct = items.some(item => 
        restrictions.categoryIds.includes(item.categoryId)
      );
      if (!hasValidProduct) {
        return { 
          valid: false, 
          error: 'Cupón no válido para los productos del carrito' 
        };
      }
    }

    // Calcular descuento
    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = total * (coupon.discountValue / 100);
      // Aplicar máximo si existe
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = coupon.discountValue;
    }

    // No puede ser mayor al total
    discount = Math.min(discount, total);

    logger.info({
      code,
      userId,
      storeId,
      discount,
    }, 'Coupon validated');

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      discount,
      newTotal: total - discount,
    };
  }

  /**
   * Aplicar cupón a un pedido (registrar uso)
   */
  async applyCoupon(couponId, userId, orderId) {
    // Incrementar contador de uso
    await prisma.coupon.update({
      where: { id: couponId },
      data: { usageCount: { increment: 1 } },
    });

    // Registrar uso del usuario
    if (userId) {
      await prisma.userCoupon.create({
        data: {
          userId,
          couponId,
          orderId,
        },
      });
    }

    logger.info({ couponId, userId, orderId }, 'Coupon applied');
  }

  /**
   * Crear cupón dinámico
   */
  async createCoupon(data) {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      usageLimit,
      userLimit,
      requiredLevel,
      storeId,
      validFrom,
      validUntil,
      restrictions, // { zones, paymentMethods, validHours, validDays, categoryIds }
    } = data;

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        description,
        discountType,
        discountValue,
        minOrderAmount,
        maxDiscount,
        usageLimit,
        userLimit: userLimit || 1,
        requiredLevel,
        storeId,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validUntil: validUntil ? new Date(validUntil) : null,
        // Guardar restricciones como JSON en description o campo adicional
        // Por simplicidad, las codificamos en el código
      },
    });

    logger.info({ couponId: coupon.id, code }, 'Coupon created');
    return coupon;
  }

  /**
   * Obtener cupones disponibles para un usuario
   */
  async getAvailableCoupons(userId, storeId) {
    const user = userId ? await prisma.user.findUnique({
      where: { id: userId },
      select: { level: true },
    }) : null;

    const now = new Date();

    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        OR: [
          { storeId: null },
          { storeId },
        ],
        OR: [
          { validUntil: null },
          { validUntil: { gte: now } },
        ],
        OR: [
          { usageLimit: null },
          { usageCount: { lt: prisma.coupon.fields.usageLimit } },
        ],
      },
    });

    // Filtrar por nivel de usuario
    const levelOrder = ['bronce', 'plata', 'oro', 'platino'];
    const userLevelIndex = levelOrder.indexOf(user?.level || 'bronce');

    return coupons.filter(coupon => {
      if (!coupon.requiredLevel) return true;
      const requiredIndex = levelOrder.indexOf(coupon.requiredLevel);
      return userLevelIndex >= requiredIndex;
    });
  }

  /**
   * Parsear restricciones del cupón
   */
  parseRestrictions(coupon) {
    // Por ahora las restricciones podrían estar en description como JSON
    // En producción, usar un campo JSON dedicado
    try {
      if (coupon.description?.startsWith('{')) {
        return JSON.parse(coupon.description);
      }
    } catch (e) {
      // No es JSON
    }
    return {};
  }
}

export const couponService = new CouponService();
export default couponService;

