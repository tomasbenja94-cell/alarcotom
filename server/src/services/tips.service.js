/**
 * Sistema de Propinas Inteligente
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class TipsService {
  /**
   * Calcular sugerencias de propina
   */
  getSuggestedTips(orderTotal, serviceQuality = 'good') {
    const basePercentages = {
      poor: [5, 10, 15],
      average: [10, 15, 20],
      good: [15, 20, 25],
      excellent: [20, 25, 30],
    };

    const percentages = basePercentages[serviceQuality] || basePercentages.good;

    return percentages.map(percent => ({
      percent,
      amount: Math.round(orderTotal * (percent / 100)),
      label: percent === percentages[1] ? 'Recomendado' : null,
    }));
  }

  /**
   * Agregar propina a orden
   */
  async addTipToOrder(orderId, tipAmount, tipType = 'percentage', tipPercent = null) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Orden no encontrada');

    const tip = await prisma.tip.create({
      data: {
        orderId,
        amount: tipAmount,
        tipType,
        tipPercent,
        status: 'pending',
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        tipAmount,
        total: order.total + tipAmount,
      },
    });

    logger.info({ orderId, tipAmount }, 'Tip added to order');
    return tip;
  }

  /**
   * Distribuir propinas
   */
  async distributeTips(storeId, date, distributionMethod = 'equal') {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const tips = await prisma.tip.findMany({
      where: {
        order: { storeId },
        status: 'pending',
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      include: { order: true },
    });

    const totalTips = tips.reduce((sum, t) => sum + t.amount, 0);

    const employees = await prisma.employee.findMany({
      where: { storeId, isActive: true, role: { in: ['server', 'delivery', 'kitchen'] } },
    });

    if (employees.length === 0) return { distributed: 0, employees: [] };

    const distribution = [];

    switch (distributionMethod) {
      case 'equal':
        const equalShare = Math.floor(totalTips / employees.length);
        employees.forEach(emp => {
          distribution.push({ employeeId: emp.id, name: emp.name, amount: equalShare });
        });
        break;

      case 'by_role':
        const roleWeights = { server: 0.5, delivery: 0.3, kitchen: 0.2 };
        const totalWeight = employees.reduce((sum, e) => sum + (roleWeights[e.role] || 0.1), 0);
        employees.forEach(emp => {
          const weight = roleWeights[emp.role] || 0.1;
          const share = Math.floor(totalTips * (weight / totalWeight));
          distribution.push({ employeeId: emp.id, name: emp.name, role: emp.role, amount: share });
        });
        break;

      case 'by_hours':
        const shifts = await prisma.shift.findMany({
          where: {
            storeId,
            date: startOfDay,
            status: 'completed',
          },
        });
        const totalHours = shifts.reduce((sum, s) => sum + (s.workedMinutes || 0), 0);
        shifts.forEach(shift => {
          const share = totalHours > 0
            ? Math.floor(totalTips * ((shift.workedMinutes || 0) / totalHours))
            : 0;
          const emp = employees.find(e => e.id === shift.employeeId);
          if (emp) {
            distribution.push({
              employeeId: emp.id,
              name: emp.name,
              hoursWorked: Math.round((shift.workedMinutes || 0) / 60 * 10) / 10,
              amount: share,
            });
          }
        });
        break;

      case 'by_delivery':
        for (const tip of tips) {
          if (tip.order.deliveryPersonId) {
            const existing = distribution.find(d => d.employeeId === tip.order.deliveryPersonId);
            if (existing) {
              existing.amount += tip.amount;
              existing.deliveries++;
            } else {
              const emp = employees.find(e => e.id === tip.order.deliveryPersonId);
              distribution.push({
                employeeId: tip.order.deliveryPersonId,
                name: emp?.name || 'Desconocido',
                amount: tip.amount,
                deliveries: 1,
              });
            }
          }
        }
        break;
    }

    // Registrar distribución
    for (const dist of distribution) {
      if (dist.amount > 0) {
        await prisma.tipDistribution.create({
          data: {
            storeId,
            employeeId: dist.employeeId,
            amount: dist.amount,
            date: startOfDay,
            method: distributionMethod,
          },
        });
      }
    }

    // Marcar propinas como distribuidas
    await prisma.tip.updateMany({
      where: { id: { in: tips.map(t => t.id) } },
      data: { status: 'distributed', distributedAt: new Date() },
    });

    logger.info({ storeId, date, totalTips, method: distributionMethod }, 'Tips distributed');
    return { totalTips, distributed: distribution.length, employees: distribution };
  }

  /**
   * Obtener historial de propinas de empleado
   */
  async getEmployeeTipHistory(employeeId, startDate, endDate) {
    const distributions = await prisma.tipDistribution.findMany({
      where: {
        employeeId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      orderBy: { date: 'desc' },
    });

    const totalAmount = distributions.reduce((sum, d) => sum + d.amount, 0);
    const avgDaily = distributions.length > 0 ? Math.round(totalAmount / distributions.length) : 0;

    return {
      distributions,
      summary: {
        totalAmount,
        avgDaily,
        daysWorked: distributions.length,
      },
    };
  }

  /**
   * Reporte de propinas de tienda
   */
  async getStoreTipReport(storeId, month, year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [tips, distributions] = await Promise.all([
      prisma.tip.findMany({
        where: {
          order: { storeId },
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.tipDistribution.findMany({
        where: {
          storeId,
          date: { gte: startDate, lte: endDate },
        },
        include: { employee: { select: { name: true, role: true } } },
      }),
    ]);

    const totalCollected = tips.reduce((sum, t) => sum + t.amount, 0);
    const totalDistributed = distributions.reduce((sum, d) => sum + d.amount, 0);

    // Agrupar por empleado
    const byEmployee = {};
    distributions.forEach(d => {
      if (!byEmployee[d.employeeId]) {
        byEmployee[d.employeeId] = {
          name: d.employee.name,
          role: d.employee.role,
          total: 0,
          days: 0,
        };
      }
      byEmployee[d.employeeId].total += d.amount;
      byEmployee[d.employeeId].days++;
    });

    return {
      period: `${month}/${year}`,
      totalCollected,
      totalDistributed,
      avgTipPerOrder: tips.length > 0 ? Math.round(totalCollected / tips.length) : 0,
      tipRate: tips.length > 0 ? Math.round((tips.filter(t => t.amount > 0).length / tips.length) * 100) : 0,
      byEmployee: Object.values(byEmployee).sort((a, b) => b.total - a.total),
    };
  }

  /**
   * Configurar opciones de propina de tienda
   */
  async setStoreTipSettings(storeId, settings) {
    const {
      enabled,
      defaultPercentages,
      allowCustomAmount,
      suggestOnCheckout,
      distributionMethod,
      distributionSchedule,
    } = settings;

    await prisma.storeTipSettings.upsert({
      where: { storeId },
      update: {
        enabled,
        defaultPercentages,
        allowCustomAmount,
        suggestOnCheckout,
        distributionMethod,
        distributionSchedule,
      },
      create: {
        storeId,
        enabled: enabled ?? true,
        defaultPercentages: defaultPercentages || [15, 20, 25],
        allowCustomAmount: allowCustomAmount ?? true,
        suggestOnCheckout: suggestOnCheckout ?? true,
        distributionMethod: distributionMethod || 'equal',
        distributionSchedule: distributionSchedule || 'daily',
      },
    });

    return { success: true };
  }

  /**
   * Obtener configuración de propinas
   */
  async getStoreTipSettings(storeId) {
    return prisma.storeTipSettings.findUnique({ where: { storeId } });
  }
}

export const tipsService = new TipsService();
export default tipsService;

