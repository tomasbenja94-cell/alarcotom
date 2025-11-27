/**
 * Sistema de Análisis de Competencia
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class CompetitiveAnalysisService {
  /**
   * Registrar competidor
   */
  async addCompetitor(storeId, competitorData) {
    const {
      name, type, address, lat, lng, website,
      deliveryPlatforms, priceRange, specialties,
    } = competitorData;

    const competitor = await prisma.competitor.create({
      data: {
        storeId,
        name,
        type,
        address,
        lat,
        lng,
        website,
        deliveryPlatforms: deliveryPlatforms || [],
        priceRange,
        specialties: specialties || [],
        isActive: true,
      },
    });

    logger.info({ competitorId: competitor.id, name }, 'Competitor added');
    return competitor;
  }

  /**
   * Registrar observación de precios
   */
  async recordPriceObservation(competitorId, products) {
    const observations = products.map(p => ({
      competitorId,
      productName: p.name,
      category: p.category,
      price: p.price,
      observedAt: new Date(),
    }));

    await prisma.competitorPrice.createMany({ data: observations });
    logger.info({ competitorId, count: products.length }, 'Price observations recorded');
    return { success: true, count: products.length };
  }

  /**
   * Comparar precios
   */
  async compareMyPrices(storeId, category = null) {
    const myProducts = await prisma.product.findMany({
      where: {
        storeId,
        isAvailable: true,
        categoryId: category || undefined,
      },
      include: { category: true },
    });

    const competitors = await prisma.competitor.findMany({
      where: { storeId, isActive: true },
    });

    const competitorPrices = await prisma.competitorPrice.findMany({
      where: {
        competitorId: { in: competitors.map(c => c.id) },
        observedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { observedAt: 'desc' },
    });

    const comparison = myProducts.map(product => {
      const similarPrices = competitorPrices.filter(cp =>
        this.isSimilarProduct(product.name, cp.productName)
      );

      const avgCompetitorPrice = similarPrices.length > 0
        ? similarPrices.reduce((sum, p) => sum + p.price, 0) / similarPrices.length
        : null;

      return {
        productId: product.id,
        productName: product.name,
        category: product.category?.name,
        myPrice: product.price,
        avgCompetitorPrice: avgCompetitorPrice ? Math.round(avgCompetitorPrice) : null,
        priceDiff: avgCompetitorPrice ? Math.round(product.price - avgCompetitorPrice) : null,
        priceDiffPercent: avgCompetitorPrice
          ? Math.round((product.price - avgCompetitorPrice) / avgCompetitorPrice * 100)
          : null,
        competitorCount: similarPrices.length,
        recommendation: this.getPriceRecommendation(product.price, avgCompetitorPrice),
      };
    });

    return {
      products: comparison,
      summary: {
        totalProducts: comparison.length,
        cheaperThanCompetitors: comparison.filter(c => c.priceDiff < 0).length,
        moreExpensive: comparison.filter(c => c.priceDiff > 0).length,
        avgPriceDiff: Math.round(
          comparison.filter(c => c.priceDiff !== null)
            .reduce((sum, c) => sum + c.priceDiffPercent, 0) /
          comparison.filter(c => c.priceDiff !== null).length
        ) || 0,
      },
    };
  }

  isSimilarProduct(name1, name2) {
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n1 = normalize(name1);
    const n2 = normalize(name2);
    return n1.includes(n2) || n2.includes(n1) || this.similarity(n1, n2) > 0.7;
  }

  similarity(s1, s2) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1;
    return (longer.length - this.editDistance(longer, shorter)) / longer.length;
  }

  editDistance(s1, s2) {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) costs[j] = j;
        else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  getPriceRecommendation(myPrice, competitorPrice) {
    if (!competitorPrice) return null;
    const diff = (myPrice - competitorPrice) / competitorPrice * 100;
    
    if (diff > 20) return { action: 'review', message: 'Precio muy por encima de competencia' };
    if (diff > 10) return { action: 'consider', message: 'Precio algo elevado' };
    if (diff < -20) return { action: 'opportunity', message: 'Oportunidad de subir precio' };
    return { action: 'maintain', message: 'Precio competitivo' };
  }

  /**
   * Análisis FODA
   */
  async generateSwotAnalysis(storeId) {
    const [store, competitors, orders, reviews] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId } }),
      prisma.competitor.findMany({ where: { storeId, isActive: true } }),
      prisma.order.findMany({
        where: { storeId, createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.storeReview.findMany({ where: { storeId } }),
    ]);

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    const priceComparison = await this.compareMyPrices(storeId);

    const swot = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    // Fortalezas
    if (avgRating >= 4.5) swot.strengths.push('Excelente reputación (rating alto)');
    if (priceComparison.summary.cheaperThanCompetitors > priceComparison.summary.moreExpensive)
      swot.strengths.push('Precios competitivos');
    if (orders.length > 100) swot.strengths.push('Base de clientes establecida');

    // Debilidades
    if (avgRating < 4) swot.weaknesses.push('Rating por debajo de lo ideal');
    if (priceComparison.summary.moreExpensive > priceComparison.summary.cheaperThanCompetitors)
      swot.weaknesses.push('Precios por encima de competencia');

    // Oportunidades
    if (competitors.length < 5) swot.opportunities.push('Mercado con poca competencia');
    const deliveryPlatforms = new Set(competitors.flatMap(c => c.deliveryPlatforms || []));
    if (!deliveryPlatforms.has('rappi')) swot.opportunities.push('Expandir a más plataformas de delivery');

    // Amenazas
    if (competitors.length > 10) swot.threats.push('Alta competencia en la zona');
    const newCompetitors = competitors.filter(c =>
      c.createdAt > new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    );
    if (newCompetitors.length > 2) swot.threats.push('Nuevos competidores entrando al mercado');

    return swot;
  }

  /**
   * Benchmarking de métricas
   */
  async getBenchmarks(storeId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [orders, reviews] = await Promise.all([
      prisma.order.findMany({
        where: { storeId, status: 'delivered', createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.storeReview.findMany({
        where: { storeId, createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    const myMetrics = {
      avgTicket: orders.length > 0
        ? Math.round(orders.reduce((sum, o) => sum + o.total, 0) / orders.length)
        : 0,
      avgRating: reviews.length > 0
        ? Math.round(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length * 10) / 10
        : 0,
      ordersPerDay: Math.round(orders.length / 30 * 10) / 10,
    };

    // Benchmarks de industria (valores ejemplo)
    const industryBenchmarks = {
      avgTicket: { low: 800, mid: 1200, high: 1800 },
      avgRating: { low: 3.5, mid: 4.2, high: 4.7 },
      ordersPerDay: { low: 10, mid: 30, high: 80 },
    };

    return {
      myMetrics,
      benchmarks: industryBenchmarks,
      positioning: {
        avgTicket: this.getPositioning(myMetrics.avgTicket, industryBenchmarks.avgTicket),
        avgRating: this.getPositioning(myMetrics.avgRating, industryBenchmarks.avgRating),
        ordersPerDay: this.getPositioning(myMetrics.ordersPerDay, industryBenchmarks.ordersPerDay),
      },
    };
  }

  getPositioning(value, benchmark) {
    if (value >= benchmark.high) return 'top';
    if (value >= benchmark.mid) return 'above_average';
    if (value >= benchmark.low) return 'average';
    return 'below_average';
  }
}

export const competitiveAnalysisService = new CompetitiveAnalysisService();
export default competitiveAnalysisService;

