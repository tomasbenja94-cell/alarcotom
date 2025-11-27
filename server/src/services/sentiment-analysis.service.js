/**
 * Sistema de Análisis de Sentimiento
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class SentimentAnalysisService {
  // Diccionarios de palabras
  POSITIVE_WORDS = [
    'excelente', 'increíble', 'delicioso', 'rico', 'bueno', 'genial', 'perfecto',
    'rápido', 'fresco', 'caliente', 'recomiendo', 'volvería', 'mejor', 'fantástico',
    'espectacular', 'maravilloso', 'encantó', 'encanta', 'amor', 'feliz', 'satisfecho',
    'atento', 'amable', 'profesional', 'limpio', 'puntual', 'sabroso', 'abundante',
  ];

  NEGATIVE_WORDS = [
    'malo', 'horrible', 'pésimo', 'frío', 'lento', 'tardó', 'demora', 'feo',
    'sucio', 'caro', 'pequeño', 'poco', 'nunca', 'peor', 'decepción', 'decepcionado',
    'incompleto', 'faltaba', 'equivocado', 'error', 'queja', 'reclamo', 'enojado',
    'molesto', 'desagradable', 'asqueroso', 'incomible', 'crudo', 'quemado',
  ];

  INTENSIFIERS = ['muy', 'super', 'demasiado', 'bastante', 'extremadamente', 'totalmente'];
  NEGATORS = ['no', 'nunca', 'jamás', 'tampoco', 'ni'];

  /**
   * Analizar sentimiento de texto
   */
  analyzeText(text) {
    const words = text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
      .split(/\s+/);

    let score = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    const keywords = { positive: [], negative: [] };
    let isNegated = false;
    let intensifier = 1;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Detectar negadores
      if (this.NEGATORS.includes(word)) {
        isNegated = true;
        continue;
      }

      // Detectar intensificadores
      if (this.INTENSIFIERS.includes(word)) {
        intensifier = 1.5;
        continue;
      }

      // Evaluar palabra
      if (this.POSITIVE_WORDS.some(pw => word.includes(pw))) {
        const value = isNegated ? -1 : 1;
        score += value * intensifier;
        if (value > 0) {
          positiveCount++;
          keywords.positive.push(word);
        } else {
          negativeCount++;
          keywords.negative.push(word);
        }
      } else if (this.NEGATIVE_WORDS.some(nw => word.includes(nw))) {
        const value = isNegated ? 1 : -1;
        score += value * intensifier;
        if (value < 0) {
          negativeCount++;
          keywords.negative.push(word);
        } else {
          positiveCount++;
          keywords.positive.push(word);
        }
      }

      // Reset después de usar
      isNegated = false;
      intensifier = 1;
    }

    // Normalizar score a -1 a 1
    const totalWords = positiveCount + negativeCount;
    const normalizedScore = totalWords > 0 ? score / totalWords : 0;

    return {
      score: Math.max(-1, Math.min(1, normalizedScore)),
      sentiment: normalizedScore > 0.2 ? 'positive' : normalizedScore < -0.2 ? 'negative' : 'neutral',
      confidence: Math.min(100, totalWords * 20),
      keywords,
      metrics: { positiveCount, negativeCount },
    };
  }

  /**
   * Analizar review y guardar resultado
   */
  async analyzeReview(reviewId) {
    const review = await prisma.storeReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new Error('Review no encontrada');

    const analysis = this.analyzeText(review.comment || '');

    // Combinar con rating numérico
    const ratingScore = (review.rating - 3) / 2; // Convertir 1-5 a -1 a 1
    const combinedScore = (analysis.score + ratingScore) / 2;

    await prisma.storeReview.update({
      where: { id: reviewId },
      data: {
        sentimentScore: combinedScore,
        sentiment: combinedScore > 0.2 ? 'positive' : combinedScore < -0.2 ? 'negative' : 'neutral',
        sentimentKeywords: JSON.stringify(analysis.keywords),
      },
    });

    return { reviewId, ...analysis, combinedScore };
  }

  /**
   * Análisis de sentimiento de tienda
   */
  async getStoreSentimentAnalysis(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const reviews = await prisma.storeReview.findMany({
      where: { storeId, createdAt: { gte: startDate } },
    });

    // Analizar todas las reviews
    const analyses = reviews.map(r => ({
      ...this.analyzeText(r.comment || ''),
      rating: r.rating,
      date: r.createdAt,
    }));

    // Calcular métricas
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    let totalScore = 0;
    const allKeywords = { positive: {}, negative: {} };

    analyses.forEach(a => {
      sentimentCounts[a.sentiment]++;
      totalScore += a.score;

      a.keywords.positive.forEach(k => {
        allKeywords.positive[k] = (allKeywords.positive[k] || 0) + 1;
      });
      a.keywords.negative.forEach(k => {
        allKeywords.negative[k] = (allKeywords.negative[k] || 0) + 1;
      });
    });

    // Tendencia por semana
    const weeklyTrend = this.calculateWeeklyTrend(analyses);

    return {
      period: `${days} días`,
      totalReviews: reviews.length,
      avgScore: reviews.length > 0 ? Math.round((totalScore / reviews.length) * 100) / 100 : 0,
      sentimentDistribution: {
        positive: { count: sentimentCounts.positive, percent: Math.round((sentimentCounts.positive / reviews.length) * 100) || 0 },
        neutral: { count: sentimentCounts.neutral, percent: Math.round((sentimentCounts.neutral / reviews.length) * 100) || 0 },
        negative: { count: sentimentCounts.negative, percent: Math.round((sentimentCounts.negative / reviews.length) * 100) || 0 },
      },
      topPositiveKeywords: Object.entries(allKeywords.positive)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count })),
      topNegativeKeywords: Object.entries(allKeywords.negative)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count })),
      weeklyTrend,
    };
  }

  calculateWeeklyTrend(analyses) {
    const weeks = {};

    analyses.forEach(a => {
      const weekStart = this.getWeekStart(a.date);
      if (!weeks[weekStart]) {
        weeks[weekStart] = { scores: [], count: 0 };
      }
      weeks[weekStart].scores.push(a.score);
      weeks[weekStart].count++;
    });

    return Object.entries(weeks)
      .map(([week, data]) => ({
        week,
        avgScore: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.count) * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }

  getWeekStart(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
  }

  /**
   * Detectar temas recurrentes
   */
  async detectTopics(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const reviews = await prisma.storeReview.findMany({
      where: { storeId, createdAt: { gte: startDate }, comment: { not: null } },
    });

    const topics = {
      food_quality: { positive: 0, negative: 0, keywords: ['comida', 'sabor', 'rico', 'fresco', 'calidad'] },
      delivery: { positive: 0, negative: 0, keywords: ['entrega', 'delivery', 'repartidor', 'llegó', 'demora'] },
      service: { positive: 0, negative: 0, keywords: ['atención', 'servicio', 'amable', 'trato'] },
      price: { positive: 0, negative: 0, keywords: ['precio', 'caro', 'barato', 'económico', 'valor'] },
      packaging: { positive: 0, negative: 0, keywords: ['empaque', 'envase', 'presentación', 'packaging'] },
    };

    reviews.forEach(review => {
      const text = review.comment.toLowerCase();
      const sentiment = this.analyzeText(text);

      Object.entries(topics).forEach(([topic, data]) => {
        if (data.keywords.some(k => text.includes(k))) {
          if (sentiment.sentiment === 'positive') {
            topics[topic].positive++;
          } else if (sentiment.sentiment === 'negative') {
            topics[topic].negative++;
          }
        }
      });
    });

    return Object.entries(topics).map(([topic, data]) => ({
      topic,
      mentions: data.positive + data.negative,
      positive: data.positive,
      negative: data.negative,
      sentiment: data.positive > data.negative ? 'positive' : data.negative > data.positive ? 'negative' : 'neutral',
    })).filter(t => t.mentions > 0).sort((a, b) => b.mentions - a.mentions);
  }

  /**
   * Alertas de sentimiento negativo
   */
  async getNegativeSentimentAlerts(storeId) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const negativeReviews = await prisma.storeReview.findMany({
      where: {
        storeId,
        createdAt: { gte: oneDayAgo },
        OR: [
          { rating: { lte: 2 } },
          { sentiment: 'negative' },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return negativeReviews.map(r => ({
      reviewId: r.id,
      rating: r.rating,
      comment: r.comment?.substring(0, 100) + (r.comment?.length > 100 ? '...' : ''),
      sentiment: r.sentiment,
      createdAt: r.createdAt,
      requiresResponse: !r.responseAt,
    }));
  }
}

export const sentimentAnalysisService = new SentimentAnalysisService();
export default sentimentAnalysisService;

