/**
 * Sistema de Búsqueda Avanzada de Productos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class ProductSearchService {
  /**
   * Búsqueda principal
   */
  async search(storeId, query, options = {}) {
    const {
      categoryId, minPrice, maxPrice, sortBy, sortOrder,
      dietary, allergenFree, limit, offset,
    } = options;

    const where = {
      storeId,
      isAvailable: true,
    };

    // Búsqueda por texto
    if (query) {
      const searchTerms = query.toLowerCase().split(' ').filter(t => t.length > 1);

      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { tags: { hasSome: searchTerms } },
        { category: { name: { contains: query, mode: 'insensitive' } } },
      ];
    }

    // Filtros
    if (categoryId) where.categoryId = categoryId;
    if (minPrice) where.price = { ...where.price, gte: minPrice };
    if (maxPrice) where.price = { ...where.price, lte: maxPrice };

    // Ordenamiento
    const orderBy = this.getOrderBy(sortBy, sortOrder);

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: true,
          allergens: true,
          dietary: true,
        },
        orderBy,
        take: limit || 20,
        skip: offset || 0,
      }),
      prisma.product.count({ where }),
    ]);

    // Filtros post-query (dietary, allergens)
    let filteredProducts = products;

    if (dietary && dietary.length > 0) {
      filteredProducts = filteredProducts.filter(p =>
        dietary.every(d => p.dietary.some(pd => pd.dietaryCode === d))
      );
    }

    if (allergenFree && allergenFree.length > 0) {
      filteredProducts = filteredProducts.filter(p =>
        !p.allergens.some(a => allergenFree.includes(a.allergenCode))
      );
    }

    // Registrar búsqueda
    if (query) {
      await this.logSearch(storeId, query, filteredProducts.length);
    }

    return {
      products: filteredProducts.map(p => this.formatProduct(p)),
      total,
      hasMore: (offset || 0) + filteredProducts.length < total,
    };
  }

  getOrderBy(sortBy, sortOrder = 'asc') {
    const order = sortOrder === 'desc' ? 'desc' : 'asc';

    switch (sortBy) {
      case 'price': return { price: order };
      case 'name': return { name: order };
      case 'popular': return { orderCount: 'desc' };
      case 'newest': return { createdAt: 'desc' };
      case 'rating': return { avgRating: 'desc' };
      default: return [{ featured: 'desc' }, { orderCount: 'desc' }];
    }
  }

  formatProduct(product) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      image: product.image,
      category: product.category?.name,
      categoryId: product.categoryId,
      isAvailable: product.isAvailable,
      allergens: product.allergens?.map(a => a.allergenCode) || [],
      dietary: product.dietary?.map(d => d.dietaryCode) || [],
      rating: product.avgRating,
      reviewCount: product.reviewCount,
    };
  }

  /**
   * Autocompletado de búsqueda
   */
  async autocomplete(storeId, query, limit = 5) {
    if (!query || query.length < 2) return [];

    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: {
          storeId,
          isAvailable: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true, image: true, price: true },
        take: limit,
      }),
      prisma.category.findMany({
        where: {
          storeId,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        take: 3,
      }),
    ]);

    return {
      products: products.map(p => ({ type: 'product', ...p })),
      categories: categories.map(c => ({ type: 'category', ...c })),
    };
  }

  /**
   * Búsquedas populares
   */
  async getPopularSearches(storeId, limit = 10) {
    const searches = await prisma.searchLog.groupBy({
      by: ['query'],
      where: {
        storeId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        resultsCount: { gt: 0 },
      },
      _count: true,
      orderBy: { _count: { query: 'desc' } },
      take: limit,
    });

    return searches.map(s => ({
      query: s.query,
      searchCount: s._count,
    }));
  }

  /**
   * Búsquedas recientes del usuario
   */
  async getRecentSearches(customerId, limit = 5) {
    const searches = await prisma.searchLog.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      distinct: ['query'],
      take: limit,
    });

    return searches.map(s => s.query);
  }

  /**
   * Registrar búsqueda
   */
  async logSearch(storeId, query, resultsCount, customerId = null) {
    await prisma.searchLog.create({
      data: {
        storeId,
        query: query.toLowerCase().trim(),
        resultsCount,
        customerId,
      },
    });
  }

  /**
   * Productos similares
   */
  async getSimilarProducts(productId, limit = 4) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });

    if (!product) return [];

    const similar = await prisma.product.findMany({
      where: {
        storeId: product.storeId,
        isAvailable: true,
        id: { not: productId },
        OR: [
          { categoryId: product.categoryId },
          { price: { gte: product.price * 0.7, lte: product.price * 1.3 } },
        ],
      },
      include: { category: true },
      take: limit,
    });

    return similar.map(p => this.formatProduct(p));
  }

  /**
   * Productos frecuentemente comprados juntos
   */
  async getFrequentlyBoughtTogether(productId, limit = 3) {
    // Buscar órdenes que contengan este producto
    const orderIds = await prisma.orderItem.findMany({
      where: { productId },
      select: { orderId: true },
      take: 100,
    });

    if (orderIds.length === 0) return [];

    // Buscar otros productos en esas órdenes
    const relatedItems = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        orderId: { in: orderIds.map(o => o.orderId) },
        productId: { not: productId },
      },
      _count: true,
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });

    const products = await prisma.product.findMany({
      where: {
        id: { in: relatedItems.map(i => i.productId) },
        isAvailable: true,
      },
      include: { category: true },
    });

    return products.map(p => this.formatProduct(p));
  }

  /**
   * Filtros disponibles para una categoría
   */
  async getAvailableFilters(storeId, categoryId = null) {
    const where = { storeId, isAvailable: true };
    if (categoryId) where.categoryId = categoryId;

    const [priceRange, categories, dietary, allergens] = await Promise.all([
      prisma.product.aggregate({
        where,
        _min: { price: true },
        _max: { price: true },
      }),
      prisma.category.findMany({
        where: { storeId },
        select: { id: true, name: true, _count: { select: { products: { where: { isAvailable: true } } } } },
      }),
      prisma.productDietary.groupBy({
        by: ['dietaryCode'],
        where: { product: where },
        _count: true,
      }),
      prisma.productAllergen.groupBy({
        by: ['allergenCode'],
        where: { product: where },
        _count: true,
      }),
    ]);

    return {
      priceRange: {
        min: priceRange._min.price || 0,
        max: priceRange._max.price || 10000,
      },
      categories: categories.filter(c => c._count.products > 0).map(c => ({
        id: c.id,
        name: c.name,
        productCount: c._count.products,
      })),
      dietary: dietary.map(d => ({ code: d.dietaryCode, count: d._count })),
      allergens: allergens.map(a => ({ code: a.allergenCode, count: a._count })),
    };
  }

  /**
   * Búsqueda por voz (procesamiento de texto natural)
   */
  async processVoiceSearch(storeId, transcript) {
    // Limpiar y normalizar
    let query = transcript.toLowerCase()
      .replace(/quiero|dame|necesito|pedí|agregar|una?|unas?|dos|tres/gi, '')
      .replace(/por favor|gracias/gi, '')
      .trim();

    // Detectar cantidad
    const quantityMatch = transcript.match(/(\d+|una?|dos|tres|cuatro|cinco)/i);
    let quantity = 1;
    if (quantityMatch) {
      const numWords = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
      quantity = numWords[quantityMatch[1].toLowerCase()] || parseInt(quantityMatch[1]) || 1;
    }

    // Buscar producto
    const results = await this.search(storeId, query, { limit: 3 });

    return {
      originalTranscript: transcript,
      processedQuery: query,
      quantity,
      results: results.products,
      bestMatch: results.products[0] || null,
    };
  }

  /**
   * Estadísticas de búsqueda (para admin)
   */
  async getSearchStats(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalSearches, noResults, popular] = await Promise.all([
      prisma.searchLog.count({
        where: { storeId, createdAt: { gte: startDate } },
      }),
      prisma.searchLog.count({
        where: { storeId, createdAt: { gte: startDate }, resultsCount: 0 },
      }),
      this.getPopularSearches(storeId, 20),
    ]);

    // Búsquedas sin resultados (oportunidad)
    const zeroResults = await prisma.searchLog.groupBy({
      by: ['query'],
      where: { storeId, createdAt: { gte: startDate }, resultsCount: 0 },
      _count: true,
      orderBy: { _count: { query: 'desc' } },
      take: 10,
    });

    return {
      period: `${days} días`,
      totalSearches,
      noResultsCount: noResults,
      noResultsPercent: totalSearches > 0 ? Math.round((noResults / totalSearches) * 100) : 0,
      popularSearches: popular,
      zeroResultSearches: zeroResults.map(s => ({ query: s.query, count: s._count })),
    };
  }
}

export const productSearchService = new ProductSearchService();
export default productSearchService;

