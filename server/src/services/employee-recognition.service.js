/**
 * Sistema de Reconocimiento de Empleados
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class EmployeeRecognitionService {
  /**
   * Calcular métricas de empleado
   */
  async calculateEmployeeMetrics(employeeId, month, year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { store: true },
    });

    if (!employee) throw new Error('Empleado no encontrado');

    // Turnos trabajados
    const shifts = await prisma.employeeShift.findMany({
      where: {
        employeeId,
        date: { gte: startDate, lte: endDate },
        status: 'completed',
      },
    });

    const totalHours = shifts.reduce((sum, s) => sum + (s.workedMinutes || 0), 0) / 60;
    const lateMinutes = shifts.reduce((sum, s) => sum + (s.lateMinutes || 0), 0);
    const punctualityScore = shifts.length > 0 
      ? Math.max(0, 100 - (lateMinutes / shifts.length))
      : 100;

    // Pedidos procesados (si es cocina/delivery)
    let ordersProcessed = 0;
    let avgPrepTime = 0;

    if (employee.role === 'kitchen' || employee.role === 'cook') {
      const kitchenOrders = await prisma.order.findMany({
        where: {
          storeId: employee.storeId,
          preparedBy: employeeId,
          createdAt: { gte: startDate, lte: endDate },
        },
      });
      ordersProcessed = kitchenOrders.length;
      avgPrepTime = kitchenOrders.length > 0
        ? kitchenOrders.reduce((sum, o) => sum + (o.prepTime || 0), 0) / kitchenOrders.length
        : 0;
    }

    if (employee.role === 'delivery') {
      const deliveries = await prisma.order.count({
        where: {
          deliveryPersonId: employeeId,
          status: 'delivered',
          createdAt: { gte: startDate, lte: endDate },
        },
      });
      ordersProcessed = deliveries;
    }

    // Propinas recibidas
    const tips = await prisma.tipPayment.aggregate({
      where: {
        employeeId,
        date: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    });

    // Reconocimientos recibidos
    const recognitions = await prisma.employeeRecognition.count({
      where: {
        employeeId,
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    return {
      employeeId,
      employeeName: employee.name,
      role: employee.role,
      month,
      year,
      metrics: {
        shiftsWorked: shifts.length,
        totalHours: Math.round(totalHours * 10) / 10,
        punctualityScore: Math.round(punctualityScore),
        ordersProcessed,
        avgPrepTime: Math.round(avgPrepTime),
        tipsReceived: tips._sum.amount || 0,
        recognitionsReceived: recognitions,
      },
    };
  }

  /**
   * Calcular empleado del mes
   */
  async calculateEmployeeOfMonth(storeId, month, year) {
    const employees = await prisma.employee.findMany({
      where: { storeId, isActive: true },
    });

    const rankings = [];

    for (const employee of employees) {
      const metrics = await this.calculateEmployeeMetrics(employee.id, month, year);
      
      // Calcular score compuesto
      const score = this.calculateScore(metrics.metrics);
      
      rankings.push({
        ...metrics,
        score,
      });
    }

    // Ordenar por score
    rankings.sort((a, b) => b.score - a.score);

    // El primero es el empleado del mes
    const winner = rankings[0];

    if (winner) {
      // Guardar resultado
      await prisma.employeeOfMonth.create({
        data: {
          storeId,
          employeeId: winner.employeeId,
          month,
          year,
          score: winner.score,
          metrics: JSON.stringify(winner.metrics),
        },
      });

      logger.info({ employeeId: winner.employeeId, month, year }, 'Employee of month selected');
    }

    return {
      winner,
      rankings: rankings.slice(0, 5), // Top 5
    };
  }

  calculateScore(metrics) {
    // Ponderación de métricas
    const weights = {
      shiftsWorked: 15,
      punctualityScore: 25,
      ordersProcessed: 20,
      tipsReceived: 15,
      recognitionsReceived: 25,
    };

    let score = 0;
    
    // Normalizar y ponderar
    score += Math.min(metrics.shiftsWorked / 20, 1) * weights.shiftsWorked;
    score += (metrics.punctualityScore / 100) * weights.punctualityScore;
    score += Math.min(metrics.ordersProcessed / 500, 1) * weights.ordersProcessed;
    score += Math.min(metrics.tipsReceived / 10000, 1) * weights.tipsReceived;
    score += Math.min(metrics.recognitionsReceived / 10, 1) * weights.recognitionsReceived;

    return Math.round(score);
  }

  /**
   * Dar reconocimiento a empleado
   */
  async giveRecognition(fromEmployeeId, toEmployeeId, type, message) {
    const recognition = await prisma.employeeRecognition.create({
      data: {
        fromEmployeeId,
        employeeId: toEmployeeId,
        type, // 'teamwork', 'customer_service', 'efficiency', 'attitude', 'other'
        message,
      },
    });

    logger.info({ from: fromEmployeeId, to: toEmployeeId, type }, 'Recognition given');
    return recognition;
  }

  /**
   * Obtener historial de empleados del mes
   */
  async getEmployeeOfMonthHistory(storeId, limit = 12) {
    return prisma.employeeOfMonth.findMany({
      where: { storeId },
      include: {
        employee: { select: { name: true, avatar: true, role: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: limit,
    });
  }

  /**
   * Obtener reconocimientos de un empleado
   */
  async getEmployeeRecognitions(employeeId) {
    return prisma.employeeRecognition.findMany({
      where: { employeeId },
      include: {
        fromEmployee: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Leaderboard de empleados
   */
  async getLeaderboard(storeId, period = 'month') {
    const now = new Date();
    let startDate;

    switch (period) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const employees = await prisma.employee.findMany({
      where: { storeId, isActive: true },
    });

    const leaderboard = await Promise.all(
      employees.map(async (emp) => {
        const recognitions = await prisma.employeeRecognition.count({
          where: { employeeId: emp.id, createdAt: { gte: startDate } },
        });

        const tips = await prisma.tipPayment.aggregate({
          where: { employeeId: emp.id, date: { gte: startDate } },
          _sum: { amount: true },
        });

        return {
          employeeId: emp.id,
          name: emp.name,
          avatar: emp.avatar,
          role: emp.role,
          recognitions,
          tips: tips._sum.amount || 0,
          points: recognitions * 10 + Math.floor((tips._sum.amount || 0) / 100),
        };
      })
    );

    return leaderboard.sort((a, b) => b.points - a.points);
  }

  /**
   * Premios disponibles
   */
  async getAvailableRewards(storeId) {
    return prisma.employeeReward.findMany({
      where: { storeId, isActive: true },
      orderBy: { pointsRequired: 'asc' },
    });
  }

  /**
   * Canjear premio
   */
  async redeemReward(employeeId, rewardId) {
    const [employee, reward] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId } }),
      prisma.employeeReward.findUnique({ where: { id: rewardId } }),
    ]);

    if (!employee || !reward) throw new Error('Empleado o premio no encontrado');

    // Verificar puntos (simplificado - en producción calcular puntos reales)
    const leaderboard = await this.getLeaderboard(employee.storeId, 'year');
    const employeeData = leaderboard.find(e => e.employeeId === employeeId);
    
    if (!employeeData || employeeData.points < reward.pointsRequired) {
      throw new Error('Puntos insuficientes');
    }

    await prisma.employeeRewardRedemption.create({
      data: {
        employeeId,
        rewardId,
        pointsSpent: reward.pointsRequired,
      },
    });

    logger.info({ employeeId, rewardId }, 'Reward redeemed');
    return { success: true };
  }
}

export const employeeRecognitionService = new EmployeeRecognitionService();
export default employeeRecognitionService;

