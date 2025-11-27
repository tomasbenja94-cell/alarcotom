/**
 * Sistema de Costeo de Recetas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class RecipeCostingService {
  /**
   * Crear receta con ingredientes
   */
  async createRecipe(productId, ingredients) {
    // Eliminar receta anterior si existe
    await prisma.recipeIngredient.deleteMany({ where: { productId } });

    const recipeItems = ingredients.map(ing => ({
      productId,
      ingredientId: ing.ingredientId,
      quantity: ing.quantity,
      unit: ing.unit,
      notes: ing.notes,
    }));

    await prisma.recipeIngredient.createMany({ data: recipeItems });

    // Calcular costo
    const cost = await this.calculateRecipeCost(productId);

    await prisma.product.update({
      where: { id: productId },
      data: { recipeCost: cost.totalCost },
    });

    logger.info({ productId, ingredientCount: ingredients.length, cost: cost.totalCost }, 'Recipe created');
    return cost;
  }

  /**
   * Calcular costo de receta
   */
  async calculateRecipeCost(productId) {
    const recipe = await prisma.recipeIngredient.findMany({
      where: { productId },
      include: { ingredient: true },
    });

    let totalCost = 0;
    const breakdown = [];

    for (const item of recipe) {
      const unitCost = this.convertToUnitCost(
        item.ingredient.costPerUnit,
        item.ingredient.unit,
        item.quantity,
        item.unit
      );

      totalCost += unitCost;

      breakdown.push({
        ingredientName: item.ingredient.name,
        quantity: item.quantity,
        unit: item.unit,
        unitCost: item.ingredient.costPerUnit,
        totalCost: unitCost,
      });
    }

    return {
      productId,
      totalCost: Math.round(totalCost * 100) / 100,
      breakdown,
    };
  }

  convertToUnitCost(costPerUnit, baseUnit, quantity, targetUnit) {
    // Conversiones básicas
    const conversions = {
      kg_to_g: 1000,
      l_to_ml: 1000,
      kg_to_mg: 1000000,
    };

    const key = `${baseUnit}_to_${targetUnit}`;
    const reverseKey = `${targetUnit}_to_${baseUnit}`;

    if (conversions[key]) {
      return (costPerUnit / conversions[key]) * quantity;
    } else if (conversions[reverseKey]) {
      return (costPerUnit * conversions[reverseKey]) * quantity;
    }

    // Misma unidad
    return costPerUnit * quantity;
  }

  /**
   * Crear ingrediente
   */
  async createIngredient(storeId, ingredientData) {
    const { name, category, costPerUnit, unit, supplierId, minStock, currentStock } = ingredientData;

    return prisma.ingredient.create({
      data: {
        storeId,
        name,
        category,
        costPerUnit,
        unit,
        supplierId,
        minStock,
        currentStock: currentStock || 0,
        isActive: true,
      },
    });
  }

  /**
   * Actualizar precio de ingrediente
   */
  async updateIngredientPrice(ingredientId, newCost) {
    const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });

    // Guardar historial
    await prisma.ingredientPriceHistory.create({
      data: {
        ingredientId,
        oldPrice: ingredient.costPerUnit,
        newPrice: newCost,
      },
    });

    await prisma.ingredient.update({
      where: { id: ingredientId },
      data: { costPerUnit: newCost },
    });

    // Recalcular costos de productos afectados
    const affectedProducts = await prisma.recipeIngredient.findMany({
      where: { ingredientId },
      select: { productId: true },
    });

    for (const { productId } of affectedProducts) {
      const cost = await this.calculateRecipeCost(productId);
      await prisma.product.update({
        where: { id: productId },
        data: { recipeCost: cost.totalCost },
      });
    }

    return { affected: affectedProducts.length };
  }

  /**
   * Calcular margen de ganancia
   */
  async calculateMargins(storeId) {
    const products = await prisma.product.findMany({
      where: { storeId, isAvailable: true, recipeCost: { not: null } },
    });

    return products.map(p => {
      const margin = p.price - p.recipeCost;
      const marginPercent = p.price > 0 ? Math.round((margin / p.price) * 100) : 0;

      return {
        productId: p.id,
        productName: p.name,
        price: p.price,
        cost: p.recipeCost,
        margin,
        marginPercent,
        status: marginPercent < 30 ? 'low' : marginPercent < 50 ? 'medium' : 'healthy',
      };
    }).sort((a, b) => a.marginPercent - b.marginPercent);
  }

  /**
   * Sugerir precio basado en margen deseado
   */
  suggestPrice(cost, targetMarginPercent) {
    const price = cost / (1 - targetMarginPercent / 100);
    return {
      cost,
      targetMargin: targetMarginPercent,
      suggestedPrice: Math.ceil(price / 10) * 10, // Redondear a decena
      actualMargin: Math.round(((Math.ceil(price / 10) * 10 - cost) / (Math.ceil(price / 10) * 10)) * 100),
    };
  }

  /**
   * Análisis de food cost
   */
  async getFoodCostAnalysis(storeId, startDate, endDate) {
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'delivered',
        createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      include: { items: { include: { product: true } } },
    });

    let totalRevenue = 0;
    let totalCost = 0;

    orders.forEach(order => {
      order.items.forEach(item => {
        totalRevenue += item.subtotal;
        totalCost += (item.product.recipeCost || 0) * item.quantity;
      });
    });

    const foodCostPercent = totalRevenue > 0 ? Math.round((totalCost / totalRevenue) * 100) : 0;

    return {
      period: { startDate, endDate },
      totalRevenue,
      totalCost,
      grossProfit: totalRevenue - totalCost,
      foodCostPercent,
      benchmark: foodCostPercent <= 30 ? 'excellent' : foodCostPercent <= 35 ? 'good' : 'needs_attention',
    };
  }

  /**
   * Productos sin receta
   */
  async getProductsWithoutRecipe(storeId) {
    return prisma.product.findMany({
      where: {
        storeId,
        isAvailable: true,
        recipeIngredients: { none: {} },
      },
      select: { id: true, name: true, price: true },
    });
  }

  /**
   * Ingredientes con bajo stock
   */
  async getLowStockIngredients(storeId) {
    return prisma.ingredient.findMany({
      where: {
        storeId,
        isActive: true,
        currentStock: { lte: prisma.ingredient.fields.minStock },
      },
    });
  }

  /**
   * Historial de precios de ingrediente
   */
  async getIngredientPriceHistory(ingredientId, months = 6) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    return prisma.ingredientPriceHistory.findMany({
      where: { ingredientId, createdAt: { gte: startDate } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Impacto de cambio de precio
   */
  async simulatePriceChange(ingredientId, newPrice) {
    const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    const affectedRecipes = await prisma.recipeIngredient.findMany({
      where: { ingredientId },
      include: { product: true },
    });

    const impact = affectedRecipes.map(recipe => {
      const oldIngredientCost = this.convertToUnitCost(
        ingredient.costPerUnit, ingredient.unit, recipe.quantity, recipe.unit
      );
      const newIngredientCost = this.convertToUnitCost(
        newPrice, ingredient.unit, recipe.quantity, recipe.unit
      );
      const costDiff = newIngredientCost - oldIngredientCost;
      const newTotalCost = (recipe.product.recipeCost || 0) + costDiff;
      const newMargin = recipe.product.price - newTotalCost;

      return {
        productName: recipe.product.name,
        currentCost: recipe.product.recipeCost,
        newCost: newTotalCost,
        costIncrease: costDiff,
        newMarginPercent: Math.round((newMargin / recipe.product.price) * 100),
      };
    });

    return {
      ingredientName: ingredient.name,
      currentPrice: ingredient.costPerUnit,
      newPrice,
      priceChange: ((newPrice - ingredient.costPerUnit) / ingredient.costPerUnit * 100).toFixed(1) + '%',
      affectedProducts: impact,
    };
  }
}

export const recipeCostingService = new RecipeCostingService();
export default recipeCostingService;

