/**
 * Sistema de Encuestas Personalizadas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class SurveysService {
  QUESTION_TYPES = {
    RATING: 'rating',
    NPS: 'nps',
    MULTIPLE_CHOICE: 'multiple_choice',
    SINGLE_CHOICE: 'single_choice',
    TEXT: 'text',
    EMOJI: 'emoji',
    SCALE: 'scale',
  };

  /**
   * Crear encuesta
   */
  async createSurvey(storeId, surveyData) {
    const {
      title, description, questions, trigger,
      triggerConditions, rewardPoints, isActive,
    } = surveyData;

    const survey = await prisma.survey.create({
      data: {
        storeId,
        title,
        description,
        questions: JSON.stringify(questions),
        trigger, // 'after_order', 'after_delivery', 'periodic', 'manual'
        triggerConditions: JSON.stringify(triggerConditions || {}),
        rewardPoints: rewardPoints || 0,
        isActive: isActive ?? true,
      },
    });

    logger.info({ surveyId: survey.id, title }, 'Survey created');
    return survey;
  }

  /**
   * Obtener encuesta para cliente
   */
  async getSurveyForCustomer(customerId, trigger, context = {}) {
    const surveys = await prisma.survey.findMany({
      where: { trigger, isActive: true },
    });

    for (const survey of surveys) {
      const conditions = JSON.parse(survey.triggerConditions || '{}');
      
      // Verificar si ya respondió recientemente
      const recentResponse = await prisma.surveyResponse.findFirst({
        where: {
          surveyId: survey.id,
          customerId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });

      if (recentResponse) continue;

      // Verificar condiciones
      if (this.evaluateConditions(conditions, context)) {
        return {
          ...survey,
          questions: JSON.parse(survey.questions),
        };
      }
    }

    return null;
  }

  evaluateConditions(conditions, context) {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    if (conditions.minOrderCount) {
      if ((context.orderCount || 0) < conditions.minOrderCount) return false;
    }
    if (conditions.minOrderAmount) {
      if ((context.orderAmount || 0) < conditions.minOrderAmount) return false;
    }
    if (conditions.orderStatus) {
      if (context.orderStatus !== conditions.orderStatus) return false;
    }

    return true;
  }

  /**
   * Enviar respuesta de encuesta
   */
  async submitResponse(surveyId, customerId, answers, orderId = null) {
    const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
    if (!survey) throw new Error('Encuesta no encontrada');

    const questions = JSON.parse(survey.questions);
    const processedAnswers = this.processAnswers(questions, answers);

    const response = await prisma.surveyResponse.create({
      data: {
        surveyId,
        customerId,
        orderId,
        answers: JSON.stringify(processedAnswers),
        completedAt: new Date(),
      },
    });

    // Otorgar puntos de recompensa
    if (survey.rewardPoints > 0 && customerId) {
      await prisma.customerLoyalty.upsert({
        where: { customerId },
        update: { totalPoints: { increment: survey.rewardPoints } },
        create: { customerId, totalPoints: survey.rewardPoints },
      });
    }

    // Analizar sentimiento si hay respuestas de texto
    const textAnswers = processedAnswers.filter(a => a.type === 'text' && a.value);
    if (textAnswers.length > 0) {
      const sentiment = this.analyzeSentiment(textAnswers.map(a => a.value).join(' '));
      await prisma.surveyResponse.update({
        where: { id: response.id },
        data: { sentiment },
      });
    }

    logger.info({ surveyId, customerId, responseId: response.id }, 'Survey response submitted');
    return { response, rewardPoints: survey.rewardPoints };
  }

  processAnswers(questions, answers) {
    return questions.map((q, i) => ({
      questionId: q.id || i,
      question: q.text,
      type: q.type,
      value: answers[i],
      score: this.calculateScore(q, answers[i]),
    }));
  }

  calculateScore(question, answer) {
    switch (question.type) {
      case this.QUESTION_TYPES.RATING:
      case this.QUESTION_TYPES.SCALE:
        return typeof answer === 'number' ? answer : null;
      case this.QUESTION_TYPES.NPS:
        return typeof answer === 'number' ? answer : null;
      case this.QUESTION_TYPES.EMOJI:
        const emojiScores = { '😡': 1, '😕': 2, '😐': 3, '😊': 4, '😍': 5 };
        return emojiScores[answer] || null;
      default:
        return null;
    }
  }

  analyzeSentiment(text) {
    const positiveWords = ['excelente', 'bueno', 'genial', 'delicioso', 'rápido', 'recomiendo'];
    const negativeWords = ['malo', 'lento', 'frío', 'horrible', 'nunca', 'peor'];

    const words = text.toLowerCase().split(/\s+/);
    let score = 0;

    words.forEach(word => {
      if (positiveWords.some(p => word.includes(p))) score++;
      if (negativeWords.some(n => word.includes(n))) score--;
    });

    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'neutral';
  }

  /**
   * Obtener resultados de encuesta
   */
  async getSurveyResults(surveyId) {
    const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
    const responses = await prisma.surveyResponse.findMany({
      where: { surveyId },
    });

    const questions = JSON.parse(survey.questions);
    const results = questions.map((q, i) => {
      const questionResponses = responses
        .map(r => JSON.parse(r.answers)[i])
        .filter(a => a !== undefined && a !== null);

      return {
        question: q.text,
        type: q.type,
        responseCount: questionResponses.length,
        ...this.aggregateResponses(q.type, questionResponses),
      };
    });

    const npsQuestion = results.find(r => r.type === this.QUESTION_TYPES.NPS);
    let npsScore = null;
    if (npsQuestion) {
      npsScore = this.calculateNPS(responses.map(r => {
        const answers = JSON.parse(r.answers);
        const npsAnswer = answers.find(a => a.type === 'nps');
        return npsAnswer?.value;
      }).filter(v => v !== undefined));
    }

    return {
      survey: { id: survey.id, title: survey.title },
      totalResponses: responses.length,
      npsScore,
      sentimentBreakdown: {
        positive: responses.filter(r => r.sentiment === 'positive').length,
        neutral: responses.filter(r => r.sentiment === 'neutral').length,
        negative: responses.filter(r => r.sentiment === 'negative').length,
      },
      questions: results,
    };
  }

  aggregateResponses(type, responses) {
    switch (type) {
      case this.QUESTION_TYPES.RATING:
      case this.QUESTION_TYPES.SCALE:
      case this.QUESTION_TYPES.NPS:
        const scores = responses.map(r => r.score || r.value).filter(s => typeof s === 'number');
        return {
          average: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null,
          distribution: this.getDistribution(scores),
        };
      case this.QUESTION_TYPES.SINGLE_CHOICE:
      case this.QUESTION_TYPES.MULTIPLE_CHOICE:
        const choices = {};
        responses.forEach(r => {
          const values = Array.isArray(r.value) ? r.value : [r.value];
          values.forEach(v => {
            choices[v] = (choices[v] || 0) + 1;
          });
        });
        return { choices };
      case this.QUESTION_TYPES.EMOJI:
        const emojis = {};
        responses.forEach(r => {
          emojis[r.value] = (emojis[r.value] || 0) + 1;
        });
        return { emojis };
      default:
        return { textResponses: responses.slice(0, 10).map(r => r.value) };
    }
  }

  getDistribution(scores) {
    const dist = {};
    scores.forEach(s => {
      dist[s] = (dist[s] || 0) + 1;
    });
    return dist;
  }

  calculateNPS(scores) {
    const valid = scores.filter(s => typeof s === 'number');
    if (valid.length === 0) return null;

    const promoters = valid.filter(s => s >= 9).length;
    const detractors = valid.filter(s => s <= 6).length;

    return Math.round(((promoters - detractors) / valid.length) * 100);
  }

  /**
   * Crear plantillas de encuesta
   */
  getTemplates() {
    return {
      post_order: {
        title: 'Encuesta Post-Pedido',
        questions: [
          { type: 'emoji', text: '¿Cómo calificarías tu experiencia?', options: ['😡', '😕', '😐', '😊', '😍'] },
          { type: 'rating', text: 'Calidad de la comida', min: 1, max: 5 },
          { type: 'rating', text: 'Tiempo de entrega', min: 1, max: 5 },
          { type: 'nps', text: '¿Qué tan probable es que nos recomiendes?', min: 0, max: 10 },
          { type: 'text', text: '¿Algún comentario adicional?', optional: true },
        ],
      },
      delivery_feedback: {
        title: 'Feedback de Delivery',
        questions: [
          { type: 'rating', text: 'Puntualidad del repartidor', min: 1, max: 5 },
          { type: 'rating', text: 'Amabilidad del repartidor', min: 1, max: 5 },
          { type: 'rating', text: 'Estado del pedido al llegar', min: 1, max: 5 },
          { type: 'single_choice', text: '¿El pedido llegó completo?', options: ['Sí', 'No'] },
        ],
      },
      product_feedback: {
        title: 'Opinión del Producto',
        questions: [
          { type: 'rating', text: 'Sabor', min: 1, max: 5 },
          { type: 'rating', text: 'Presentación', min: 1, max: 5 },
          { type: 'rating', text: 'Relación calidad-precio', min: 1, max: 5 },
          { type: 'single_choice', text: '¿Lo pedirías de nuevo?', options: ['Sí', 'Tal vez', 'No'] },
        ],
      },
    };
  }
}

export const surveysService = new SurveysService();
export default surveysService;
