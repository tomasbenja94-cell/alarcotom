/**
 * Sistema de Gestión de Alérgenos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class AllergensService {
  COMMON_ALLERGENS = [
    { id: 'gluten', name: 'Gluten', icon: '🌾', description: 'Trigo, cebada, centeno' },
    { id: 'dairy', name: 'Lácteos', icon: '🥛', description: 'Leche y derivados' },
    { id: 'eggs', name: 'Huevo', icon: '🥚', description: 'Huevo y derivados' },
    { id: 'nuts', name: 'Frutos secos', icon: '🥜', description: 'Nueces, almendras, etc.' },
    { id: 'peanuts', name: 'Maní', icon: '🥜', description: 'Cacahuate' },
    { id: 'soy', name: 'Soja', icon: '🫘', description: 'Soja y derivados' },
    { id: 'fish', name: 'Pescado', icon: '🐟', description: 'Pescado y derivados' },
    { id: 'shellfish', name: 'Mariscos', icon: '🦐', description: 'Crustáceos y moluscos' },
    { id: 'sesame', name: 'Sésamo', icon: '🌱', description: 'Semillas de sésamo' },
    { id: 'celery', name: 'Apio', icon: '🥬', description: 'Apio y derivados' },
    { id: 'mustard', name: 'Mostaza', icon: '🟡', description: 'Mostaza y derivados' },
    { id: 'sulfites', name: 'Sulfitos', icon: '⚗️', description: 'Conservantes' },
  ];

  DIETARY_PREFERENCES = [
    { id: 'vegetarian', name: 'Vegetariano', icon: '🥬' },
    { id: 'vegan', name: 'Vegano', icon: '🌱' },
    { id: 'halal', name: 'Halal', icon: '☪️' },
    { id: 'kosher', name: 'Kosher', icon: '✡️' },
    { id: 'gluten_free', name: 'Sin Gluten', icon: '🌾' },
    { id: 'lactose_free', name: 'Sin Lactosa', icon: '🥛' },
    { id: 'keto', name: 'Keto', icon: '🥑' },
    { id: 'low_sodium', name: 'Bajo en Sodio', icon: '🧂' },
  ];

  /**
   * Asignar alérgenos a producto
   */
  async setProductAllergens(productId, allergenIds, crossContamination = []) {
    await prisma.productAllergen.deleteMany({ where: { productId } });

    const allergens = allergenIds.map(id => ({
      productId,
      allergenId: id,
      isCrossContamination: crossContamination.includes(id),
    }));

    await prisma.productAllergen.createMany({ data: allergens });

    logger.info({ productId, allergenCount: allergenIds.length }, 'Product allergens updated');
    return { success: true };
  }

  /**
   * Obtener alérgenos de producto
   */
  async getProductAllergens(productId) {
    const allergens = await prisma.productAllergen.findMany({
      where: { productId },
    });

    return allergens.map(a => ({
      ...this.COMMON_ALLERGENS.find(ca => ca.id === a.allergenId),
      isCrossContamination: a.isCrossContamination,
    }));
  }

  /**
   * Guardar preferencias del cliente
   */
  async setCustomerPreferences(customerId, allergens, dietaryPreferences) {
    await prisma.customerAllergyProfile.upsert({
      where: { customerId },
      update: {
        allergens,
        dietaryPreferences,
        updatedAt: new Date(),
      },
      create: {
        customerId,
        allergens,
        dietaryPreferences,
      },
    });

    logger.info({ customerId }, 'Customer allergy profile updated');
    return { success: true };
  }

  /**
   * Obtener preferencias del cliente
   */
  async getCustomerPreferences(customerId) {
    const profile = await prisma.customerAllergyProfile.findUnique({
      where: { customerId },
    });

    return {
      allergens: (profile?.allergens || []).map(id =>
        this.COMMON_ALLERGENS.find(a => a.id === id)
      ),
      dietaryPreferences: (profile?.dietaryPreferences || []).map(id =>
        this.DIETARY_PREFERENCES.find(p => p.id === id)
      ),
    };
  }

  /**
   * Filtrar productos seguros para cliente
   */
  async getSafeProducts(storeId, customerId) {
    const profile = await prisma.customerAllergyProfile.findUnique({
      where: { customerId },
    });

    if (!profile || profile.allergens.length === 0) {
      return prisma.product.findMany({
        where: { storeId, isAvailable: true },
      });
    }

    const products = await prisma.product.findMany({
      where: { storeId, isAvailable: true },
      include: { allergens: true },
    });

    return products.filter(product => {
      const productAllergens = product.allergens.map(a => a.allergenId);
      return !profile.allergens.some(allergen => productAllergens.includes(allergen));
    });
  }

  /**
   * Verificar seguridad de carrito
   */
  async checkCartSafety(customerId, cartItems) {
    const profile = await prisma.customerAllergyProfile.findUnique({
      where: { customerId },
    });

    if (!profile || profile.allergens.length === 0) {
      return { safe: true, warnings: [] };
    }

    const warnings = [];

    for (const item of cartItems) {
      const productAllergens = await this.getProductAllergens(item.productId);

      for (const allergen of productAllergens) {
        if (profile.allergens.includes(allergen.id)) {
          warnings.push({
            productId: item.productId,
            productName: item.name,
            allergen: allergen.name,
            icon: allergen.icon,
            isCrossContamination: allergen.isCrossContamination,
            severity: allergen.isCrossContamination ? 'warning' : 'danger',
          });
        }
      }
    }

    return {
      safe: warnings.filter(w => w.severity === 'danger').length === 0,
      warnings,
    };
  }

  /**
   * Buscar productos por dieta
   */
  async getProductsByDiet(storeId, dietaryPreference) {
    const products = await prisma.product.findMany({
      where: { storeId, isAvailable: true },
      include: { allergens: true, dietaryTags: true },
    });

    return products.filter(product => {
      const tags = product.dietaryTags?.map(t => t.tagId) || [];

      switch (dietaryPreference) {
        case 'vegetarian':
          return tags.includes('vegetarian') || tags.includes('vegan');
        case 'vegan':
          return tags.includes('vegan');
        case 'gluten_free':
          return !product.allergens.some(a => a.allergenId === 'gluten');
        case 'lactose_free':
          return !product.allergens.some(a => a.allergenId === 'dairy');
        default:
          return tags.includes(dietaryPreference);
      }
    });
  }

  /**
   * Generar etiqueta de alérgenos
   */
  async generateAllergenLabel(productId) {
    const allergens = await this.getProductAllergens(productId);
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { dietaryTags: true },
    });

    return {
      productName: product.name,
      allergens: allergens.filter(a => !a.isCrossContamination),
      mayContain: allergens.filter(a => a.isCrossContamination),
      dietaryInfo: product.dietaryTags?.map(t =>
        this.DIETARY_PREFERENCES.find(p => p.id === t.tagId)
      ) || [],
      disclaimer: 'Este producto se prepara en una cocina donde se manejan otros alérgenos.',
    };
  }

  /**
   * Reporte de alérgenos del menú
   */
  async getMenuAllergenReport(storeId) {
    const products = await prisma.product.findMany({
      where: { storeId, isAvailable: true },
      include: { allergens: true, category: true },
    });

    const report = {};

    this.COMMON_ALLERGENS.forEach(allergen => {
      report[allergen.id] = {
        ...allergen,
        products: products.filter(p =>
          p.allergens.some(a => a.allergenId === allergen.id)
        ).map(p => ({ id: p.id, name: p.name, category: p.category?.name })),
      };
    });

    return {
      totalProducts: products.length,
      allergenFreeProducts: products.filter(p => p.allergens.length === 0).length,
      byAllergen: Object.values(report).filter(r => r.products.length > 0),
    };
  }

  /**
   * Sugerir alternativas seguras
   */
  async suggestAlternatives(productId, customerId) {
    const profile = await prisma.customerAllergyProfile.findUnique({
      where: { customerId },
    });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });

    if (!profile || !product) return [];

    const safeProducts = await prisma.product.findMany({
      where: {
        storeId: product.storeId,
        categoryId: product.categoryId,
        isAvailable: true,
        id: { not: productId },
      },
      include: { allergens: true },
    });

    return safeProducts.filter(p => {
      const allergenIds = p.allergens.map(a => a.allergenId);
      return !profile.allergens.some(a => allergenIds.includes(a));
    }).slice(0, 5);
  }
}

export const allergensService = new AllergensService();
export default allergensService;
