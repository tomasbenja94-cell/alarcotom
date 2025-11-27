/**
 * Sistema de Información Nutricional
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class NutritionService {
  /**
   * Establecer info nutricional de producto
   */
  async setProductNutrition(productId, nutritionData) {
    const {
      servingSize,
      servingUnit,
      calories,
      totalFat,
      saturatedFat,
      transFat,
      cholesterol,
      sodium,
      totalCarbs,
      fiber,
      sugars,
      protein,
      vitaminA,
      vitaminC,
      calcium,
      iron,
    } = nutritionData;

    const nutrition = await prisma.productNutrition.upsert({
      where: { productId },
      update: {
        servingSize,
        servingUnit,
        calories,
        totalFat,
        saturatedFat,
        transFat,
        cholesterol,
        sodium,
        totalCarbs,
        fiber,
        sugars,
        protein,
        vitaminA,
        vitaminC,
        calcium,
        iron,
      },
      create: {
        productId,
        servingSize,
        servingUnit,
        calories,
        totalFat,
        saturatedFat,
        transFat,
        cholesterol,
        sodium,
        totalCarbs,
        fiber,
        sugars,
        protein,
        vitaminA,
        vitaminC,
        calcium,
        iron,
      },
    });

    return nutrition;
  }

  /**
   * Obtener info nutricional de producto
   */
  async getProductNutrition(productId) {
    return prisma.productNutrition.findUnique({
      where: { productId },
    });
  }

  /**
   * Calcular nutrición del carrito
   */
  async calculateCartNutrition(items) {
    const totals = {
      calories: 0,
      totalFat: 0,
      saturatedFat: 0,
      cholesterol: 0,
      sodium: 0,
      totalCarbs: 0,
      fiber: 0,
      sugars: 0,
      protein: 0,
    };

    const breakdown = [];

    for (const item of items) {
      const nutrition = await this.getProductNutrition(item.productId);
      
      if (nutrition) {
        const multiplier = item.quantity;
        
        breakdown.push({
          productId: item.productId,
          productName: item.name,
          quantity: item.quantity,
          calories: nutrition.calories * multiplier,
          protein: nutrition.protein * multiplier,
          carbs: nutrition.totalCarbs * multiplier,
          fat: nutrition.totalFat * multiplier,
        });

        totals.calories += nutrition.calories * multiplier;
        totals.totalFat += (nutrition.totalFat || 0) * multiplier;
        totals.saturatedFat += (nutrition.saturatedFat || 0) * multiplier;
        totals.cholesterol += (nutrition.cholesterol || 0) * multiplier;
        totals.sodium += (nutrition.sodium || 0) * multiplier;
        totals.totalCarbs += (nutrition.totalCarbs || 0) * multiplier;
        totals.fiber += (nutrition.fiber || 0) * multiplier;
        totals.sugars += (nutrition.sugars || 0) * multiplier;
        totals.protein += (nutrition.protein || 0) * multiplier;
      }
    }

    // Calcular % de valores diarios (basado en 2000 cal)
    const dailyValues = {
      calories: { value: totals.calories, percent: Math.round((totals.calories / 2000) * 100) },
      totalFat: { value: totals.totalFat, percent: Math.round((totals.totalFat / 65) * 100) },
      saturatedFat: { value: totals.saturatedFat, percent: Math.round((totals.saturatedFat / 20) * 100) },
      cholesterol: { value: totals.cholesterol, percent: Math.round((totals.cholesterol / 300) * 100) },
      sodium: { value: totals.sodium, percent: Math.round((totals.sodium / 2400) * 100) },
      totalCarbs: { value: totals.totalCarbs, percent: Math.round((totals.totalCarbs / 300) * 100) },
      fiber: { value: totals.fiber, percent: Math.round((totals.fiber / 25) * 100) },
      protein: { value: totals.protein, percent: Math.round((totals.protein / 50) * 100) },
    };

    return {
      totals,
      dailyValues,
      breakdown,
      warnings: this.generateWarnings(totals),
    };
  }

  generateWarnings(totals) {
    const warnings = [];

    if (totals.calories > 1000) {
      warnings.push({ type: 'high_calories', message: 'Alto en calorías (>1000 kcal)' });
    }
    if (totals.sodium > 1500) {
      warnings.push({ type: 'high_sodium', message: 'Alto en sodio' });
    }
    if (totals.saturatedFat > 15) {
      warnings.push({ type: 'high_saturated_fat', message: 'Alto en grasas saturadas' });
    }
    if (totals.sugars > 50) {
      warnings.push({ type: 'high_sugar', message: 'Alto en azúcares' });
    }

    return warnings;
  }

  /**
   * Filtrar productos por criterios nutricionales
   */
  async filterByNutrition(storeId, criteria) {
    const { maxCalories, maxCarbs, minProtein, maxSodium, isLowFat, isHighProtein } = criteria;

    const products = await prisma.product.findMany({
      where: { storeId, isAvailable: true },
      include: { nutrition: true },
    });

    return products.filter(p => {
      if (!p.nutrition) return false;
      
      if (maxCalories && p.nutrition.calories > maxCalories) return false;
      if (maxCarbs && p.nutrition.totalCarbs > maxCarbs) return false;
      if (minProtein && p.nutrition.protein < minProtein) return false;
      if (maxSodium && p.nutrition.sodium > maxSodium) return false;
      if (isLowFat && p.nutrition.totalFat > 10) return false;
      if (isHighProtein && p.nutrition.protein < 20) return false;

      return true;
    });
  }

  /**
   * Obtener productos por dieta
   */
  async getProductsForDiet(storeId, diet) {
    const diets = {
      keto: { maxCarbs: 20, minProtein: 15 },
      lowCarb: { maxCarbs: 50 },
      highProtein: { minProtein: 25 },
      lowSodium: { maxSodium: 500 },
      lowCalorie: { maxCalories: 400 },
    };

    const criteria = diets[diet];
    if (!criteria) throw new Error('Dieta no reconocida');

    return this.filterByNutrition(storeId, criteria);
  }

  /**
   * Sugerir alternativas más saludables
   */
  async suggestHealthierAlternatives(productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { nutrition: true, category: true },
    });

    if (!product?.nutrition) return [];

    // Buscar productos similares con mejor perfil nutricional
    const alternatives = await prisma.product.findMany({
      where: {
        storeId: product.storeId,
        categoryId: product.categoryId,
        id: { not: productId },
        isAvailable: true,
        nutrition: {
          calories: { lt: product.nutrition.calories },
        },
      },
      include: { nutrition: true },
      take: 5,
    });

    return alternatives.map(alt => ({
      id: alt.id,
      name: alt.name,
      price: alt.price,
      caloriesSaved: product.nutrition.calories - alt.nutrition.calories,
      nutrition: alt.nutrition,
    }));
  }

  /**
   * Resumen nutricional de pedidos de cliente
   */
  async getCustomerNutritionHistory(customerId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        customerId,
        status: 'delivered',
        createdAt: { gte: startDate },
      },
      include: {
        items: {
          include: {
            product: { include: { nutrition: true } },
          },
        },
      },
    });

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let orderCount = 0;

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.product?.nutrition) {
          totalCalories += item.product.nutrition.calories * item.quantity;
          totalProtein += (item.product.nutrition.protein || 0) * item.quantity;
          totalCarbs += (item.product.nutrition.totalCarbs || 0) * item.quantity;
          totalFat += (item.product.nutrition.totalFat || 0) * item.quantity;
        }
      });
      orderCount++;
    });

    return {
      period: `${days} días`,
      totalOrders: orderCount,
      totals: { calories: totalCalories, protein: totalProtein, carbs: totalCarbs, fat: totalFat },
      averagePerOrder: {
        calories: orderCount > 0 ? Math.round(totalCalories / orderCount) : 0,
        protein: orderCount > 0 ? Math.round(totalProtein / orderCount) : 0,
        carbs: orderCount > 0 ? Math.round(totalCarbs / orderCount) : 0,
        fat: orderCount > 0 ? Math.round(totalFat / orderCount) : 0,
      },
    };
  }
}

export const nutritionService = new NutritionService();
export default nutritionService;

