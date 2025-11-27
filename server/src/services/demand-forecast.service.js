/**
 * Sistema de Predicción de Demanda
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DemandForecastService {
  /**
   * Predecir demanda para un día específico
   */
  async predictDailyDemand(storeId, targetDate) {
    const target = new Date(targetDate);
    const dayOfWeek = target.getDay();

    // Obtener datos históricos del mismo día de la semana
    const historicalData = await this.getHistoricalData(storeId, dayOfWeek, 8); // 8 semanas

    if (historicalData.length < 4) {
      return this.getDefaultPrediction(storeId);
    }

    // Calcular predicción base
    const avgOrders = this.calculateWeightedAverage(historicalData.map(d => d.orders));
    const avgRevenue = this.calculateWeightedAverage(historicalData.map(d => d.revenue));

    // Ajustar por tendencia
    const trend = this.calculateTrend(historicalData);

    // Ajustar por estacionalidad (si es fin de semana, feriado, etc.)
    const seasonalFactor = this.getSeasonalFactor(target);

    // Predicción por hora
    const hourlyPrediction = await this.predictHourlyDemand(storeId, dayOfWeek);

    return {
      date: target.toISOString().split('T')[0],
      dayOfWeek: this.getDayName(dayOfWeek),
      predictions: {
        orders: Math.round(avgOrders * (1 + trend) * seasonalFactor),
        revenue: Math.round(avgRevenue * (1 + trend) * seasonalFactor),
        avgTicket: Math.round(avgRevenue / avgOrders),
      },
      hourly: hourlyPrediction,
      confidence: this.calculateConfidence(historicalData),
      factors: { trend, seasonalFactor },
    };
  }

  /**
   * Obtener datos históricos
   */
  async getHistoricalData(storeId, dayOfWeek, weeks) {
    const data = [];

    for (let i = 1; i <= weeks; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (i * 7) + (dayOfWeek - date.getDay()));
      
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      const stats = await prisma.order.aggregate({
        where: {
          storeId,
          createdAt: { gte: startOfDay, lte: endOfDay },
          status: 'delivered',
        },
        _count: { _all: true },
        _sum: { total: true },
      });

      data.push({
        date: startOfDay,
        orders: stats._count._all,
        revenue: stats._sum.total || 0,
        weeksAgo: i,
      });
    }

    return data;
  }

  /**
   * Promedio ponderado (más peso a datos recientes)
   */
  calculateWeightedAverage(values) {
    if (values.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    values.forEach((value, index) => {
      const weight = values.length - index; // Más peso a los más recientes
      weightedSum += value * weight;
      totalWeight += weight;
    });

    return weightedSum / totalWeight;
  }

  /**
   * Calcular tendencia
   */
  calculateTrend(data) {
    if (data.length < 2) return 0;

    // Regresión lineal simple
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    data.forEach((d, i) => {
      sumX += i;
      sumY += d.orders;
      sumXY += i * d.orders;
      sumX2 += i * i;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgOrders = sumY / n;

    // Retornar como porcentaje de cambio semanal
    return avgOrders > 0 ? slope / avgOrders : 0;
  }

  /**
   * Factor estacional
   */
  getSeasonalFactor(date) {
    const dayOfWeek = date.getDay();
    const month = date.getMonth();

    let factor = 1.0;

    // Fin de semana
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      factor *= 1.2;
    }

    // Viernes
    if (dayOfWeek === 5) {
      factor *= 1.15;
    }

    // Diciembre (fiestas)
    if (month === 11) {
      factor *= 1.3;
    }

    // Enero/Febrero (vacaciones)
    if (month === 0 || month === 1) {
      factor *= 0.85;
    }

    return factor;
  }

  /**
   * Predicción por hora
   */
  async predictHourlyDemand(storeId, dayOfWeek) {
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: fourWeeksAgo },
        status: 'delivered',
      },
      select: { createdAt: true },
    });

    // Filtrar por día de la semana
    const sameDayOrders = orders.filter(o => 
      new Date(o.createdAt).getDay() === dayOfWeek
    );

    // Agrupar por hora
    const hourlyCount = Array(24).fill(0);
    sameDayOrders.forEach(order => {
      const hour = new Date(order.createdAt).getHours();
      hourlyCount[hour]++;
    });

    // Normalizar (promedio por semana)
    const weeks = 4;
    return hourlyCount.map((count, hour) => ({
      hour,
      predicted: Math.round(count / weeks),
      label: `${hour}:00`,
    }));
  }

  /**
   * Calcular confianza de la predicción
   */
  calculateConfidence(data) {
    if (data.length < 4) return 'low';
    if (data.length < 6) return 'medium';

    // Calcular variabilidad
    const orders = data.map(d => d.orders);
    const avg = orders.reduce((a, b) => a + b, 0) / orders.length;
    const variance = orders.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / orders.length;
    const cv = Math.sqrt(variance) / avg; // Coeficiente de variación

    if (cv < 0.2) return 'high';
    if (cv < 0.4) return 'medium';
    return 'low';
  }

  /**
   * Predicción de productos más vendidos
   */
  async predictTopProducts(storeId, targetDate) {
    const target = new Date(targetDate);
    const dayOfWeek = target.getDay();
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

    // Obtener ventas históricas por producto
    const sales = await prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      where: {
        order: {
          storeId,
          createdAt: { gte: fourWeeksAgo },
          status: 'delivered',
        },
      },
      _sum: { quantity: true },
      _count: { _all: true },
    });

    // Ordenar por cantidad
    const sorted = sales
      .map(s => ({
        productId: s.productId,
        productName: s.productName,
        predictedQuantity: Math.round((s._sum.quantity || 0) / 4), // Promedio semanal
        orders: s._count._all,
      }))
      .sort((a, b) => b.predictedQuantity - a.predictedQuantity)
      .slice(0, 10);

    return sorted;
  }

  /**
   * Sugerencias de inventario
   */
  async getInventorySuggestions(storeId, daysAhead = 7) {
    const predictions = [];

    for (let i = 0; i < daysAhead; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      const dayPrediction = await this.predictDailyDemand(storeId, date);
      const topProducts = await this.predictTopProducts(storeId, date);
      
      predictions.push({
        date: date.toISOString().split('T')[0],
        ...dayPrediction.predictions,
        topProducts: topProducts.slice(0, 5),
      });
    }

    // Calcular necesidades de inventario
    const productNeeds = {};
    predictions.forEach(day => {
      day.topProducts.forEach(product => {
        if (!productNeeds[product.productId]) {
          productNeeds[product.productId] = {
            productName: product.productName,
            totalNeeded: 0,
          };
        }
        productNeeds[product.productId].totalNeeded += product.predictedQuantity;
      });
    });

    // Comparar con stock actual
    const products = await prisma.product.findMany({
      where: { id: { in: Object.keys(productNeeds) } },
      select: { id: true, name: true, stock: true },
    });

    const suggestions = products.map(p => ({
      productId: p.id,
      productName: p.name,
      currentStock: p.stock || 0,
      predictedNeed: productNeeds[p.id]?.totalNeeded || 0,
      shortage: Math.max(0, (productNeeds[p.id]?.totalNeeded || 0) - (p.stock || 0)),
    })).filter(s => s.shortage > 0);

    return {
      predictions,
      inventorySuggestions: suggestions.sort((a, b) => b.shortage - a.shortage),
    };
  }

  /**
   * Predicción por defecto
   */
  async getDefaultPrediction(storeId) {
    // Usar promedios generales si no hay suficientes datos
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const stats = await prisma.order.aggregate({
      where: {
        storeId,
        createdAt: { gte: lastMonth },
        status: 'delivered',
      },
      _count: { _all: true },
      _sum: { total: true },
    });

    const avgDaily = Math.round(stats._count._all / 30);
    const avgRevenue = Math.round((stats._sum.total || 0) / 30);

    return {
      predictions: {
        orders: avgDaily,
        revenue: avgRevenue,
        avgTicket: avgDaily > 0 ? Math.round(avgRevenue / avgDaily) : 0,
      },
      confidence: 'low',
      message: 'Predicción basada en promedios generales. Se necesitan más datos históricos.',
    };
  }

  getDayName(dayOfWeek) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayOfWeek];
  }
}

export const demandForecastService = new DemandForecastService();
export default demandForecastService;

