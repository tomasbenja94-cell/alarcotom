/**
 * Sistema de Happy Hour Automático
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class HappyHourService {
  /**
   * Crear configuración de happy hour
   */
  async createHappyHour(storeId, config) {
    const { 
      name, 
      startTime, 
      endTime, 
      daysOfWeek, // [0-6] donde 0=domingo
      discountType, // 'percentage', 'fixed', 'bogo'
      discountValue,
      categories, // IDs de categorías que aplican
      products, // IDs de productos específicos (opcional)
      minOrder,
      maxDiscount,
      startDate,
      endDate,
    } = config;

    const happyHour = await prisma.happyHour.create({
      data: {
        storeId,
        name,
        startTime,
        endTime,
        daysOfWeek: JSON.stringify(daysOfWeek),
        discountType,
        discountValue,
        categories: categories ? JSON.stringify(categories) : null,
        products: products ? JSON.stringify(products) : null,
        minOrder: minOrder || 0,
        maxDiscount,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isActive: true,
      },
    });

    logger.info({ happyHourId: happyHour.id, name }, 'Happy hour created');
    return happyHour;
  }

  /**
   * Verificar si hay happy hour activo
   */
  async getActiveHappyHour(storeId) {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const happyHours = await prisma.happyHour.findMany({
      where: {
        storeId,
        isActive: true,
        OR: [
          { startDate: null },
          { startDate: { lte: now } },
        ],
      },
    });

    for (const hh of happyHours) {
      // Verificar fecha de fin
      if (hh.endDate && hh.endDate < now) continue;

      // Verificar día de la semana
      const days = JSON.parse(hh.daysOfWeek);
      if (!days.includes(currentDay)) continue;

      // Verificar horario
      if (currentTime >= hh.startTime && currentTime <= hh.endTime) {
        return {
          ...hh,
          categories: hh.categories ? JSON.parse(hh.categories) : null,
          products: hh.products ? JSON.parse(hh.products) : null,
          daysOfWeek: days,
          timeRemaining: this.calculateTimeRemaining(hh.endTime),
        };
      }
    }

    return null;
  }

  calculateTimeRemaining(endTime) {
    const [endHour, endMin] = endTime.split(':').map(Number);
    const now = new Date();
    const end = new Date();
    end.setHours(endHour, endMin, 0, 0);
    
    const diff = end - now;
    if (diff <= 0) return 0;
    
    return Math.floor(diff / 60000); // minutos
  }

  /**
   * Calcular descuento de happy hour
   */
  async calculateDiscount(storeId, items) {
    const happyHour = await this.getActiveHappyHour(storeId);
    
    if (!happyHour) return { discount: 0, appliedTo: [] };

    let totalDiscount = 0;
    const appliedTo = [];

    for (const item of items) {
      // Verificar si el producto aplica
      const applies = await this.productApplies(happyHour, item.productId);
      if (!applies) continue;

      let itemDiscount = 0;

      switch (happyHour.discountType) {
        case 'percentage':
          itemDiscount = (item.price * item.quantity * happyHour.discountValue) / 100;
          break;
        case 'fixed':
          itemDiscount = happyHour.discountValue * item.quantity;
          break;
        case 'bogo': // Buy One Get One
          const freeItems = Math.floor(item.quantity / 2);
          itemDiscount = item.price * freeItems;
          break;
      }

      if (itemDiscount > 0) {
        totalDiscount += itemDiscount;
        appliedTo.push({
          productId: item.productId,
          productName: item.name,
          originalPrice: item.price * item.quantity,
          discount: itemDiscount,
        });
      }
    }

    // Aplicar máximo descuento si existe
    if (happyHour.maxDiscount && totalDiscount > happyHour.maxDiscount) {
      totalDiscount = happyHour.maxDiscount;
    }

    return {
      happyHourId: happyHour.id,
      happyHourName: happyHour.name,
      discountType: happyHour.discountType,
      discountValue: happyHour.discountValue,
      discount: Math.round(totalDiscount),
      appliedTo,
      timeRemaining: happyHour.timeRemaining,
    };
  }

  /**
   * Verificar si producto aplica a happy hour
   */
  async productApplies(happyHour, productId) {
    // Si hay productos específicos, verificar
    if (happyHour.products) {
      return happyHour.products.includes(productId);
    }

    // Si hay categorías, verificar
    if (happyHour.categories) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { categoryId: true },
      });
      return happyHour.categories.includes(product?.categoryId);
    }

    // Si no hay restricciones, aplica a todo
    return true;
  }

  /**
   * Obtener próximo happy hour
   */
  async getNextHappyHour(storeId) {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const happyHours = await prisma.happyHour.findMany({
      where: { storeId, isActive: true },
    });

    let nextHH = null;
    let minDiff = Infinity;

    for (const hh of happyHours) {
      const days = JSON.parse(hh.daysOfWeek);
      
      for (let i = 0; i < 7; i++) {
        const checkDay = (currentDay + i) % 7;
        if (!days.includes(checkDay)) continue;

        // Si es hoy, verificar que no haya pasado
        if (i === 0 && hh.startTime <= currentTime) continue;

        const diff = i * 24 * 60 + this.timeToMinutes(hh.startTime) - 
                    (i === 0 ? this.timeToMinutes(currentTime) : 0);

        if (diff < minDiff) {
          minDiff = diff;
          nextHH = {
            ...hh,
            startsIn: diff,
            startsAt: this.calculateStartDate(checkDay, hh.startTime),
          };
        }
        break;
      }
    }

    return nextHH;
  }

  timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  calculateStartDate(dayOfWeek, time) {
    const now = new Date();
    const currentDay = now.getDay();
    const daysUntil = (dayOfWeek - currentDay + 7) % 7;
    
    const date = new Date();
    date.setDate(date.getDate() + daysUntil);
    const [h, m] = time.split(':').map(Number);
    date.setHours(h, m, 0, 0);
    
    return date;
  }

  /**
   * Estadísticas de happy hour
   */
  async getHappyHourStats(storeId, happyHourId) {
    // Obtener pedidos con descuento de este happy hour
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        happyHourId,
        status: 'delivered',
      },
    });

    return {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
      totalDiscount: orders.reduce((sum, o) => sum + (o.happyHourDiscount || 0), 0),
      avgTicket: orders.length > 0 
        ? Math.round(orders.reduce((sum, o) => sum + o.total, 0) / orders.length)
        : 0,
    };
  }
}

export const happyHourService = new HappyHourService();
export default happyHourService;

