/**
 * Sistema de Predicción de Demanda
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DemandPredictionService {
  /**
   * Predecir demanda para un día específico
   */
  async predictDailyDemand(storeId, targetDate) {
    const date = new Date(targetDate);
    const dayOfWeek = date.getDay();

    // Obtener histórico de los últimos 8 semanas del mismo día
    const historicalData = await this.getHistoricalData(storeId, dayOfWeek, 8);

    if (historicalData.length < 4) {
      return { prediction: null, confidence: 0, message: 'Datos insuficientes' };
    }

    // Calcular promedio ponderado (más peso a semanas recientes)
    const weights = historicalData.map((_, i) => Math.pow(0.8, i));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const predictedOrders = Math.round(
      historicalData.reduce((sum, data, i) => sum + data.orders * weights[i], 0) / totalWeight
    );

    const predictedRevenue = Math.round(
      historicalData.reduce((sum, data, i) => sum + data.revenue * weights[i], 0) / totalWeight
    );

    // Ajustar por tendencia
    const trend = this.calculateTrend(historicalData);
    const adjustedOrders = Math.round(predictedOrders * (1 + trend));
    const adjustedRevenue = Math.round(predictedRevenue * (1 + trend));

    // Calcular confianza basada en variabilidad
    const variance = this.calculateVariance(historicalData.map(d => d.orders));
    const confidence = Math.max(0, Math.min(100, 100 - variance * 2));

    return {
      date: targetDate,
      dayOfWeek: this.getDayName(dayOfWeek),
      prediction: {
        orders: adjustedOrders,
        revenue: adjustedRevenue,
        avgTicket: adjustedOrders > 0 ? Math.round(adjustedRevenue / adjustedOrders) : 0,
      },
      confidence: Math.round(confidence),
      trend: Math.round(trend * 100),
      historical: historicalData.slice(0, 4),
    };
  }

  async getHistoricalData(storeId, dayOfWeek, weeks) {
    const data = [];
    
    for (let i = 1; i <= weeks; i++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - (i * 7) + (dayOfWeek - targetDate.getDay()));
      targetDate.setHours(0, 0, 0, 0);

      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const orders = await prisma.order.findMany({
        where: {
          storeId,
          createdAt: { gte: targetDate, lt: nextDay },
          status: { in: ['delivered', 'completed'] },
        },
      });

      data.push({
        date: targetDate.toISOString().split('T')[0],
        orders: orders.length,
        revenue: orders.reduce((sum, o) => sum + o.total, 0),
      });
    }

    return data;
  }

  calculateTrend(data) {
    if (data.length < 2) return 0;
    const recent = data.slice(0, 2).reduce((sum, d) => sum + d.orders, 0) / 2;
    const older = data.slice(-2).reduce((sum, d) => sum + d.orders, 0) / 2;
    return older > 0 ? (recent - older) / older : 0;
  }

  calculateVariance(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    return Math.sqrt(variance) / (avg || 1) * 100;
  }

  getDayName(day) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[day];
  }

  /**
   * Predecir demanda por producto
   */
  async predictProductDemand(storeId, productId, days = 7) {
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: { storeId, status: 'delivered', createdAt: { gte: startDate } },
        productId,
      },
      include: { order: true },
    });

    const dailySales = {};
    orderItems.forEach(item => {
      const day = item.order.createdAt.toISOString().split('T')[0];
      dailySales[day] = (dailySales[day] || 0) + item.quantity;
    });

    const avgDaily = Object.values(dailySales).reduce((a, b) => a + b, 0) / 30;
    const predicted = Math.round(avgDaily * days);

    return {
      productId,
      period: `${days} días`,
      avgDailySales: Math.round(avgDaily * 10) / 10,
      predictedSales: predicted,
      recommendation: this.getStockRecommendation(predicted, avgDaily),
    };
  }

  getStockRecommendation(predicted, avgDaily) {
    const safetyStock = Math.ceil(avgDaily * 2);
    const recommended = predicted + safetyStock;
    return {
      minStock: safetyStock,
      recommendedStock: recommended,
      reorderPoint: Math.ceil(avgDaily * 3),
    };
  }

  /**
   * Predecir horas pico
   */
  async predictPeakHours(storeId, dayOfWeek) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: thirtyDaysAgo },
        status: 'delivered',
      },
      select: { createdAt: true },
    });

    const hourlyCount = new Array(24).fill(0);
    
    orders.forEach(order => {
      if (dayOfWeek === undefined || order.createdAt.getDay() === dayOfWeek) {
        const hour = order.createdAt.getHours();
        hourlyCount[hour]++;
      }
    });

    const maxCount = Math.max(...hourlyCount);
    const peakHours = hourlyCount
      .map((count, hour) => ({ hour, count, percentage: maxCount > 0 ? Math.round(count / maxCount * 100) : 0 }))
      .filter(h => h.percentage >= 70)
      .sort((a, b) => b.count - a.count);

    return {
      dayOfWeek: dayOfWeek !== undefined ? this.getDayName(dayOfWeek) : 'Todos',
      hourlyDistribution: hourlyCount.map((count, hour) => ({
        hour: `${hour}:00`,
        orders: count,
      })),
      peakHours: peakHours.map(h => `${h.hour}:00 - ${h.hour + 1}:00`),
      recommendations: this.getStaffingRecommendations(hourlyCount),
    };
  }

  getStaffingRecommendations(hourlyCount) {
    const recommendations = [];
    const avg = hourlyCount.reduce((a, b) => a + b, 0) / 24;

    hourlyCount.forEach((count, hour) => {
      if (count > avg * 1.5) {
        recommendations.push({
          hour: `${hour}:00`,
          action: 'increase_staff',
          message: `Considerar personal adicional de ${hour}:00 a ${hour + 1}:00`,
        });
      }
    });

    return recommendations;
  }

  /**
   * Predicción semanal completa
   */
  async getWeeklyForecast(storeId) {
    const forecast = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + i);
      
      const prediction = await this.predictDailyDemand(storeId, targetDate.toISOString().split('T')[0]);
      forecast.push(prediction);
    }

    return {
      storeId,
      generatedAt: new Date().toISOString(),
      forecast,
      summary: {
        totalPredictedOrders: forecast.reduce((sum, f) => sum + (f.prediction?.orders || 0), 0),
        totalPredictedRevenue: forecast.reduce((sum, f) => sum + (f.prediction?.revenue || 0), 0),
        avgConfidence: Math.round(forecast.reduce((sum, f) => sum + f.confidence, 0) / 7),
      },
    };
  }
}

export const demandPredictionService = new DemandPredictionService();
export default demandPredictionService;

