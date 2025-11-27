/**
 * Servicio de Precios Dinámicos
 * Happy Hour, promociones por horario, precios especiales
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class PricingService {
  /**
   * Obtener precio actual de un producto
   * Considera happy hour, promociones y nivel del usuario
   */
  async getCurrentPrice(productId, storeId, options = {}) {
    const { userId = null, quantity = 1 } = options;
    
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error('Producto no encontrado');
    }

    let finalPrice = Number(product.price);
    const discounts = [];
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Domingo

    // 1. Verificar Happy Hour
    const happyHour = await this.getActiveHappyHour(storeId, currentHour, currentDay);
    if (happyHour) {
      const discount = finalPrice * (happyHour.discountPercent / 100);
      finalPrice -= discount;
      discounts.push({
        type: 'happy_hour',
        name: happyHour.name,
        discount,
        percent: happyHour.discountPercent,
      });
    }

    // 2. Verificar promociones activas del producto
    const promos = await this.getActiveProductPromos(productId, storeId);
    for (const promo of promos) {
      if (promo.type === 'percentage') {
        const discount = finalPrice * (promo.value / 100);
        finalPrice -= discount;
        discounts.push({
          type: 'promo',
          name: promo.name,
          discount,
          percent: promo.value,
        });
      } else if (promo.type === 'fixed') {
        finalPrice -= promo.value;
        discounts.push({
          type: 'promo',
          name: promo.name,
          discount: promo.value,
        });
      }
    }

    // 3. Descuento por cantidad (2x1, 3x2, etc)
    const quantityDiscount = await this.getQuantityDiscount(productId, quantity);
    if (quantityDiscount) {
      const discount = finalPrice * quantity * (quantityDiscount.discountPercent / 100);
      finalPrice -= discount / quantity; // Precio unitario con descuento
      discounts.push({
        type: 'quantity',
        name: quantityDiscount.name,
        discount: discount / quantity,
        percent: quantityDiscount.discountPercent,
      });
    }

    // 4. Descuento por nivel de usuario
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { level: true },
      });
      
      if (user) {
        const levelDiscount = this.getLevelDiscount(user.level);
        if (levelDiscount > 0) {
          const discount = finalPrice * (levelDiscount / 100);
          finalPrice -= discount;
          discounts.push({
            type: 'level',
            name: `Descuento ${user.level}`,
            discount,
            percent: levelDiscount,
          });
        }
      }
    }

    // Asegurar precio mínimo
    finalPrice = Math.max(0, finalPrice);

    return {
      originalPrice: Number(product.price),
      finalPrice: Math.round(finalPrice * 100) / 100,
      discounts,
      totalDiscount: Number(product.price) - finalPrice,
      hasDiscount: discounts.length > 0,
    };
  }

  /**
   * Obtener happy hour activo
   */
  async getActiveHappyHour(storeId, hour, day) {
    // Buscar en configuración de la tienda
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
    });

    if (!settings) return null;

    // Parsear configuración de happy hour (almacenada en JSON)
    // Formato: { enabled: true, schedule: [{ days: [1,2,3,4,5], startHour: 17, endHour: 20, discountPercent: 20, name: "Happy Hour" }] }
    try {
      const happyHourConfig = settings.hours ? JSON.parse(settings.hours) : null;
      
      if (!happyHourConfig?.happyHour?.enabled) return null;

      for (const schedule of happyHourConfig.happyHour.schedule || []) {
        if (
          schedule.days.includes(day) &&
          hour >= schedule.startHour &&
          hour < schedule.endHour
        ) {
          return {
            name: schedule.name || 'Happy Hour',
            discountPercent: schedule.discountPercent,
            startHour: schedule.startHour,
            endHour: schedule.endHour,
          };
        }
      }
    } catch (e) {
      logger.error({ error: e.message }, 'Error parsing happy hour config');
    }

    return null;
  }

  /**
   * Obtener promociones activas de un producto
   */
  async getActiveProductPromos(productId, storeId) {
    // TODO: Implementar tabla de promociones
    // Por ahora retornar vacío
    return [];
  }

  /**
   * Obtener descuento por cantidad
   */
  async getQuantityDiscount(productId, quantity) {
    // Reglas de descuento por cantidad
    // TODO: Hacer configurable por tienda/producto
    const rules = [
      { minQuantity: 3, discountPercent: 10, name: '3+ unidades: 10% OFF' },
      { minQuantity: 6, discountPercent: 15, name: '6+ unidades: 15% OFF' },
      { minQuantity: 12, discountPercent: 20, name: '12+ unidades: 20% OFF' },
    ];

    // Encontrar la mejor regla aplicable
    const applicableRules = rules.filter(r => quantity >= r.minQuantity);
    if (applicableRules.length === 0) return null;

    return applicableRules[applicableRules.length - 1]; // La de mayor descuento
  }

  /**
   * Obtener descuento por nivel de usuario
   */
  getLevelDiscount(level) {
    const discounts = {
      bronce: 0,
      plata: 5,
      oro: 10,
      platino: 15,
    };
    return discounts[level] || 0;
  }

  /**
   * Calcular precio total de un carrito
   */
  async calculateCartTotal(items, storeId, userId = null) {
    let subtotal = 0;
    let totalDiscount = 0;
    const itemsWithPricing = [];

    for (const item of items) {
      const pricing = await this.getCurrentPrice(item.productId, storeId, {
        userId,
        quantity: item.quantity,
      });

      const itemTotal = pricing.finalPrice * item.quantity;
      subtotal += pricing.originalPrice * item.quantity;
      totalDiscount += pricing.totalDiscount * item.quantity;

      itemsWithPricing.push({
        ...item,
        originalPrice: pricing.originalPrice,
        finalPrice: pricing.finalPrice,
        itemTotal,
        discounts: pricing.discounts,
      });
    }

    return {
      items: itemsWithPricing,
      subtotal,
      totalDiscount,
      total: subtotal - totalDiscount,
    };
  }

  /**
   * Verificar si hay happy hour activo
   */
  async isHappyHourActive(storeId) {
    const now = new Date();
    const happyHour = await this.getActiveHappyHour(
      storeId,
      now.getHours(),
      now.getDay()
    );
    return happyHour !== null;
  }

  /**
   * Obtener próximo happy hour
   */
  async getNextHappyHour(storeId) {
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
    });

    if (!settings?.hours) return null;

    try {
      const config = JSON.parse(settings.hours);
      if (!config?.happyHour?.enabled) return null;

      const now = new Date();
      const currentDay = now.getDay();
      const currentHour = now.getHours();

      // Buscar próximo happy hour
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const checkDay = (currentDay + dayOffset) % 7;
        
        for (const schedule of config.happyHour.schedule || []) {
          if (schedule.days.includes(checkDay)) {
            const startHour = schedule.startHour;
            
            // Si es hoy, verificar que no haya pasado
            if (dayOffset === 0 && currentHour >= startHour) continue;
            
            const nextDate = new Date(now);
            nextDate.setDate(now.getDate() + dayOffset);
            nextDate.setHours(startHour, 0, 0, 0);
            
            return {
              date: nextDate,
              name: schedule.name,
              discountPercent: schedule.discountPercent,
              duration: schedule.endHour - schedule.startHour,
            };
          }
        }
      }
    } catch (e) {
      logger.error({ error: e.message }, 'Error getting next happy hour');
    }

    return null;
  }
}

export const pricingService = new PricingService();
export default pricingService;

