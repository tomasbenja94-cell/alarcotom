/**
 * Sistema de Propinas para Cocina
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class KitchenTipsService {
  /**
   * Registrar propina de pedido
   */
  async recordTip(orderId, tipAmount, distribution = 'pool') {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true },
    });

    if (!order) throw new Error('Pedido no encontrado');

    const tip = await prisma.kitchenTip.create({
      data: {
        orderId,
        storeId: order.storeId,
        amount: tipAmount,
        distribution, // 'pool', 'individual', 'shift'
        status: 'pending',
      },
    });

    logger.info({ orderId, amount: tipAmount }, 'Kitchen tip recorded');
    return tip;
  }

  /**
   * Distribuir propinas del día
   */
  async distributeDailyTips(storeId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Obtener propinas pendientes
    const tips = await prisma.kitchenTip.findMany({
      where: {
        storeId,
        status: 'pending',
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const totalTips = tips.reduce((sum, t) => sum + t.amount, 0);

    // Obtener empleados que trabajaron ese día
    const shifts = await prisma.employeeShift.findMany({
      where: {
        storeId,
        date: startOfDay,
        status: 'completed',
        role: { in: ['kitchen', 'chef', 'cook'] },
      },
      include: { employee: true },
    });

    if (shifts.length === 0) {
      logger.warn({ storeId, date }, 'No kitchen staff found for tip distribution');
      return { distributed: false, reason: 'No hay personal de cocina' };
    }

    // Calcular horas totales trabajadas
    const totalMinutes = shifts.reduce((sum, s) => sum + (s.workedMinutes || 0), 0);

    // Distribuir proporcionalmente
    const distributions = [];
    for (const shift of shifts) {
      const proportion = totalMinutes > 0 ? (shift.workedMinutes || 0) / totalMinutes : 1 / shifts.length;
      const amount = Math.round(totalTips * proportion);

      distributions.push({
        employeeId: shift.employeeId,
        employeeName: shift.employee.name,
        workedMinutes: shift.workedMinutes,
        proportion: Math.round(proportion * 100),
        amount,
      });

      // Registrar pago
      await prisma.tipPayment.create({
        data: {
          storeId,
          employeeId: shift.employeeId,
          amount,
          date: startOfDay,
          type: 'kitchen_pool',
        },
      });
    }

    // Marcar propinas como distribuidas
    await prisma.kitchenTip.updateMany({
      where: { id: { in: tips.map(t => t.id) } },
      data: { status: 'distributed', distributedAt: new Date() },
    });

    logger.info({ storeId, date, totalTips, employees: shifts.length }, 'Tips distributed');

    return {
      distributed: true,
      date,
      totalTips,
      distributions,
    };
  }

  /**
   * Obtener resumen de propinas por empleado
   */
  async getEmployeeTipsSummary(employeeId, startDate, endDate) {
    const payments = await prisma.tipPayment.findMany({
      where: {
        employeeId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      orderBy: { date: 'desc' },
    });

    return {
      total: payments.reduce((sum, p) => sum + p.amount, 0),
      count: payments.length,
      average: payments.length > 0 
        ? Math.round(payments.reduce((sum, p) => sum + p.amount, 0) / payments.length)
        : 0,
      payments,
    };
  }

  /**
   * Obtener resumen de propinas de la tienda
   */
  async getStoreTipsSummary(storeId, period = 'week') {
    const now = new Date();
    let startDate;

    switch (period) {
      case 'day': startDate = new Date(now.setHours(0, 0, 0, 0)); break;
      case 'week': startDate = new Date(now.setDate(now.getDate() - 7)); break;
      case 'month': startDate = new Date(now.setMonth(now.getMonth() - 1)); break;
      default: startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const [tips, payments] = await Promise.all([
      prisma.kitchenTip.aggregate({
        where: { storeId, createdAt: { gte: startDate } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.tipPayment.groupBy({
        by: ['employeeId'],
        where: { storeId, date: { gte: startDate } },
        _sum: { amount: true },
      }),
    ]);

    const employees = await prisma.employee.findMany({
      where: { id: { in: payments.map(p => p.employeeId) } },
      select: { id: true, name: true },
    });

    return {
      period,
      totalCollected: tips._sum.amount || 0,
      ordersWithTips: tips._count,
      byEmployee: payments.map(p => ({
        employeeId: p.employeeId,
        name: employees.find(e => e.id === p.employeeId)?.name || 'Desconocido',
        total: p._sum.amount || 0,
      })).sort((a, b) => b.total - a.total),
    };
  }

  /**
   * Configurar política de propinas
   */
  async setTipPolicy(storeId, policy) {
    const { distribution, kitchenPercentage, minimumHours } = policy;

    await prisma.store.update({
      where: { id: storeId },
      data: {
        tipPolicy: JSON.stringify({
          distribution, // 'pool', 'individual', 'shift_based'
          kitchenPercentage: kitchenPercentage || 100, // % que va a cocina
          minimumHours: minimumHours || 0, // Horas mínimas para participar
        }),
      },
    });

    return { success: true };
  }
}

export const kitchenTipsService = new KitchenTipsService();
export default kitchenTipsService;

