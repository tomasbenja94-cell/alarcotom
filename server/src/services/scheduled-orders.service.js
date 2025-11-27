/**
 * Sistema de Pedidos Programados
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class ScheduledOrdersService {
  /**
   * Crear pedido programado
   */
  async createScheduledOrder(orderData, scheduledFor) {
    const scheduledDate = new Date(scheduledFor);
    const now = new Date();

    // Validar que sea al menos 1 hora en el futuro
    if (scheduledDate.getTime() - now.getTime() < 60 * 60 * 1000) {
      throw new Error('El pedido debe programarse con al menos 1 hora de anticipación');
    }

    // Validar horario de tienda
    const store = await prisma.store.findUnique({ where: { id: orderData.storeId } });
    if (!this.isWithinStoreHours(store, scheduledDate)) {
      throw new Error('El horario seleccionado está fuera del horario de la tienda');
    }

    const order = await prisma.order.create({
      data: {
        ...orderData,
        status: 'scheduled',
        scheduledFor: scheduledDate,
        isScheduled: true,
      },
    });

    logger.info({ orderId: order.id, scheduledFor: scheduledDate }, 'Scheduled order created');
    return order;
  }

  /**
   * Verificar horario de tienda
   */
  isWithinStoreHours(store, date) {
    // Simplificado - en producción verificar horarios reales
    const hour = date.getHours();
    return hour >= 10 && hour <= 22;
  }

  /**
   * Obtener slots disponibles para programar
   */
  async getAvailableSlots(storeId, date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Obtener pedidos ya programados
    const scheduledOrders = await prisma.order.count({
      where: {
        storeId,
        isScheduled: true,
        scheduledFor: { gte: targetDate, lte: endOfDay },
        status: { not: 'cancelled' },
      },
    });

    // Generar slots (cada 30 min, de 10:00 a 22:00)
    const slots = [];
    const now = new Date();
    
    for (let hour = 10; hour < 22; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const slotTime = new Date(targetDate);
        slotTime.setHours(hour, min, 0, 0);

        // Solo slots futuros (al menos 1 hora)
        if (slotTime.getTime() > now.getTime() + 60 * 60 * 1000) {
          slots.push({
            time: slotTime.toISOString(),
            label: `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`,
            available: true, // En producción calcular capacidad real
          });
        }
      }
    }

    return { date: targetDate, slots, totalScheduled: scheduledOrders };
  }

  /**
   * Procesar pedidos programados (ejecutar periódicamente)
   */
  async processScheduledOrders() {
    const now = new Date();
    const prepTime = 30 * 60 * 1000; // 30 min antes

    const ordersToProcess = await prisma.order.findMany({
      where: {
        isScheduled: true,
        status: 'scheduled',
        scheduledFor: { lte: new Date(now.getTime() + prepTime) },
      },
    });

    for (const order of ordersToProcess) {
      try {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'pending' },
        });
        logger.info({ orderId: order.id }, 'Scheduled order activated');
      } catch (error) {
        logger.error({ orderId: order.id, error: error.message }, 'Failed to activate order');
      }
    }

    return { processed: ordersToProcess.length };
  }

  /**
   * Cancelar pedido programado
   */
  async cancelScheduledOrder(orderId, reason) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order || order.status !== 'scheduled') {
      throw new Error('Pedido no encontrado o no es programado');
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'cancelled', cancelReason: reason },
    });

    logger.info({ orderId, reason }, 'Scheduled order cancelled');
    return { success: true };
  }

  /**
   * Modificar horario de pedido programado
   */
  async rescheduleOrder(orderId, newScheduledFor) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order || order.status !== 'scheduled') {
      throw new Error('Pedido no encontrado o no es programado');
    }

    const newDate = new Date(newScheduledFor);
    const now = new Date();

    if (newDate.getTime() - now.getTime() < 60 * 60 * 1000) {
      throw new Error('Debe reprogramar con al menos 1 hora de anticipación');
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { scheduledFor: newDate },
    });

    logger.info({ orderId, newScheduledFor: newDate }, 'Order rescheduled');
    return { success: true, scheduledFor: newDate };
  }

  /**
   * Obtener pedidos programados de un cliente
   */
  async getCustomerScheduledOrders(customerId) {
    return prisma.order.findMany({
      where: {
        customerId,
        isScheduled: true,
        status: 'scheduled',
        scheduledFor: { gte: new Date() },
      },
      orderBy: { scheduledFor: 'asc' },
      include: { items: true },
    });
  }

  /**
   * Obtener pedidos programados de una tienda
   */
  async getStoreScheduledOrders(storeId, date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    return prisma.order.findMany({
      where: {
        storeId,
        isScheduled: true,
        scheduledFor: { gte: targetDate, lte: endOfDay },
        status: { not: 'cancelled' },
      },
      orderBy: { scheduledFor: 'asc' },
      include: { items: true, customer: true },
    });
  }
}

export const scheduledOrdersService = new ScheduledOrdersService();
export default scheduledOrdersService;

