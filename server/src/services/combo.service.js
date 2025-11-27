/**
 * Servicio de Combos y Variantes de Productos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class ComboService {
  /**
   * Crear un combo
   * Un combo es un producto especial que agrupa otros productos con descuento
   */
  async createCombo(storeId, comboData) {
    const {
      name,
      description,
      imageUrl,
      categoryId,
      products, // [{ productId, quantity, priceOverride? }]
      comboPrice, // Precio fijo del combo (si null, se calcula)
      discountPercent, // Descuento sobre la suma de productos
      isActive = true,
    } = comboData;

    // Calcular precio base (suma de productos)
    let basePrice = 0;
    for (const item of products) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
      });
      if (!product) {
        throw new Error(`Producto ${item.productId} no encontrado`);
      }
      basePrice += (item.priceOverride || product.price) * item.quantity;
    }

    // Calcular precio final
    let finalPrice;
    if (comboPrice) {
      finalPrice = comboPrice;
    } else if (discountPercent) {
      finalPrice = basePrice * (1 - discountPercent / 100);
    } else {
      finalPrice = basePrice;
    }

    // Crear el producto combo
    const combo = await prisma.product.create({
      data: {
        name,
        description: JSON.stringify({
          isCombo: true,
          products,
          basePrice,
          discountPercent,
          comboDescription: description,
        }),
        price: finalPrice,
        imageUrl,
        categoryId,
        storeId,
        isAvailable: isActive,
      },
    });

    logger.info({
      comboId: combo.id,
      storeId,
      name,
      basePrice,
      finalPrice,
    }, 'Combo created');

    return {
      ...combo,
      isCombo: true,
      products,
      basePrice,
      savings: basePrice - finalPrice,
    };
  }

  /**
   * Obtener combos de una tienda
   */
  async getStoreCombos(storeId) {
    const products = await prisma.product.findMany({
      where: {
        storeId,
        description: { contains: '"isCombo":true' },
      },
    });

    return products.map(product => {
      try {
        const comboData = JSON.parse(product.description);
        return {
          ...product,
          ...comboData,
          savings: comboData.basePrice - product.price,
        };
      } catch {
        return product;
      }
    });
  }

  /**
   * Verificar disponibilidad de combo (todos los productos deben estar disponibles)
   */
  async isComboAvailable(comboId) {
    const combo = await prisma.product.findUnique({
      where: { id: comboId },
    });

    if (!combo) return false;

    try {
      const comboData = JSON.parse(combo.description);
      if (!comboData.isCombo) return combo.isAvailable;

      // Verificar cada producto del combo
      for (const item of comboData.products) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
        });
        if (!product || !product.isAvailable) {
          return false;
        }
      }

      return combo.isAvailable;
    } catch {
      return combo.isAvailable;
    }
  }

  /**
   * Expandir combo a sus productos individuales (para el pedido)
   */
  async expandCombo(comboId, quantity = 1) {
    const combo = await prisma.product.findUnique({
      where: { id: comboId },
    });

    if (!combo) {
      throw new Error('Combo no encontrado');
    }

    try {
      const comboData = JSON.parse(combo.description);
      if (!comboData.isCombo) {
        return [{ productId: comboId, quantity }];
      }

      // Expandir productos
      const expandedItems = [];
      for (const item of comboData.products) {
        expandedItems.push({
          productId: item.productId,
          quantity: item.quantity * quantity,
          fromCombo: comboId,
        });
      }

      return expandedItems;
    } catch {
      return [{ productId: comboId, quantity }];
    }
  }

  // ============ VARIANTES ============

  /**
   * Crear variante de producto
   * Las variantes son opciones del mismo producto (ej: tamaño, sabor)
   */
  async createProductVariants(productId, variants) {
    // variants: [{ name, priceModifier, sku?, stock? }]
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error('Producto no encontrado');
    }

    // Crear categoría de opciones para variantes
    const optionCategory = await prisma.productOptionCategory.create({
      data: {
        productId,
        name: 'Variante',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        displayOrder: 0,
      },
    });

    // Crear opciones (variantes)
    const createdVariants = [];
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const option = await prisma.productOption.create({
        data: {
          optionCategoryId: optionCategory.id,
          name: variant.name,
          priceModifier: variant.priceModifier || 0,
          isAvailable: true,
          displayOrder: i,
        },
      });
      createdVariants.push(option);
    }

    logger.info({
      productId,
      variantCount: createdVariants.length,
    }, 'Product variants created');

    return {
      optionCategoryId: optionCategory.id,
      variants: createdVariants,
    };
  }

  /**
   * Obtener variantes de un producto
   */
  async getProductVariants(productId) {
    const optionCategories = await prisma.productOptionCategory.findMany({
      where: {
        productId,
        name: 'Variante',
      },
      include: {
        options: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (optionCategories.length === 0) {
      return null;
    }

    return optionCategories[0].options;
  }

  /**
   * Calcular precio con variante seleccionada
   */
  async calculatePriceWithVariant(productId, variantId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error('Producto no encontrado');
    }

    const variant = await prisma.productOption.findUnique({
      where: { id: variantId },
    });

    if (!variant) {
      return product.price;
    }

    return product.price + variant.priceModifier;
  }

  // ============ PRODUCTOS RELACIONADOS ============

  /**
   * Obtener productos frecuentemente comprados juntos
   */
  async getFrequentlyBoughtTogether(productId, limit = 4) {
    // Buscar pedidos que contengan este producto
    const ordersWithProduct = await prisma.orderItem.findMany({
      where: { productId },
      select: { orderId: true },
      take: 100,
    });

    const orderIds = ordersWithProduct.map(o => o.orderId);

    // Buscar otros productos en esos pedidos
    const otherItems = await prisma.orderItem.findMany({
      where: {
        orderId: { in: orderIds },
        productId: { not: productId },
      },
      select: { productId: true },
    });

    // Contar frecuencia
    const frequency = {};
    otherItems.forEach(item => {
      frequency[item.productId] = (frequency[item.productId] || 0) + 1;
    });

    // Ordenar por frecuencia y obtener top
    const topProductIds = Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([id]) => id);

    // Obtener detalles de productos
    const products = await prisma.product.findMany({
      where: {
        id: { in: topProductIds },
        isAvailable: true,
      },
    });

    return products;
  }

  /**
   * Sugerir combo basado en carrito
   */
  async suggestCombo(storeId, cartItems) {
    // cartItems: [{ productId, quantity }]
    const cartProductIds = cartItems.map(i => i.productId);

    // Obtener combos de la tienda
    const combos = await this.getStoreCombos(storeId);

    // Buscar combos que contengan productos del carrito
    const suggestions = [];
    for (const combo of combos) {
      if (!combo.products) continue;

      const comboProductIds = combo.products.map(p => p.productId);
      const matchCount = comboProductIds.filter(id => cartProductIds.includes(id)).length;
      
      if (matchCount > 0) {
        suggestions.push({
          combo,
          matchCount,
          matchPercent: (matchCount / comboProductIds.length) * 100,
          savings: combo.savings,
        });
      }
    }

    // Ordenar por coincidencia y ahorro
    suggestions.sort((a, b) => {
      if (b.matchPercent !== a.matchPercent) {
        return b.matchPercent - a.matchPercent;
      }
      return b.savings - a.savings;
    });

    return suggestions.slice(0, 3);
  }
}

export const comboService = new ComboService();
export default comboService;

