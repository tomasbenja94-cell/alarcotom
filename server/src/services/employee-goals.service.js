/**
 * Sistema de Metas por Empleado
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class EmployeeGoalsService {
  GOAL_TYPES = {
    SALES: 'sales',
    ORDERS: 'orders',
    DELIVERIES: 'deliveries',
    RATING: 'rating',
    UPSELLS: 'upsells',
    ATTENDANCE: 'attendance',
    TRAINING: 'training',
  };

  /**
   * Crear meta para empleado
   */
  async createGoal(employeeId, goalData) {
    const {
      type, targetValue, period, startDate, endDate,
      bonusAmount, bonusType, description,
    } = goalData;

    const goal = await prisma.employeeGoal.create({
      data: {
        employeeId,
        type,
        targetValue,
        currentValue: 0,
        period, // 'daily', 'weekly', 'monthly', 'quarterly'
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        bonusAmount,
        bonusType, // 'fixed', 'percentage'
        description,
        status: 'active',
      },
    });

    logger.info({ goalId: goal.id, employeeId, type }, 'Employee goal created');
    return goal;
  }

  /**
   * Crear metas masivas para equipo
   */
  async createTeamGoals(storeId, role, goalTemplate) {
    const employees = await prisma.employee.findMany({
      where: { storeId, role, isActive: true },
    });

    const goals = [];
    for (const emp of employees) {
      const goal = await this.createGoal(emp.id, goalTemplate);
      goals.push(goal);
    }

    return { created: goals.length, goals };
  }

  /**
   * Actualizar progreso de meta
   */
  async updateProgress(goalId, increment) {
    const goal = await prisma.employeeGoal.findUnique({ where: { id: goalId } });
    if (!goal || goal.status !== 'active') return null;

    const newValue = goal.currentValue + increment;
    const progress = Math.min(100, Math.round((newValue / goal.targetValue) * 100));

    const updateData = {
      currentValue: newValue,
      progress,
    };

    // Verificar si se alcanzó la meta
    if (newValue >= goal.targetValue && !goal.achievedAt) {
      updateData.achievedAt = new Date();
      updateData.status = 'achieved';

      // Registrar bono
      if (goal.bonusAmount > 0) {
        await this.awardBonus(goal);
      }
    }

    await prisma.employeeGoal.update({
      where: { id: goalId },
      data: updateData,
    });

    return { newValue, progress, achieved: newValue >= goal.targetValue };
  }

  async awardBonus(goal) {
    await prisma.employeeBonus.create({
      data: {
        employeeId: goal.employeeId,
        goalId: goal.id,
        amount: goal.bonusAmount,
        type: goal.bonusType,
        status: 'pending',
      },
    });

    logger.info({ goalId: goal.id, amount: goal.bonusAmount }, 'Bonus awarded');
  }

  /**
   * Procesar métricas automáticamente
   */
  async processMetrics(storeId, date = new Date()) {
    const employees = await prisma.employee.findMany({
      where: { storeId, isActive: true },
      include: {
        goals: { where: { status: 'active' } },
      },
    });

    for (const emp of employees) {
      for (const goal of emp.goals) {
        const value = await this.calculateMetric(emp.id, goal.type, goal.startDate, date);
        
        if (value !== goal.currentValue) {
          await prisma.employeeGoal.update({
            where: { id: goal.id },
            data: {
              currentValue: value,
              progress: Math.min(100, Math.round((value / goal.targetValue) * 100)),
              achievedAt: value >= goal.targetValue && !goal.achievedAt ? new Date() : goal.achievedAt,
              status: value >= goal.targetValue ? 'achieved' : 'active',
            },
          });
        }
      }
    }
  }

  async calculateMetric(employeeId, type, startDate, endDate) {
    switch (type) {
      case this.GOAL_TYPES.SALES:
        const sales = await prisma.order.aggregate({
          where: {
            OR: [
              { createdById: employeeId },
              { deliveryPersonId: employeeId },
            ],
            status: 'delivered',
            createdAt: { gte: startDate, lte: endDate },
          },
          _sum: { total: true },
        });
        return sales._sum.total || 0;

      case this.GOAL_TYPES.ORDERS:
        return prisma.order.count({
          where: {
            OR: [
              { createdById: employeeId },
              { deliveryPersonId: employeeId },
            ],
            status: 'delivered',
            createdAt: { gte: startDate, lte: endDate },
          },
        });

      case this.GOAL_TYPES.DELIVERIES:
        return prisma.order.count({
          where: {
            deliveryPersonId: employeeId,
            status: 'delivered',
            createdAt: { gte: startDate, lte: endDate },
          },
        });

      case this.GOAL_TYPES.RATING:
        const ratings = await prisma.deliveryRating.aggregate({
          where: {
            deliveryPersonId: employeeId,
            createdAt: { gte: startDate, lte: endDate },
          },
          _avg: { rating: true },
        });
        return Math.round((ratings._avg.rating || 0) * 10) / 10;

      case this.GOAL_TYPES.ATTENDANCE:
        const shifts = await prisma.shift.count({
          where: {
            employeeId,
            status: 'completed',
            date: { gte: startDate, lte: endDate },
          },
        });
        return shifts;

      default:
        return 0;
    }
  }

  /**
   * Obtener metas de empleado
   */
  async getEmployeeGoals(employeeId, status = null) {
    return prisma.employeeGoal.findMany({
      where: {
        employeeId,
        status: status || undefined,
      },
      orderBy: { endDate: 'asc' },
    });
  }

  /**
   * Dashboard de metas del equipo
   */
  async getTeamGoalsDashboard(storeId) {
    const employees = await prisma.employee.findMany({
      where: { storeId, isActive: true },
      include: {
        goals: {
          where: { status: { in: ['active', 'achieved'] } },
        },
      },
    });

    const dashboard = employees.map(emp => {
      const activeGoals = emp.goals.filter(g => g.status === 'active');
      const achievedGoals = emp.goals.filter(g => g.status === 'achieved');
      const avgProgress = activeGoals.length > 0
        ? Math.round(activeGoals.reduce((sum, g) => sum + g.progress, 0) / activeGoals.length)
        : 0;

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        role: emp.role,
        activeGoals: activeGoals.length,
        achievedGoals: achievedGoals.length,
        avgProgress,
        goals: emp.goals.map(g => ({
          id: g.id,
          type: g.type,
          target: g.targetValue,
          current: g.currentValue,
          progress: g.progress,
          status: g.status,
          endDate: g.endDate,
        })),
      };
    });

    return {
      employees: dashboard.sort((a, b) => b.avgProgress - a.avgProgress),
      summary: {
        totalActiveGoals: dashboard.reduce((sum, e) => sum + e.activeGoals, 0),
        totalAchieved: dashboard.reduce((sum, e) => sum + e.achievedGoals, 0),
        avgTeamProgress: Math.round(
          dashboard.reduce((sum, e) => sum + e.avgProgress, 0) / dashboard.length
        ),
      },
    };
  }

  /**
   * Leaderboard de empleados
   */
  async getLeaderboard(storeId, period = 'monthly') {
    const now = new Date();
    let startDate;

    switch (period) {
      case 'daily':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'weekly':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const goals = await prisma.employeeGoal.findMany({
      where: {
        employee: { storeId },
        status: 'achieved',
        achievedAt: { gte: startDate },
      },
      include: { employee: { select: { name: true, role: true } } },
    });

    const byEmployee = {};
    goals.forEach(g => {
      if (!byEmployee[g.employeeId]) {
        byEmployee[g.employeeId] = {
          name: g.employee.name,
          role: g.employee.role,
          goalsAchieved: 0,
          bonusEarned: 0,
        };
      }
      byEmployee[g.employeeId].goalsAchieved++;
      byEmployee[g.employeeId].bonusEarned += g.bonusAmount || 0;
    });

    return Object.entries(byEmployee)
      .map(([id, data]) => ({ employeeId: id, ...data }))
      .sort((a, b) => b.goalsAchieved - a.goalsAchieved);
  }

  /**
   * Cerrar metas vencidas
   */
  async closeExpiredGoals() {
    const expired = await prisma.employeeGoal.updateMany({
      where: {
        status: 'active',
        endDate: { lt: new Date() },
      },
      data: { status: 'expired' },
    });

    logger.info({ count: expired.count }, 'Expired goals closed');
    return expired.count;
  }
}

export const employeeGoalsService = new EmployeeGoalsService();
export default employeeGoalsService;

