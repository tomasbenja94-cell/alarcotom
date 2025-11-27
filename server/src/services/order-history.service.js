import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class OrderHistoryService {
  /**
   * Registrar cambio en pedido
   */
  async logChange(orderId, userId, changeType, previousValue, newValue, reason = null) {
    try {
      const log = await prisma.orderChangeLog.create({
        data: {
          orderId,
          userId,
          changeType,
          previousValue: JSON.stringify(previousValue),
          newValue: JSON.stringify(newValue),
          reason,
          createdAt: new Date()
        }
      });

      logger.info({ orderId, changeType }, 'Cambio registrado');
      return log;
    } catch (error) {
      logger.error({ error, orderId }, 'Error registrando cambio');
      throw error;
    }
  }

  /**
   * Obtener historial de cambios de un pedido
   */
  async getOrderChanges(orderId) {
    return prisma.orderChangeLog.findMany({
      where: { orderId },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Registrar cambio de estado
   */
  async logStatusChange(orderId, userId, previousStatus, newStatus, reason = null) {
    return this.logChange(
      orderId,
      userId,
      'STATUS_CHANGE',
      { status: previousStatus },
      { status: newStatus },
      reason
    );
  }

  /**
   * Registrar modificación de items
   */
  async logItemsChange(orderId, userId, previousItems, newItems, reason = null) {
    return this.logChange(
      orderId,
      userId,
      'ITEMS_MODIFIED',
      { items: previousItems },
      { items: newItems },
      reason
    );
  }

  /**
   * Registrar cambio de dirección
   */
  async logAddressChange(orderId, userId, previousAddress, newAddress) {
    return this.logChange(
      orderId,
      userId,
      'ADDRESS_CHANGE',
      { address: previousAddress },
      { address: newAddress }
    );
  }

  /**
   * Registrar asignación de repartidor
   */
  async logDriverAssignment(orderId, userId, driverId, driverName) {
    return this.logChange(
      orderId,
      userId,
      'DRIVER_ASSIGNED',
      null,
      { driverId, driverName }
    );
  }

  /**
   * Registrar aplicación de cupón
   */
  async logCouponApplied(orderId, userId, couponCode, discount) {
    return this.logChange(
      orderId,
      userId,
      'COUPON_APPLIED',
      null,
      { couponCode, discount }
    );
  }

  /**
   * Obtener timeline del pedido
   */
  async getOrderTimeline(orderId) {
    const changes = await this.getOrderChanges(orderId);
    
    return changes.map(c => ({
      timestamp: c.createdAt,
      type: c.changeType,
      user: c.user?.name || 'Sistema',
      description: this.formatChangeDescription(c),
      details: {
        previous: JSON.parse(c.previousValue || '{}'),
        new: JSON.parse(c.newValue || '{}')
      }
    }));
  }

  formatChangeDescription(change) {
    const newVal = JSON.parse(change.newValue || '{}');
    const prevVal = JSON.parse(change.previousValue || '{}');

    switch (change.changeType) {
      case 'STATUS_CHANGE':
        return `Estado cambiado de ${prevVal.status} a ${newVal.status}`;
      case 'ITEMS_MODIFIED':
        return 'Items del pedido modificados';
      case 'ADDRESS_CHANGE':
        return 'Dirección de entrega actualizada';
      case 'DRIVER_ASSIGNED':
        return `Repartidor asignado: ${newVal.driverName}`;
      case 'COUPON_APPLIED':
        return `Cupón aplicado: ${newVal.couponCode} (-$${newVal.discount})`;
      default:
        return change.changeType;
    }
  }
}

export const orderHistoryService = new OrderHistoryService();
export default orderHistoryService;

