import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class CashRegisterService {
  /**
   * Abrir caja del día
   */
  async openCashRegister(storeId, userId, initialAmount) {
    try {
      const existing = await prisma.cashRegister.findFirst({
        where: { storeId, status: 'OPEN' }
      });

      if (existing) throw new Error('Ya hay una caja abierta');

      const register = await prisma.cashRegister.create({
        data: {
          storeId,
          openedBy: userId,
          openedAt: new Date(),
          initialAmount,
          status: 'OPEN'
        }
      });

      logger.info({ storeId, registerId: register.id }, 'Caja abierta');
      return register;
    } catch (error) {
      logger.error({ error, storeId }, 'Error abriendo caja');
      throw error;
    }
  }

  /**
   * Cerrar caja del día
   */
  async closeCashRegister(registerId, userId, countedAmount) {
    try {
      const register = await prisma.cashRegister.findUnique({
        where: { id: registerId }
      });

      if (!register || register.status !== 'OPEN') {
        throw new Error('Caja no encontrada o ya cerrada');
      }

      // Calcular ventas del día
      const sales = await this.getDailySales(register.storeId, register.openedAt);

      const expectedAmount = register.initialAmount + sales.cashTotal - sales.cashRefunds;
      const difference = countedAmount - expectedAmount;

      const closed = await prisma.cashRegister.update({
        where: { id: registerId },
        data: {
          closedBy: userId,
          closedAt: new Date(),
          finalAmount: countedAmount,
          expectedAmount,
          difference,
          status: 'CLOSED',
          salesSummary: sales
        }
      });

      logger.info({ registerId, difference }, 'Caja cerrada');
      return closed;
    } catch (error) {
      logger.error({ error, registerId }, 'Error cerrando caja');
      throw error;
    }
  }

  /**
   * Obtener ventas del día
   */
  async getDailySales(storeId, fromDate) {
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: fromDate },
        status: { in: ['COMPLETED', 'DELIVERED'] }
      }
    });

    const cashOrders = orders.filter(o => o.paymentMethod === 'CASH');
    const cardOrders = orders.filter(o => o.paymentMethod === 'CARD');
    const transferOrders = orders.filter(o => o.paymentMethod === 'TRANSFER');

    return {
      totalOrders: orders.length,
      totalSales: orders.reduce((sum, o) => sum + o.total, 0),
      cashTotal: cashOrders.reduce((sum, o) => sum + o.total, 0),
      cardTotal: cardOrders.reduce((sum, o) => sum + o.total, 0),
      transferTotal: transferOrders.reduce((sum, o) => sum + o.total, 0),
      cashRefunds: 0, // Calcular de refunds si existe
      deliveryOrders: orders.filter(o => o.type === 'DELIVERY').length,
      pickupOrders: orders.filter(o => o.type === 'PICKUP').length,
      averageTicket: orders.length > 0 ? orders.reduce((sum, o) => sum + o.total, 0) / orders.length : 0
    };
  }

  /**
   * Registrar movimiento de caja
   */
  async addCashMovement(registerId, type, amount, reason, userId) {
    try {
      const movement = await prisma.cashMovement.create({
        data: {
          registerId,
          type, // 'IN' o 'OUT'
          amount,
          reason,
          createdBy: userId,
          createdAt: new Date()
        }
      });

      logger.info({ registerId, type, amount }, 'Movimiento de caja registrado');
      return movement;
    } catch (error) {
      logger.error({ error, registerId }, 'Error registrando movimiento');
      throw error;
    }
  }

  /**
   * Obtener resumen de caja actual
   */
  async getCurrentRegisterSummary(storeId) {
    const register = await prisma.cashRegister.findFirst({
      where: { storeId, status: 'OPEN' },
      include: { movements: true }
    });

    if (!register) return null;

    const sales = await this.getDailySales(storeId, register.openedAt);
    const movements = register.movements || [];
    
    const movementsIn = movements.filter(m => m.type === 'IN').reduce((sum, m) => sum + m.amount, 0);
    const movementsOut = movements.filter(m => m.type === 'OUT').reduce((sum, m) => sum + m.amount, 0);

    return {
      register,
      sales,
      movements: { in: movementsIn, out: movementsOut },
      currentBalance: register.initialAmount + sales.cashTotal + movementsIn - movementsOut
    };
  }

  /**
   * Historial de cierres de caja
   */
  async getCashRegisterHistory(storeId, limit = 30) {
    return prisma.cashRegister.findMany({
      where: { storeId, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
      take: limit
    });
  }
}

export const cashRegisterService = new CashRegisterService();
export default cashRegisterService;
