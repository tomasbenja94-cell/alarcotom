/**
 * Sistema de Análisis de Competencia
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class CompetitorAnalysisService {
  /**
   * Agregar competidor
   */
  async addCompetitor(storeId, competitorData) {
    const { name, address, phone, website, category, notes } = competitorData;

    const competitor = await prisma.competitor.create({
      data: {
        storeId,
        name,
        address,
        phone,
        website,
        category,
        notes,
      },
    });

    logger.info({ competitorId: competitor.id, name }, 'Competitor added');
    return competitor;
  }

  /**
   * Registrar precio de competidor
   */
  async recordCompetitorPrice(competitorId, priceData) {
    const { productName, price, notes, source } = priceData;

    const record = await prisma.competitorPrice.create({
      data: {
        competitorId,
        productName,
        price,
        notes,
        source, // 'menu', 'website', 'app', 'visit'
      },
    });

    return record;
  }

  /**
   * Comparar precios con competidores
   */
  async compareprices(storeId) {
    const competitors = await prisma.competitor.findMany({
      where: { storeId },
      include: {
        prices: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const myProducts = await prisma.product.findMany({
      where: { storeId },
      select: { id: true, name: true, price: true },
    });

    const comparisons = [];

    for (const product of myProducts) {
      const competitorPrices = [];

      for (const competitor of competitors) {
        // Buscar producto similar por nombre
        const matchingPrice = competitor.prices.find(p => 
          this.similarNames(p.productName, product.name)
        );

        if (matchingPrice) {
          competitorPrices.push({
            competitorName: competitor.name,
            price: matchingPrice.price,
            difference: product.price - matchingPrice.price,
            percentDiff: Math.round(((product.price - matchingPrice.price) / matchingPrice.price) * 100),
          });
        }
      }

      if (competitorPrices.length > 0) {
        const avgCompetitorPrice = competitorPrices.reduce((sum, c) => sum + c.price, 0) / competitorPrices.length;
        
        comparisons.push({
          productId: product.id,
          productName: product.name,
          myPrice: product.price,
          avgCompetitorPrice: Math.round(avgCompetitorPrice),
          competitorPrices,
          position: product.price < avgCompetitorPrice ? 'below' : 
                   product.price > avgCompetitorPrice ? 'above' : 'equal',
        });
      }
    }

    return {
      totalProducts: myProducts.length,
      comparedProducts: comparisons.length,
      comparisons: comparisons.sort((a, b) => b.percentDiff - a.percentDiff),
      summary: {
        above: comparisons.filter(c => c.position === 'above').length,
        below: comparisons.filter(c => c.position === 'below').length,
        equal: comparisons.filter(c => c.position === 'equal').length,
      },
    };
  }

  similarNames(name1, name2) {
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n1 = normalize(name1);
    const n2 = normalize(name2);
    
    // Coincidencia exacta o contiene
    if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
    
    // Similitud básica
    const words1 = n1.split(/\s+/);
    const words2 = n2.split(/\s+/);
    const commonWords = words1.filter(w => words2.includes(w));
    
    return commonWords.length >= Math.min(words1.length, words2.length) * 0.5;
  }

  /**
   * Análisis FODA
   */
  async generateSWOT(storeId) {
    const [store, competitors, orders, reviews] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId } }),
      prisma.competitor.findMany({ where: { storeId } }),
      prisma.order.findMany({
        where: { storeId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.survey.findMany({
        where: { storeId, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length
      : 0;

    const priceComparison = await this.compareprices(storeId);

    // Generar análisis automático
    const swot = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    // Fortalezas
    if (avgRating >= 4) swot.strengths.push('Alta satisfacción del cliente');
    if (orders.length > 500) swot.strengths.push('Alto volumen de pedidos');
    if (priceComparison.summary.below > priceComparison.summary.above) {
      swot.strengths.push('Precios competitivos');
    }

    // Debilidades
    if (avgRating < 3.5) swot.weaknesses.push('Calificaciones por mejorar');
    if (priceComparison.summary.above > priceComparison.summary.below) {
      swot.weaknesses.push('Precios por encima de la competencia');
    }

    // Oportunidades
    swot.opportunities.push('Expansión de delivery');
    swot.opportunities.push('Programa de fidelización');
    if (competitors.length < 5) swot.opportunities.push('Mercado con poca competencia');

    // Amenazas
    if (competitors.length > 10) swot.threats.push('Alta competencia en la zona');
    swot.threats.push('Cambios en costos de insumos');

    return swot;
  }

  /**
   * Benchmark de métricas
   */
  async getBenchmarks(storeId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [orders, surveys] = await Promise.all([
      prisma.order.findMany({
        where: { storeId, status: 'delivered', createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.survey.findMany({
        where: { storeId, status: 'completed', createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    const myMetrics = {
      avgTicket: orders.length > 0 
        ? Math.round(orders.reduce((sum, o) => sum + o.total, 0) / orders.length)
        : 0,
      ordersPerDay: Math.round(orders.length / 30),
      avgRating: surveys.length > 0
        ? Math.round(surveys.reduce((sum, s) => sum + s.overallRating, 0) / surveys.length * 10) / 10
        : 0,
      nps: this.calculateNPS(surveys),
    };

    // Benchmarks de industria (valores de referencia)
    const industryBenchmarks = {
      avgTicket: 1500,
      ordersPerDay: 50,
      avgRating: 4.2,
      nps: 40,
    };

    return {
      myMetrics,
      industryBenchmarks,
      comparison: {
        avgTicket: myMetrics.avgTicket > industryBenchmarks.avgTicket ? 'above' : 'below',
        ordersPerDay: myMetrics.ordersPerDay > industryBenchmarks.ordersPerDay ? 'above' : 'below',
        avgRating: myMetrics.avgRating > industryBenchmarks.avgRating ? 'above' : 'below',
        nps: myMetrics.nps > industryBenchmarks.nps ? 'above' : 'below',
      },
    };
  }

  calculateNPS(surveys) {
    if (surveys.length === 0) return 0;
    const promoters = surveys.filter(s => s.overallRating >= 9).length;
    const detractors = surveys.filter(s => s.overallRating <= 6).length;
    return Math.round(((promoters - detractors) / surveys.length) * 100);
  }

  /**
   * Obtener competidores
   */
  async getCompetitors(storeId) {
    return prisma.competitor.findMany({
      where: { storeId },
      include: {
        prices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { prices: true } },
      },
    });
  }
}

export const competitorAnalysisService = new CompetitorAnalysisService();
export default competitorAnalysisService;

