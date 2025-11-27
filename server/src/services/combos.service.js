/**
 * Sistema de Combos y Menús
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class CombosService {
  /**
   * Crear combo
   */
  async createCombo(storeId, comboData) {
    const {
      name, description, image, items, price, discountType,
      discountValue, isActive, availableFrom, availableTo,
      maxDaily, categoryId,
    } = comboData;

    // Calcular precio original
    let originalPrice = 0;
    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (product) {
        originalPrice += product.price * item.quantity;
      }
    }

    // Calcular precio final
    let finalPrice = price;
    if (!price && discountType) {
      if (discountType === 'percentage') {
        finalPrice = Math.round(originalPrice * (1 - discountValue / 100));
      } else if (discountType === 'fixed') {
        finalPrice = originalPrice - discountValue;
      }
    }

    const combo = await prisma.combo.create({
      data: {
        storeId,
        name,
        description,
        image,
        originalPrice,
        finalPrice,
        discountType,
        discountValue,
        items: JSON.stringify(items),
        isActive: isActive ?? true,
        availableFrom: availableFrom ? new Date(availableFrom) : null,
        availableTo: availableTo ? new Date(availableTo) : null,
        maxDaily,
        categoryId,
      },
    });

    logger.info({ comboId: combo.id, name }, 'Combo created');
    return combo;
  }

  /**
   * Obtener combos activos
   */
  async getActiveCombos(storeId) {
    const now = new Date();

    const combos = await prisma.combo.findMany({
      where: {
        storeId,
        isActive: true,
        OR: [
          { availableFrom: null, availableTo: null },
          { availableFrom: { lte: now }, availableTo: { gte: now } },
        ],
      },
      include: { category: true },
    });

    // Verificar disponibilidad diaria
    const today = new Date().toISOString().split('T')[0];

    const availableCombos = [];

    for (const combo of combos) {
      if (combo.maxDaily) {
        const soldToday = await prisma.orderItem.count({
          where: {
            comboId: combo.id,
            order: {
              createdAt: { gte: new Date(today) },
              status: { not: 'cancelled' },
            },
          },
        });

        if (soldToday >= combo.maxDaily) continue;
      }

      availableCombos.push({
        ...combo,
        items: JSON.parse(combo.items),
        savings: combo.originalPrice - combo.finalPrice,
        savingsPercent: Math.round((1 - combo.finalPrice / combo.originalPrice) * 100),
      });
    }

    return availableCombos;
  }

  /**
   * Obtener detalle de combo con productos
   */
  async getComboDetail(comboId) {
    const combo = await prisma.combo.findUnique({
      where: { id: comboId },
      include: { category: true },
    });

    if (!combo) throw new Error('Combo no encontrado');

    const items = JSON.parse(combo.items);
    const itemsWithProducts = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { options: true },
      });

      if (product) {
        itemsWithProducts.push({
          ...item,
          product: {
            id: product.id,
            name: product.name,
            image: product.image,
            price: product.price,
            options: item.allowOptions ? product.options : [],
          },
        });
      }
    }

    return {
      ...combo,
      items: itemsWithProducts,
      savings: combo.originalPrice - combo.finalPrice,
    };
  }

  /**
   * Validar combo al agregar al carrito
   */
  async validateCombo(comboId, selectedOptions = {}) {
    const combo = await this.getComboDetail(comboId);

    // Verificar que todas las opciones requeridas estén seleccionadas
    const errors = [];

    for (const item of combo.items) {
      if (item.requiresSelection && !selectedOptions[item.productId]) {
        errors.push(`Selecciona una opción para ${item.product.name}`);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Calcular precio con opciones adicionales
    let extraPrice = 0;
    for (const [productId, optionIds] of Object.entries(selectedOptions)) {
      for (const optionId of optionIds) {
        const option = await prisma.productOption.findUnique({ where: { id: optionId } });
        if (option?.extraPrice) {
          extraPrice += option.extraPrice;
        }
      }
    }

    return {
      valid: true,
      finalPrice: combo.finalPrice + extraPrice,
      extraPrice,
    };
  }

  /**
   * Crear menú del día
   */
  async createDailyMenu(storeId, menuData) {
    const {
      name, description, date, items, price,
      includesDrink, includesDessert, maxOrders,
    } = menuData;

    return prisma.dailyMenu.create({
      data: {
        storeId,
        name,
        description,
        date: new Date(date),
        items: JSON.stringify(items),
        price,
        includesDrink,
        includesDessert,
        maxOrders,
        isActive: true,
      },
    });
  }

  /**
   * Obtener menú del día
   */
  async getTodaysMenu(storeId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const menu = await prisma.dailyMenu.findFirst({
      where: {
        storeId,
        date: today,
        isActive: true,
      },
    });

    if (!menu) return null;

    // Verificar disponibilidad
    if (menu.maxOrders) {
      const sold = await prisma.orderItem.count({
        where: {
          dailyMenuId: menu.id,
          order: { status: { not: 'cancelled' } },
        },
      });

      if (sold >= menu.maxOrders) {
        return { ...menu, soldOut: true };
      }
    }

    const items = JSON.parse(menu.items);
    const itemsWithProducts = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
      });
      if (product) {
        itemsWithProducts.push({ ...item, product });
      }
    }

    return {
      ...menu,
      items: itemsWithProducts,
      soldOut: false,
    };
  }

  /**
   * Sugerir combos basado en carrito
   */
  async suggestCombos(storeId, cartItems) {
    const combos = await this.getActiveCombos(storeId);
    const suggestions = [];

    for (const combo of combos) {
      const comboProductIds = combo.items.map(i => i.productId);
      const cartProductIds = cartItems.map(i => i.productId);

      // Verificar si algunos productos del carrito están en el combo
      const matchingProducts = comboProductIds.filter(id => cartProductIds.includes(id));

      if (matchingProducts.length > 0 && matchingProducts.length < comboProductIds.length) {
        // Calcular ahorro potencial
        const currentCartPrice = cartItems
          .filter(i => comboProductIds.includes(i.productId))
          .reduce((sum, i) => sum + i.price * i.quantity, 0);

        if (combo.finalPrice < currentCartPrice + 500) { // Si el combo no es mucho más caro
          suggestions.push({
            combo,
            matchingProducts: matchingProducts.length,
            potentialSavings: combo.savings,
            message: `Agregá ${comboProductIds.length - matchingProducts.length} productos más y ahorrá $${combo.savings}`,
          });
        }
      }
    }

    return suggestions.sort((a, b) => b.potentialSavings - a.potentialSavings).slice(0, 3);
  }

  /**
   * Estadísticas de combos
   */
  async getComboStats(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const combos = await prisma.combo.findMany({ where: { storeId } });
    const stats = [];

    for (const combo of combos) {
      const sales = await prisma.orderItem.aggregate({
        where: {
          comboId: combo.id,
          order: {
            createdAt: { gte: startDate },
            status: 'delivered',
          },
        },
        _count: true,
        _sum: { subtotal: true },
      });

      stats.push({
        comboId: combo.id,
        name: combo.name,
        unitsSold: sales._count,
        revenue: sales._sum.subtotal || 0,
        avgPerDay: Math.round(sales._count / days * 10) / 10,
      });
    }

    return stats.sort((a, b) => b.unitsSold - a.unitsSold);
  }

  /**
   * Actualizar combo
   */
  async updateCombo(comboId, updates) {
    if (updates.items) {
      updates.items = JSON.stringify(updates.items);
    }

    return prisma.combo.update({
      where: { id: comboId },
      data: updates,
    });
  }

  /**
   * Eliminar combo
   */
  async deleteCombo(comboId) {
    await prisma.combo.update({
      where: { id: comboId },
      data: { isActive: false },
    });
    return { success: true };
  }
}

export const combosService = new CombosService();
export default combosService;

