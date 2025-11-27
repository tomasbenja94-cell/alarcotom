/**
 * Sistema de Gestión de Recetas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class RecipesService {
  /**
   * Crear receta
   */
  async createRecipe(storeId, recipeData) {
    const {
      productId,
      name,
      description,
      yield: recipeYield,
      yieldUnit,
      prepTime,
      cookTime,
      difficulty,
      ingredients,
      steps,
      notes,
      allergens,
    } = recipeData;

    const recipe = await prisma.recipe.create({
      data: {
        storeId,
        productId,
        name,
        description,
        yield: recipeYield,
        yieldUnit: yieldUnit || 'porciones',
        prepTime,
        cookTime,
        totalTime: (prepTime || 0) + (cookTime || 0),
        difficulty, // 'easy', 'medium', 'hard'
        notes,
        allergens: allergens ? JSON.stringify(allergens) : null,
        ingredients: {
          create: ingredients.map((ing, index) => ({
            ingredientId: ing.ingredientId,
            quantity: ing.quantity,
            unit: ing.unit,
            notes: ing.notes,
            order: index,
          })),
        },
        steps: {
          create: steps.map((step, index) => ({
            stepNumber: index + 1,
            instruction: step.instruction,
            duration: step.duration,
            image: step.image,
            tips: step.tips,
          })),
        },
      },
      include: { ingredients: true, steps: true },
    });

    logger.info({ recipeId: recipe.id, name }, 'Recipe created');
    return recipe;
  }

  /**
   * Calcular costo de receta
   */
  async calculateRecipeCost(recipeId) {
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        ingredients: {
          include: { ingredient: true },
        },
      },
    });

    if (!recipe) throw new Error('Receta no encontrada');

    let totalCost = 0;
    const ingredientCosts = [];

    for (const ri of recipe.ingredients) {
      const ingredient = ri.ingredient;
      if (!ingredient) continue;

      // Convertir unidades si es necesario
      const costPerUnit = ingredient.costPerUnit || 0;
      const cost = ri.quantity * costPerUnit;
      totalCost += cost;

      ingredientCosts.push({
        name: ingredient.name,
        quantity: ri.quantity,
        unit: ri.unit,
        unitCost: costPerUnit,
        totalCost: cost,
      });
    }

    const costPerPortion = recipe.yield > 0 ? totalCost / recipe.yield : totalCost;

    return {
      recipeId,
      recipeName: recipe.name,
      yield: recipe.yield,
      totalCost,
      costPerPortion: Math.round(costPerPortion * 100) / 100,
      ingredients: ingredientCosts,
    };
  }

  /**
   * Escalar receta
   */
  async scaleRecipe(recipeId, targetYield) {
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: { ingredients: true, steps: true },
    });

    if (!recipe) throw new Error('Receta no encontrada');

    const scaleFactor = targetYield / recipe.yield;

    return {
      ...recipe,
      yield: targetYield,
      scaleFactor,
      ingredients: recipe.ingredients.map(ing => ({
        ...ing,
        originalQuantity: ing.quantity,
        quantity: Math.round(ing.quantity * scaleFactor * 100) / 100,
      })),
      prepTime: Math.round((recipe.prepTime || 0) * Math.sqrt(scaleFactor)),
      cookTime: Math.round((recipe.cookTime || 0) * Math.sqrt(scaleFactor)),
    };
  }

  /**
   * Obtener receta de producto
   */
  async getProductRecipe(productId) {
    return prisma.recipe.findFirst({
      where: { productId },
      include: {
        ingredients: {
          include: { ingredient: true },
          orderBy: { order: 'asc' },
        },
        steps: { orderBy: { stepNumber: 'asc' } },
      },
    });
  }

  /**
   * Verificar disponibilidad de ingredientes
   */
  async checkIngredientAvailability(recipeId, portions = 1) {
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        ingredients: { include: { ingredient: true } },
      },
    });

    if (!recipe) throw new Error('Receta no encontrada');

    const scaleFactor = portions / recipe.yield;
    const availability = [];
    let canMake = true;

    for (const ri of recipe.ingredients) {
      const needed = ri.quantity * scaleFactor;
      const available = ri.ingredient?.stock || 0;
      const sufficient = available >= needed;

      if (!sufficient) canMake = false;

      availability.push({
        ingredientId: ri.ingredientId,
        name: ri.ingredient?.name,
        needed,
        available,
        unit: ri.unit,
        sufficient,
        shortage: sufficient ? 0 : needed - available,
      });
    }

    return {
      canMake,
      maxPortions: this.calculateMaxPortions(recipe),
      availability,
    };
  }

  calculateMaxPortions(recipe) {
    let maxPortions = Infinity;

    for (const ri of recipe.ingredients) {
      const available = ri.ingredient?.stock || 0;
      const neededPerPortion = ri.quantity / recipe.yield;
      const possible = neededPerPortion > 0 ? Math.floor(available / neededPerPortion) : Infinity;
      maxPortions = Math.min(maxPortions, possible);
    }

    return maxPortions === Infinity ? 0 : maxPortions;
  }

  /**
   * Buscar recetas por ingrediente
   */
  async findRecipesByIngredient(storeId, ingredientId) {
    return prisma.recipe.findMany({
      where: {
        storeId,
        ingredients: { some: { ingredientId } },
      },
      include: { product: { select: { name: true } } },
    });
  }

  /**
   * Duplicar receta
   */
  async duplicateRecipe(recipeId, newName) {
    const original = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: { ingredients: true, steps: true },
    });

    if (!original) throw new Error('Receta no encontrada');

    const duplicate = await prisma.recipe.create({
      data: {
        storeId: original.storeId,
        name: newName || `${original.name} (copia)`,
        description: original.description,
        yield: original.yield,
        yieldUnit: original.yieldUnit,
        prepTime: original.prepTime,
        cookTime: original.cookTime,
        totalTime: original.totalTime,
        difficulty: original.difficulty,
        notes: original.notes,
        allergens: original.allergens,
        ingredients: {
          create: original.ingredients.map(ing => ({
            ingredientId: ing.ingredientId,
            quantity: ing.quantity,
            unit: ing.unit,
            notes: ing.notes,
            order: ing.order,
          })),
        },
        steps: {
          create: original.steps.map(step => ({
            stepNumber: step.stepNumber,
            instruction: step.instruction,
            duration: step.duration,
            image: step.image,
            tips: step.tips,
          })),
        },
      },
    });

    return duplicate;
  }

  /**
   * Obtener todas las recetas
   */
  async getRecipes(storeId) {
    return prisma.recipe.findMany({
      where: { storeId },
      include: {
        product: { select: { name: true, price: true } },
        _count: { select: { ingredients: true, steps: true } },
      },
      orderBy: { name: 'asc' },
    });
  }
}

export const recipesService = new RecipesService();
export default recipesService;

