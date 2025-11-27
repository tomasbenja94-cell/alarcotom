/**
 * Sistema de Metas y Objetivos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class GoalsService {
  GOAL_TYPES = {
    DAILY_SALES: 'daily_sales',
    DAILY_ORDERS: 'daily_orders',
    WEEKLY_SALES: 'weekly_sales',
    MONTHLY_SALES: 'monthly_sales',
    NEW_CUSTOMERS: 'new_customers',
    AVERAGE_TICKET: 'average_ticket',
    RATING: 'rating',
    DELIVERY_TIME: 'delivery_time',
  };

  /**
   * Crear meta
   */
  async createGoal(storeId, goalData) {
    const { type, target, startDate, endDate, name, description } = goalData;

    const goal = await prisma.goal.create({
      data: {
        storeId,
        type,
        name: name || this.getDefaultName(type),
        description,
        target,
        current: 0,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'active',
      },
    });

    logger.info({ goalId: goal.id, type, target }, 'Goal created');
    return goal;
  }

  getDefaultName(type) {
    const names = {
      daily_sales: 'Meta de ventas diarias',
      daily_orders: 'Meta de pedidos diarios',
      weekly_sales: 'Meta de ventas semanales',
      monthly_sales: 'Meta de ventas mensuales',
      new_customers: 'Meta de nuevos clientes',
      average_ticket: 'Meta de ticket promedio',
      rating: 'Meta de calificación',
      delivery_time: 'Meta de tiempo de entrega',
    };
    return names[type] || 'Meta';
  }

  /**
   * Actualizar progreso de metas
   */
  async updateGoalProgress(storeId) {
    const activeGoals = await prisma.goal.findMany({
      where: {
        storeId,
        status: 'active',
        endDate: { gte: new Date() },
      },
    });

    for (const goal of activeGoals) {
      const current = await this.calculateProgress(storeId, goal);
      const progress = Math.min(100, Math.round((current / goal.target) * 100));

      await prisma.goal.update({
        where: { id: goal.id },
        data: {
          current,
          progress,
          status: current >= goal.target ? 'completed' : 'active',
          completedAt: current >= goal.target ? new Date() : null,
        },
      });

      if (current >= goal.target && goal.status !== 'completed') {
        logger.info({ goalId: goal.id }, 'Goal completed!');
      }
    }
  }

  /**
   * Calcular progreso según tipo de meta
   */
  async calculateProgress(storeId, goal) {
    const start = goal.startDate;
    const end = new Date();

    switch (goal.type) {
      case this.GOAL_TYPES.DAILY_SALES:
      case this.GOAL_TYPES.WEEKLY_SALES:
      case this.GOAL_TYPES.MONTHLY_SALES: {
        const result = await prisma.order.aggregate({
          where: {
            storeId,
            status: 'delivered',
            createdAt: { gte: start, lte: end },
          },
          _sum: { total: true },
        });
        return result._sum.total || 0;
      }

      case this.GOAL_TYPES.DAILY_ORDERS: {
        return prisma.order.count({
          where: {
            storeId,
            status: 'delivered',
            createdAt: { gte: start, lte: end },
          },
        });
      }

      case this.GOAL_TYPES.NEW_CUSTOMERS: {
        return prisma.customer.count({
          where: {
            orders: { some: { storeId } },
            createdAt: { gte: start, lte: end },
          },
        });
      }

      case this.GOAL_TYPES.AVERAGE_TICKET: {
        const result = await prisma.order.aggregate({
          where: {
            storeId,
            status: 'delivered',
            createdAt: { gte: start, lte: end },
          },
          _avg: { total: true },
        });
        return Math.round(result._avg.total || 0);
      }

      case this.GOAL_TYPES.RATING: {
        const store = await prisma.store.findUnique({
          where: { id: storeId },
          select: { averageRating: true },
        });
        return store?.averageRating || 0;
      }

      default:
        return 0;
    }
  }

  /**
   * Obtener metas de una tienda
   */
  async getStoreGoals(storeId, status = null) {
    const goals = await prisma.goal.findMany({
      where: {
        storeId,
        ...(status && { status }),
      },
      orderBy: { endDate: 'asc' },
    });

    return goals.map(goal => ({
      ...goal,
      daysRemaining: Math.max(0, Math.ceil((goal.endDate - new Date()) / (1000 * 60 * 60 * 24))),
      isOverdue: goal.endDate < new Date() && goal.status === 'active',
    }));
  }

  /**
   * Dashboard de metas
   */
  async getGoalsDashboard(storeId) {
    await this.updateGoalProgress(storeId);

    const goals = await this.getStoreGoals(storeId);
    const active = goals.filter(g => g.status === 'active');
    const completed = goals.filter(g => g.status === 'completed');

    return {
      summary: {
        total: goals.length,
        active: active.length,
        completed: completed.length,
        completionRate: goals.length > 0 ? Math.round((completed.length / goals.length) * 100) : 0,
      },
      activeGoals: active.map(g => ({
        id: g.id,
        name: g.name,
        type: g.type,
        current: g.current,
        target: g.target,
        progress: g.progress,
        daysRemaining: g.daysRemaining,
      })),
      recentlyCompleted: completed.slice(0, 5),
    };
  }

  /**
   * Crear metas automáticas basadas en histórico
   */
  async suggestGoals(storeId) {
    // Obtener promedios del último mes
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const stats = await prisma.order.aggregate({
      where: {
        storeId,
        status: 'delivered',
        createdAt: { gte: lastMonth },
      },
      _sum: { total: true },
      _avg: { total: true },
      _count: true,
    });

    const avgDailySales = (stats._sum.total || 0) / 30;
    const avgDailyOrders = stats._count / 30;

    // Sugerir metas con 10-20% de mejora
    return [
      {
        type: this.GOAL_TYPES.DAILY_SALES,
        name: 'Aumentar ventas diarias',
        target: Math.round(avgDailySales * 1.15),
        suggestion: `Basado en tu promedio de $${Math.round(avgDailySales)}/día`,
      },
      {
        type: this.GOAL_TYPES.DAILY_ORDERS,
        name: 'Más pedidos por día',
        target: Math.ceil(avgDailyOrders * 1.2),
        suggestion: `Actualmente promedias ${Math.round(avgDailyOrders)} pedidos/día`,
      },
      {
        type: this.GOAL_TYPES.AVERAGE_TICKET,
        name: 'Aumentar ticket promedio',
        target: Math.round((stats._avg.total || 0) * 1.1),
        suggestion: `Tu ticket promedio es $${Math.round(stats._avg.total || 0)}`,
      },
    ];
  }
}

export const goalsService = new GoalsService();
export default goalsService;
