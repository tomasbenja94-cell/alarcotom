/**
 * Sistema de Análisis de Cohortes
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class CohortAnalysisService {
  /**
   * Análisis de retención por cohorte
   */
  async getRetentionCohorts(storeId, months = 6) {
    const cohorts = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const cohortStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const cohortEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      // Clientes que hicieron su primera compra en este mes
      const newCustomers = await prisma.order.findMany({
        where: {
          storeId,
          status: 'delivered',
          createdAt: { gte: cohortStart, lte: cohortEnd },
        },
        select: { customerId: true, createdAt: true },
      });

      // Agrupar por cliente y encontrar primera compra
      const customerFirstOrder = {};
      newCustomers.forEach(order => {
        if (!customerFirstOrder[order.customerId] || order.createdAt < customerFirstOrder[order.customerId]) {
          customerFirstOrder[order.customerId] = order.createdAt;
        }
      });

      const cohortCustomers = Object.entries(customerFirstOrder)
        .filter(([_, date]) => date >= cohortStart && date <= cohortEnd)
        .map(([customerId]) => customerId);

      const cohortSize = cohortCustomers.length;
      if (cohortSize === 0) continue;

      // Calcular retención para cada mes siguiente
      const retention = [];
      for (let j = 0; j <= i; j++) {
        const periodStart = new Date(now.getFullYear(), now.getMonth() - i + j, 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() - i + j + 1, 0, 23, 59, 59);

        const activeInPeriod = await prisma.order.findMany({
          where: {
            storeId,
            customerId: { in: cohortCustomers },
            status: 'delivered',
            createdAt: { gte: periodStart, lte: periodEnd },
          },
          select: { customerId: true },
          distinct: ['customerId'],
        });

        retention.push({
          month: j,
          active: activeInPeriod.length,
          rate: Math.round((activeInPeriod.length / cohortSize) * 100),
        });
      }

      cohorts.push({
        cohortMonth: cohortStart.toISOString().substring(0, 7),
        cohortSize,
        retention,
      });
    }

    return cohorts;
  }

  /**
   * Análisis de valor de cliente por cohorte
   */
  async getLTVCohorts(storeId, months = 6) {
    const cohorts = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const cohortStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const cohortEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      // Encontrar clientes de la cohorte
      const firstOrders = await prisma.order.groupBy({
        by: ['customerId'],
        where: { storeId, status: 'delivered' },
        _min: { createdAt: true },
      });

      const cohortCustomers = firstOrders
        .filter(o => o._min.createdAt >= cohortStart && o._min.createdAt <= cohortEnd)
        .map(o => o.customerId);

      if (cohortCustomers.length === 0) continue;

      // Calcular LTV acumulado por mes
      const ltvByMonth = [];
      let cumulativeLTV = 0;

      for (let j = 0; j <= i; j++) {
        const periodStart = new Date(now.getFullYear(), now.getMonth() - i + j, 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() - i + j + 1, 0, 23, 59, 59);

        const periodRevenue = await prisma.order.aggregate({
          where: {
            storeId,
            customerId: { in: cohortCustomers },
            status: 'delivered',
            createdAt: { gte: periodStart, lte: periodEnd },
          },
          _sum: { total: true },
        });

        const monthRevenue = periodRevenue._sum.total || 0;
        cumulativeLTV += monthRevenue;

        ltvByMonth.push({
          month: j,
          revenue: monthRevenue,
          cumulativeLTV,
          avgLTV: Math.round(cumulativeLTV / cohortCustomers.length),
        });
      }

      cohorts.push({
        cohortMonth: cohortStart.toISOString().substring(0, 7),
        cohortSize: cohortCustomers.length,
        totalRevenue: cumulativeLTV,
        avgLTV: Math.round(cumulativeLTV / cohortCustomers.length),
        ltvByMonth,
      });
    }

    return cohorts;
  }

  /**
   * Análisis de frecuencia de compra
   */
  async getFrequencyCohorts(storeId, months = 6) {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);

    const customers = await prisma.order.groupBy({
      by: ['customerId'],
      where: {
        storeId,
        status: 'delivered',
        createdAt: { gte: startDate },
      },
      _count: true,
      _sum: { total: true },
    });

    // Segmentar por frecuencia
    const segments = {
      oneTime: { count: 0, totalRevenue: 0 },
      occasional: { count: 0, totalRevenue: 0 },    // 2-3 pedidos
      regular: { count: 0, totalRevenue: 0 },       // 4-7 pedidos
      frequent: { count: 0, totalRevenue: 0 },      // 8-15 pedidos
      vip: { count: 0, totalRevenue: 0 },           // 16+ pedidos
    };

    customers.forEach(c => {
      const revenue = c._sum.total || 0;
      if (c._count === 1) {
        segments.oneTime.count++;
        segments.oneTime.totalRevenue += revenue;
      } else if (c._count <= 3) {
        segments.occasional.count++;
        segments.occasional.totalRevenue += revenue;
      } else if (c._count <= 7) {
        segments.regular.count++;
        segments.regular.totalRevenue += revenue;
      } else if (c._count <= 15) {
        segments.frequent.count++;
        segments.frequent.totalRevenue += revenue;
      } else {
        segments.vip.count++;
        segments.vip.totalRevenue += revenue;
      }
    });

    const totalCustomers = customers.length;
    const totalRevenue = customers.reduce((sum, c) => sum + (c._sum.total || 0), 0);

    return {
      period: `${months} meses`,
      totalCustomers,
      totalRevenue,
      segments: Object.entries(segments).map(([name, data]) => ({
        segment: name,
        customers: data.count,
        customerPercent: totalCustomers > 0 ? Math.round((data.count / totalCustomers) * 100) : 0,
        revenue: data.totalRevenue,
        revenuePercent: totalRevenue > 0 ? Math.round((data.totalRevenue / totalRevenue) * 100) : 0,
        avgRevenue: data.count > 0 ? Math.round(data.totalRevenue / data.count) : 0,
      })),
    };
  }

  /**
   * Análisis de churn por cohorte
   */
  async getChurnAnalysis(storeId, inactiveDays = 30) {
    const threshold = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

    // Clientes activos (compraron recientemente)
    const activeCustomers = await prisma.order.findMany({
      where: {
        storeId,
        status: 'delivered',
        createdAt: { gte: threshold },
      },
      select: { customerId: true },
      distinct: ['customerId'],
    });

    const activeIds = new Set(activeCustomers.map(c => c.customerId));

    // Todos los clientes históricos
    const allCustomers = await prisma.order.findMany({
      where: { storeId, status: 'delivered' },
      select: { customerId: true },
      distinct: ['customerId'],
    });

    const churned = allCustomers.filter(c => !activeIds.has(c.customerId));

    // Analizar churned por última compra
    const churnedDetails = await Promise.all(
      churned.slice(0, 100).map(async c => {
        const lastOrder = await prisma.order.findFirst({
          where: { customerId: c.customerId, storeId, status: 'delivered' },
          orderBy: { createdAt: 'desc' },
        });

        const totalOrders = await prisma.order.count({
          where: { customerId: c.customerId, storeId, status: 'delivered' },
        });

        return {
          customerId: c.customerId,
          lastOrderDate: lastOrder?.createdAt,
          daysSinceLastOrder: lastOrder
            ? Math.floor((Date.now() - lastOrder.createdAt.getTime()) / (24 * 60 * 60 * 1000))
            : null,
          totalOrders,
        };
      })
    );

    return {
      totalCustomers: allCustomers.length,
      activeCustomers: activeCustomers.length,
      churnedCustomers: churned.length,
      churnRate: Math.round((churned.length / allCustomers.length) * 100),
      inactiveDays,
      churnedSample: churnedDetails.slice(0, 20),
    };
  }

  /**
   * Análisis de canal de adquisición
   */
  async getAcquisitionCohorts(storeId, months = 6) {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);

    const customers = await prisma.customer.findMany({
      where: {
        orders: { some: { storeId, createdAt: { gte: startDate } } },
      },
      include: {
        orders: {
          where: { storeId, status: 'delivered' },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    const bySource = {};

    customers.forEach(c => {
      const source = c.acquisitionSource || 'direct';
      if (!bySource[source]) {
        bySource[source] = { customers: 0, revenue: 0, orders: [] };
      }
      bySource[source].customers++;
    });

    // Calcular revenue por fuente
    for (const source of Object.keys(bySource)) {
      const sourceCustomers = customers.filter(c => (c.acquisitionSource || 'direct') === source);
      const revenue = await prisma.order.aggregate({
        where: {
          storeId,
          customerId: { in: sourceCustomers.map(c => c.id) },
          status: 'delivered',
        },
        _sum: { total: true },
      });
      bySource[source].revenue = revenue._sum.total || 0;
      bySource[source].avgLTV = bySource[source].customers > 0
        ? Math.round(bySource[source].revenue / bySource[source].customers)
        : 0;
    }

    return {
      period: `${months} meses`,
      totalCustomers: customers.length,
      bySource: Object.entries(bySource).map(([source, data]) => ({
        source,
        ...data,
      })).sort((a, b) => b.revenue - a.revenue),
    };
  }

  /**
   * Resumen ejecutivo de cohortes
   */
  async getCohortSummary(storeId) {
    const [retention, ltv, frequency, churn] = await Promise.all([
      this.getRetentionCohorts(storeId, 3),
      this.getLTVCohorts(storeId, 3),
      this.getFrequencyCohorts(storeId, 3),
      this.getChurnAnalysis(storeId, 30),
    ]);

    // Calcular métricas clave
    const avgRetentionMonth1 = retention.length > 0
      ? Math.round(retention.reduce((sum, c) => sum + (c.retention[1]?.rate || 0), 0) / retention.length)
      : 0;

    const avgLTV = ltv.length > 0
      ? Math.round(ltv.reduce((sum, c) => sum + c.avgLTV, 0) / ltv.length)
      : 0;

    return {
      keyMetrics: {
        avgRetentionMonth1: `${avgRetentionMonth1}%`,
        avgLTV: `$${avgLTV}`,
        churnRate: `${churn.churnRate}%`,
        vipCustomers: frequency.segments.find(s => s.segment === 'vip')?.customers || 0,
      },
      insights: this.generateInsights(retention, ltv, frequency, churn),
    };
  }

  generateInsights(retention, ltv, frequency, churn) {
    const insights = [];

    if (churn.churnRate > 50) {
      insights.push({ type: 'warning', message: 'Alta tasa de churn. Considerar programa de reactivación.' });
    }

    const vipSegment = frequency.segments.find(s => s.segment === 'vip');
    if (vipSegment && vipSegment.revenuePercent > 50) {
      insights.push({ type: 'info', message: `Los clientes VIP generan ${vipSegment.revenuePercent}% de los ingresos.` });
    }

    const oneTimeSegment = frequency.segments.find(s => s.segment === 'oneTime');
    if (oneTimeSegment && oneTimeSegment.customerPercent > 60) {
      insights.push({ type: 'warning', message: 'Muchos clientes de una sola compra. Mejorar retención.' });
    }

    return insights;
  }
}

export const cohortAnalysisService = new CohortAnalysisService();
export default cohortAnalysisService;

