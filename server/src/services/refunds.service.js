import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class RefundsService {
  /**
   * Solicitar reembolso
   */
  async requestRefund(orderId, customerId, reason, items = null) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true }
      });

      if (!order) throw new Error('Pedido no encontrado');
      if (order.customerId !== customerId) throw new Error('No autorizado');

      const refundAmount = items 
        ? this.calculatePartialRefund(order, items)
        : order.total;

      const refund = await prisma.refund.create({
        data: {
          orderId,
          customerId,
          amount: refundAmount,
          reason,
          items: items ? JSON.stringify(items) : null,
          status: 'PENDING',
          requestedAt: new Date()
        }
      });

      logger.info({ refundId: refund.id, orderId, amount: refundAmount }, 'Reembolso solicitado');
      return refund;
    } catch (error) {
      logger.error({ error, orderId }, 'Error solicitando reembolso');
      throw error;
    }
  }

  /**
   * Aprobar reembolso
   */
  async approveRefund(refundId, approvedBy, notes = null) {
    try {
      const refund = await prisma.refund.update({
        where: { id: refundId },
        data: {
          status: 'APPROVED',
          approvedBy,
          approvedAt: new Date(),
          notes
        }
      });

      // Actualizar estado del pedido
      await prisma.order.update({
        where: { id: refund.orderId },
        data: { status: 'REFUNDED' }
      });

      logger.info({ refundId }, 'Reembolso aprobado');
      return refund;
    } catch (error) {
      logger.error({ error, refundId }, 'Error aprobando reembolso');
      throw error;
    }
  }

  /**
   * Rechazar reembolso
   */
  async rejectRefund(refundId, rejectedBy, reason) {
    try {
      const refund = await prisma.refund.update({
        where: { id: refundId },
        data: {
          status: 'REJECTED',
          rejectedBy,
          rejectedAt: new Date(),
          rejectionReason: reason
        }
      });

      logger.info({ refundId }, 'Reembolso rechazado');
      return refund;
    } catch (error) {
      logger.error({ error, refundId }, 'Error rechazando reembolso');
      throw error;
    }
  }

  /**
   * Procesar reembolso (ejecutar pago)
   */
  async processRefund(refundId) {
    try {
      const refund = await prisma.refund.findUnique({
        where: { id: refundId },
        include: { order: true }
      });

      if (refund.status !== 'APPROVED') {
        throw new Error('Reembolso no aprobado');
      }

      // Aquí iría la integración con el procesador de pagos
      // Por ahora solo marcamos como procesado

      const processed = await prisma.refund.update({
        where: { id: refundId },
        data: {
          status: 'PROCESSED',
          processedAt: new Date()
        }
      });

      logger.info({ refundId }, 'Reembolso procesado');
      return processed;
    } catch (error) {
      logger.error({ error, refundId }, 'Error procesando reembolso');
      throw error;
    }
  }

  /**
   * Obtener reembolsos pendientes
   */
  async getPendingRefunds(storeId) {
    return prisma.refund.findMany({
      where: {
        order: { storeId },
        status: 'PENDING'
      },
      include: {
        order: true,
        customer: true
      },
      orderBy: { requestedAt: 'asc' }
    });
  }

  /**
   * Calcular reembolso parcial
   */
  calculatePartialRefund(order, itemIds) {
    const itemsToRefund = order.items.filter(i => itemIds.includes(i.id));
    return itemsToRefund.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  }

  /**
   * Historial de reembolsos
   */
  async getRefundHistory(storeId, startDate, endDate) {
    return prisma.refund.findMany({
      where: {
        order: { storeId },
        requestedAt: { gte: startDate, lte: endDate }
      },
      include: { order: true, customer: true },
      orderBy: { requestedAt: 'desc' }
    });
  }
}

export const refundsService = new RefundsService();
export default refundsService;
