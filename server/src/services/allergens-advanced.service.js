/**
 * Sistema Avanzado de Alérgenos y Dietas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class AllergensAdvancedService {
  COMMON_ALLERGENS = [
    { code: 'gluten', name: 'Gluten', icon: '🌾' },
    { code: 'dairy', name: 'Lácteos', icon: '🥛' },
    { code: 'eggs', name: 'Huevos', icon: '🥚' },
    { code: 'nuts', name: 'Frutos secos', icon: '🥜' },
    { code: 'peanuts', name: 'Maní', icon: '🥜' },
    { code: 'soy', name: 'Soja', icon: '🫘' },
    { code: 'fish', name: 'Pescado', icon: '🐟' },
    { code: 'shellfish', name: 'Mariscos', icon: '🦐' },
    { code: 'sesame', name: 'Sésamo', icon: '🌱' },
    { code: 'celery', name: 'Apio', icon: '🥬' },
    { code: 'mustard', name: 'Mostaza', icon: '🟡' },
    { code: 'sulfites', name: 'Sulfitos', icon: '🍷' },
  ];

  DIETARY_PREFERENCES = [
    { code: 'vegetarian', name: 'Vegetariano', icon: '🥗' },
    { code: 'vegan', name: 'Vegano', icon: '🌱' },
    { code: 'halal', name: 'Halal', icon: '☪️' },
    { code: 'kosher', name: 'Kosher', icon: '✡️' },
    { code: 'keto', name: 'Keto', icon: '🥓' },
    { code: 'low_sodium', name: 'Bajo en sodio', icon: '🧂' },
    { code: 'low_sugar', name: 'Bajo en azúcar', icon: '🍬' },
  ];

  /**
   * Configurar alérgenos de producto
   */
  async setProductAllergens(productId, allergenCodes, crossContamination = []) {
    await prisma.productAllergen.deleteMany({ where: { productId } });

    const data = allergenCodes.map(code => ({
      productId,
      allergenCode: code,
      isCrossContamination: crossContamination.includes(code),
    }));

    await prisma.productAllergen.createMany({ data });

    logger.info({ productId, allergens: allergenCodes.length }, 'Product allergens updated');
    return { success: true };
  }

  /**
   * Configurar preferencias dietéticas de producto
   */
  async setProductDietary(productId, dietaryCodes) {
    await prisma.productDietary.deleteMany({ where: { productId } });

    const data = dietaryCodes.map(code => ({ productId, dietaryCode: code }));
    await prisma.productDietary.createMany({ data });

    return { success: true };
  }

  /**
   * Guardar perfil de alergias del cliente
   */
  async saveCustomerAllergyProfile(customerId, profile) {
    const { allergens, dietaryPreferences, severity, notes } = profile;

    return prisma.customerAllergyProfile.upsert({
      where: { customerId },
      update: {
        allergens: JSON.stringify(allergens),
        dietaryPreferences: JSON.stringify(dietaryPreferences),
        severity,
        notes,
      },
      create: {
        customerId,
        allergens: JSON.stringify(allergens),
        dietaryPreferences: JSON.stringify(dietaryPreferences),
        severity: severity || 'moderate',
        notes,
      },
    });
  }

  /**
   * Obtener menú filtrado por alergias
   */
  async getFilteredMenu(storeId, customerAllergens = [], dietaryPrefs = []) {
    const products = await prisma.product.findMany({
      where: { storeId, isAvailable: true },
      include: {
        allergens: true,
        dietary: true,
        category: true,
      },
    });

    return products.map(product => {
      const productAllergens = product.allergens.map(a => a.allergenCode);
      const productDietary = product.dietary.map(d => d.dietaryCode);

      // Verificar conflictos
      const allergenConflicts = customerAllergens.filter(a => productAllergens.includes(a));
      const crossContamination = product.allergens
        .filter(a => a.isCrossContamination && customerAllergens.includes(a.allergenCode))
        .map(a => a.allergenCode);

      // Verificar compatibilidad dietética
      const dietaryMatch = dietaryPrefs.length === 0 ||
        dietaryPrefs.every(pref => productDietary.includes(pref));

      return {
        id: product.id,
        name: product.name,
        price: product.price,
        category: product.category?.name,
        allergens: productAllergens.map(code => this.COMMON_ALLERGENS.find(a => a.code === code)),
        dietary: productDietary.map(code => this.DIETARY_PREFERENCES.find(d => d.code === code)),
        isSafe: allergenConflicts.length === 0 && crossContamination.length === 0,
        hasCrossContamination: crossContamination.length > 0,
        conflicts: allergenConflicts,
        crossContaminationRisk: crossContamination,
        dietaryCompatible: dietaryMatch,
        safetyScore: this.calculateSafetyScore(allergenConflicts, crossContamination, dietaryMatch),
      };
    }).sort((a, b) => b.safetyScore - a.safetyScore);
  }

  calculateSafetyScore(conflicts, crossContamination, dietaryMatch) {
    let score = 100;
    score -= conflicts.length * 50;
    score -= crossContamination.length * 25;
    if (!dietaryMatch) score -= 20;
    return Math.max(0, score);
  }

  /**
   * Verificar pedido antes de confirmar
   */
  async validateOrderForAllergens(customerId, items) {
    const profile = await prisma.customerAllergyProfile.findUnique({
      where: { customerId },
    });

    if (!profile) return { safe: true, warnings: [] };

    const customerAllergens = JSON.parse(profile.allergens || '[]');
    const warnings = [];
    const critical = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { allergens: true },
      });

      if (!product) continue;

      const productAllergens = product.allergens.map(a => a.allergenCode);
      const conflicts = customerAllergens.filter(a => productAllergens.includes(a));

      if (conflicts.length > 0) {
        const allergenNames = conflicts.map(c =>
          this.COMMON_ALLERGENS.find(a => a.code === c)?.name || c
        );

        if (profile.severity === 'severe') {
          critical.push({
            product: product.name,
            allergens: allergenNames,
          });
        } else {
          warnings.push({
            product: product.name,
            allergens: allergenNames,
          });
        }
      }

      // Cross contamination
      const crossContam = product.allergens
        .filter(a => a.isCrossContamination && customerAllergens.includes(a.allergenCode));

      if (crossContam.length > 0) {
        warnings.push({
          product: product.name,
          type: 'cross_contamination',
          allergens: crossContam.map(c =>
            this.COMMON_ALLERGENS.find(a => a.code === c.allergenCode)?.name
          ),
        });
      }
    }

    return {
      safe: critical.length === 0,
      critical,
      warnings,
      requiresConfirmation: warnings.length > 0,
    };
  }

  /**
   * Generar etiqueta de alérgenos para producto
   */
  async generateAllergenLabel(productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { allergens: true, dietary: true },
    });

    if (!product) throw new Error('Producto no encontrado');

    const allergens = product.allergens.map(a => {
      const info = this.COMMON_ALLERGENS.find(al => al.code === a.allergenCode);
      return {
        ...info,
        isCrossContamination: a.isCrossContamination,
      };
    });

    const dietary = product.dietary.map(d =>
      this.DIETARY_PREFERENCES.find(dp => dp.code === d.dietaryCode)
    );

    return {
      productName: product.name,
      contains: allergens.filter(a => !a.isCrossContamination),
      mayContain: allergens.filter(a => a.isCrossContamination),
      suitableFor: dietary,
      legalDisclaimer: 'Elaborado en instalaciones que procesan otros alérgenos.',
    };
  }

  /**
   * Estadísticas de alérgenos
   */
  async getAllergenStats(storeId) {
    const products = await prisma.product.findMany({
      where: { storeId },
      include: { allergens: true, dietary: true },
    });

    const allergenCount = {};
    const dietaryCount = {};

    products.forEach(p => {
      p.allergens.forEach(a => {
        allergenCount[a.allergenCode] = (allergenCount[a.allergenCode] || 0) + 1;
      });
      p.dietary.forEach(d => {
        dietaryCount[d.dietaryCode] = (dietaryCount[d.dietaryCode] || 0) + 1;
      });
    });

    return {
      totalProducts: products.length,
      allergenFree: products.filter(p => p.allergens.length === 0).length,
      byAllergen: Object.entries(allergenCount).map(([code, count]) => ({
        ...this.COMMON_ALLERGENS.find(a => a.code === code),
        productCount: count,
      })),
      byDietary: Object.entries(dietaryCount).map(([code, count]) => ({
        ...this.DIETARY_PREFERENCES.find(d => d.code === code),
        productCount: count,
      })),
    };
  }

  getAllergensList() {
    return this.COMMON_ALLERGENS;
  }

  getDietaryList() {
    return this.DIETARY_PREFERENCES;
  }
}

export const allergensAdvancedService = new AllergensAdvancedService();
export default allergensAdvancedService;

