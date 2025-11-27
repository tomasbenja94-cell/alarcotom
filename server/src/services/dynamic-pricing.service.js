/**
 * Sistema de Precios Dinámicos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DynamicPricingService {
  /**
   * Configurar regla de precio dinámico
   */
  async createPricingRule(storeId, rule) {
    const {
      name, type, productIds, categoryIds,
      adjustment, adjustmentType, conditions, schedule, priority,
    } = rule;

    return prisma.pricingRule.create({
      data: {
        storeId,
        name,
        type, // 'time_based', 'demand_based', 'inventory_based', 'weather_based', 'event_based'
        productIds: productIds || [],
        categoryIds: categoryIds || [],
        adjustment, // Valor del ajuste
        adjustmentType, // 'percentage', 'fixed'
        conditions: JSON.stringify(conditions || {}),
        schedule: schedule ? JSON.stringify(schedule) : null,
        priority: priority || 0,
        isActive: true,
      },
    });
  }

  /**
   * Calcular precio actual de producto
   */
  async calculateCurrentPrice(productId, context = {}) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });

    if (!product) throw new Error('Producto no encontrado');

    const basePrice = product.price;
    let finalPrice = basePrice;
    const appliedRules = [];

    // Obtener reglas activas
    const rules = await prisma.pricingRule.findMany({
      where: {
        storeId: product.storeId,
        isActive: true,
        OR: [
          { productIds: { has: productId } },
          { categoryIds: { has: product.categoryId } },
          { productIds: { isEmpty: true }, categoryIds: { isEmpty: true } }, // Reglas globales
        ],
      },
      orderBy: { priority: 'desc' },
    });

    for (const rule of rules) {
      const conditions = JSON.parse(rule.conditions || '{}');
      const schedule = rule.schedule ? JSON.parse(rule.schedule) : null;

      if (!this.evaluateConditions(rule.type, conditions, schedule, context)) {
        continue;
      }

      const adjustment = rule.adjustmentType === 'percentage'
        ? finalPrice * (rule.adjustment / 100)
        : rule.adjustment;

      finalPrice += adjustment;
      appliedRules.push({
        name: rule.name,
        type: rule.type,
        adjustment,
      });
    }

    // Guardar historial
    if (finalPrice !== basePrice) {
      await this.recordPriceChange(productId, basePrice, finalPrice, appliedRules);
    }

    return {
      productId,
      basePrice,
      finalPrice: Math.max(0, Math.round(finalPrice)),
      discount: basePrice > finalPrice ? basePrice - finalPrice : 0,
      surcharge: finalPrice > basePrice ? finalPrice - basePrice : 0,
      appliedRules,
    };
  }

  evaluateConditions(type, conditions, schedule, context) {
    const now = new Date();

    switch (type) {
      case 'time_based': {
        if (!schedule) return false;
        const currentHour = now.getHours();
        const currentDay = now.getDay();

        if (schedule.days && !schedule.days.includes(currentDay)) return false;
        if (schedule.startHour && currentHour < schedule.startHour) return false;
        if (schedule.endHour && currentHour >= schedule.endHour) return false;
        return true;
      }

      case 'demand_based': {
        const { minOrders, maxOrders, timeWindowMinutes } = conditions;
        // Requiere contexto de órdenes recientes
        const recentOrders = context.recentOrderCount || 0;
        if (minOrders && recentOrders < minOrders) return false;
        if (maxOrders && recentOrders > maxOrders) return false;
        return true;
      }

      case 'inventory_based': {
        const { minStock, maxStock } = conditions;
        const currentStock = context.stock || 0;
        if (minStock && currentStock > minStock) return false;
        if (maxStock && currentStock < maxStock) return false;
        return true;
      }

      case 'weather_based': {
        const { weatherConditions } = conditions;
        if (!context.weather) return false;
        return weatherConditions?.includes(context.weather);
      }

      case 'event_based': {
        const { events } = conditions;
        if (!context.activeEvents) return false;
        return events?.some(e => context.activeEvents.includes(e));
      }

      default:
        return true;
    }
  }

  /**
   * Registrar cambio de precio
   */
  async recordPriceChange(productId, oldPrice, newPrice, rules) {
    await prisma.priceHistory.create({
      data: {
        productId,
        oldPrice,
        newPrice,
        changePercent: ((newPrice - oldPrice) / oldPrice) * 100,
        appliedRules: JSON.stringify(rules),
        recordedAt: new Date(),
      },
    });
  }

  /**
   * Obtener historial de precios
   */
  async getPriceHistory(productId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return prisma.priceHistory.findMany({
      where: { productId, recordedAt: { gte: startDate } },
      orderBy: { recordedAt: 'desc' },
    });
  }

  /**
   * Precios happy hour
   */
  async setupHappyHour(storeId, config) {
    const { name, startHour, endHour, days, discountPercent, productIds, categoryIds } = config;

    return this.createPricingRule(storeId, {
      name: name || 'Happy Hour',
      type: 'time_based',
      productIds,
      categoryIds,
      adjustment: -discountPercent,
      adjustmentType: 'percentage',
      schedule: { startHour, endHour, days },
      priority: 10,
    });
  }

  /**
   * Surge pricing (alta demanda)
   */
  async setupSurgePricing(storeId, config) {
    const { minOrders, surchargePercent, timeWindowMinutes } = config;

    return this.createPricingRule(storeId, {
      name: 'Alta Demanda',
      type: 'demand_based',
      adjustment: surchargePercent,
      adjustmentType: 'percentage',
      conditions: { minOrders, timeWindowMinutes: timeWindowMinutes || 30 },
      priority: 5,
    });
  }

  /**
   * Precio por bajo stock
   */
  async setupLowStockPricing(storeId, config) {
    const { maxStock, surchargePercent } = config;

    return this.createPricingRule(storeId, {
      name: 'Últimas Unidades',
      type: 'inventory_based',
      adjustment: surchargePercent,
      adjustmentType: 'percentage',
      conditions: { maxStock },
      priority: 8,
    });
  }

  /**
   * Obtener todos los precios actuales
   */
  async getCurrentPrices(storeId, context = {}) {
    const products = await prisma.product.findMany({
      where: { storeId, isAvailable: true },
    });

    const prices = await Promise.all(
      products.map(p => this.calculateCurrentPrice(p.id, context))
    );

    return prices;
  }

  /**
   * Análisis de elasticidad de precios
   */
  async analyzePriceElasticity(productId, days = 90) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [priceHistory, orderItems] = await Promise.all([
      prisma.priceHistory.findMany({
        where: { productId, recordedAt: { gte: startDate } },
      }),
      prisma.orderItem.findMany({
        where: {
          productId,
          order: { createdAt: { gte: startDate }, status: 'delivered' },
        },
        include: { order: { select: { createdAt: true } } },
      }),
    ]);

    // Agrupar por rangos de precio
    const priceRanges = {};
    orderItems.forEach(item => {
      const priceAtTime = this.findPriceAtTime(priceHistory, item.order.createdAt, item.unitPrice);
      const range = Math.floor(priceAtTime / 100) * 100;

      if (!priceRanges[range]) priceRanges[range] = { quantity: 0, revenue: 0 };
      priceRanges[range].quantity += item.quantity;
      priceRanges[range].revenue += item.subtotal;
    });

    return {
      productId,
      period: `${days} días`,
      priceRanges: Object.entries(priceRanges).map(([range, data]) => ({
        priceRange: `$${range}-$${parseInt(range) + 99}`,
        unitsSold: data.quantity,
        revenue: data.revenue,
      })).sort((a, b) => parseInt(a.priceRange.slice(1)) - parseInt(b.priceRange.slice(1))),
    };
  }

  findPriceAtTime(history, date, fallback) {
    const record = history.find(h => h.recordedAt <= date);
    return record?.newPrice || fallback;
  }

  /**
   * Desactivar regla
   */
  async deactivateRule(ruleId) {
    return prisma.pricingRule.update({
      where: { id: ruleId },
      data: { isActive: false },
    });
  }

  /**
   * Listar reglas activas
   */
  async getActiveRules(storeId) {
    return prisma.pricingRule.findMany({
      where: { storeId, isActive: true },
      orderBy: { priority: 'desc' },
    });
  }
}

export const dynamicPricingService = new DynamicPricingService();
export default dynamicPricingService;

