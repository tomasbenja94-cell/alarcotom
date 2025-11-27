/**
 * Sistema de Pre-pedidos (Pedidos Programados)
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class PreordersService {
  /**
   * Crear pre-pedido
   */
  async createPreorder(storeId, preorderData) {
    const {
      customerId, items, scheduledDate, scheduledTime,
      deliveryType, deliveryAddress, paymentMethod, notes,
    } = preorderData;

    // Validar fecha/hora
    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    if (scheduledDateTime <= new Date()) {
      throw new Error('La fecha programada debe ser futura');
    }

    // Validar disponibilidad de tienda
    const isAvailable = await this.checkAvailability(storeId, scheduledDateTime);
    if (!isAvailable) {
      throw new Error('La tienda no está disponible en ese horario');
    }

    // Calcular totales
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = deliveryType === 'delivery' ? await this.calculateDeliveryFee(storeId, deliveryAddress) : 0;
    const total = subtotal + deliveryFee;

    const preorder = await prisma.preorder.create({
      data: {
        storeId,
        customerId,
        orderNumber: this.generateOrderNumber(),
        items: JSON.stringify(items),
        subtotal,
        deliveryFee,
        total,
        scheduledDate: new Date(scheduledDate),
        scheduledTime,
        deliveryType,
        deliveryAddress,
        paymentMethod,
        notes,
        status: 'scheduled',
        reminderSent: false,
      },
    });

    // Programar recordatorios
    await this.scheduleReminders(preorder);

    logger.info({ preorderId: preorder.id, scheduledDateTime }, 'Preorder created');
    return preorder;
  }

  generateOrderNumber() {
    return 'PRE-' + Date.now().toString(36).toUpperCase();
  }

  async checkAvailability(storeId, dateTime) {
    const dayOfWeek = dateTime.getDay();
    const time = dateTime.toTimeString().substring(0, 5);

    const hours = await prisma.storeHours.findFirst({
      where: { storeId, dayOfWeek },
    });

    if (!hours || hours.isClosed) return false;
    if (time < hours.openTime || time > hours.closeTime) return false;

    // Verificar capacidad
    const existingPreorders = await prisma.preorder.count({
      where: {
        storeId,
        scheduledDate: dateTime,
        status: { in: ['scheduled', 'confirmed'] },
      },
    });

    const maxPreorders = 10; // Configurable por tienda
    return existingPreorders < maxPreorders;
  }

  async calculateDeliveryFee(storeId, address) {
    // Integrar con servicio de zonas de delivery
    return 200; // Valor por defecto
  }

  /**
   * Programar recordatorios
   */
  async scheduleReminders(preorder) {
    const scheduledDateTime = new Date(`${preorder.scheduledDate.toISOString().split('T')[0]}T${preorder.scheduledTime}`);

    // Recordatorio 24 horas antes
    const reminder24h = new Date(scheduledDateTime.getTime() - 24 * 60 * 60 * 1000);
    if (reminder24h > new Date()) {
      await prisma.scheduledTask.create({
        data: {
          type: 'preorder_reminder',
          referenceId: preorder.id,
          scheduledFor: reminder24h,
          data: JSON.stringify({ hours: 24 }),
        },
      });
    }

    // Recordatorio 1 hora antes
    const reminder1h = new Date(scheduledDateTime.getTime() - 60 * 60 * 1000);
    if (reminder1h > new Date()) {
      await prisma.scheduledTask.create({
        data: {
          type: 'preorder_reminder',
          referenceId: preorder.id,
          scheduledFor: reminder1h,
          data: JSON.stringify({ hours: 1 }),
        },
      });
    }
  }

  /**
   * Confirmar pre-pedido
   */
  async confirmPreorder(preorderId) {
    const preorder = await prisma.preorder.findUnique({ where: { id: preorderId } });
    if (!preorder) throw new Error('Pre-pedido no encontrado');

    await prisma.preorder.update({
      where: { id: preorderId },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });

    // Notificar al cliente
    logger.info({ preorderId }, 'Preorder confirmed');
    return { success: true };
  }

  /**
   * Convertir pre-pedido en pedido activo
   */
  async activatePreorder(preorderId) {
    const preorder = await prisma.preorder.findUnique({ where: { id: preorderId } });
    if (!preorder || preorder.status !== 'confirmed') {
      throw new Error('Pre-pedido no válido para activación');
    }

    const items = JSON.parse(preorder.items);

    // Crear pedido real
    const order = await prisma.order.create({
      data: {
        storeId: preorder.storeId,
        customerId: preorder.customerId,
        orderNumber: preorder.orderNumber.replace('PRE-', 'ORD-'),
        subtotal: preorder.subtotal,
        deliveryFee: preorder.deliveryFee,
        total: preorder.total,
        deliveryAddress: preorder.deliveryAddress,
        paymentMethod: preorder.paymentMethod,
        notes: preorder.notes,
        status: 'pending',
        isPreorder: true,
        preorderId: preorder.id,
        items: {
          create: items.map(item => ({
            productId: item.productId,
            productName: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            subtotal: item.price * item.quantity,
            options: item.options || [],
          })),
        },
      },
    });

    await prisma.preorder.update({
      where: { id: preorderId },
      data: { status: 'activated', activatedAt: new Date(), orderId: order.id },
    });

    logger.info({ preorderId, orderId: order.id }, 'Preorder activated');
    return order;
  }

  /**
   * Cancelar pre-pedido
   */
  async cancelPreorder(preorderId, reason = null) {
    const preorder = await prisma.preorder.findUnique({ where: { id: preorderId } });
    if (!preorder) throw new Error('Pre-pedido no encontrado');

    // Verificar política de cancelación
    const scheduledDateTime = new Date(`${preorder.scheduledDate.toISOString().split('T')[0]}T${preorder.scheduledTime}`);
    const hoursUntil = (scheduledDateTime - new Date()) / (1000 * 60 * 60);

    let refundAmount = preorder.total;
    if (hoursUntil < 2) {
      refundAmount = 0; // Sin reembolso si cancela menos de 2 horas antes
    } else if (hoursUntil < 24) {
      refundAmount = preorder.total * 0.5; // 50% reembolso
    }

    await prisma.preorder.update({
      where: { id: preorderId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason,
        refundAmount,
      },
    });

    // Procesar reembolso si aplica
    if (refundAmount > 0) {
      // Integrar con servicio de pagos
    }

    logger.info({ preorderId, refundAmount }, 'Preorder cancelled');
    return { success: true, refundAmount };
  }

  /**
   * Obtener pre-pedidos del día
   */
  async getTodayPreorders(storeId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return prisma.preorder.findMany({
      where: {
        storeId,
        scheduledDate: { gte: today, lt: tomorrow },
        status: { in: ['scheduled', 'confirmed'] },
      },
      orderBy: { scheduledTime: 'asc' },
    });
  }

  /**
   * Obtener slots disponibles
   */
  async getAvailableSlots(storeId, date) {
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    const hours = await prisma.storeHours.findFirst({
      where: { storeId, dayOfWeek },
    });

    if (!hours || hours.isClosed) return [];

    const slots = [];
    const [openHour, openMin] = hours.openTime.split(':').map(Number);
    const [closeHour, closeMin] = hours.closeTime.split(':').map(Number);

    let current = openHour * 60 + openMin;
    const end = closeHour * 60 + closeMin;

    while (current < end) {
      const hour = Math.floor(current / 60);
      const min = current % 60;
      const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

      // Verificar disponibilidad del slot
      const existingCount = await prisma.preorder.count({
        where: {
          storeId,
          scheduledDate: targetDate,
          scheduledTime: time,
          status: { in: ['scheduled', 'confirmed'] },
        },
      });

      slots.push({
        time,
        available: existingCount < 5, // Máximo 5 por slot
        remaining: Math.max(0, 5 - existingCount),
      });

      current += 30; // Slots de 30 minutos
    }

    return slots;
  }

  /**
   * Procesar pre-pedidos pendientes
   */
  async processScheduledPreorders() {
    const now = new Date();
    const activationWindow = new Date(now.getTime() + 30 * 60 * 1000); // 30 min antes

    const toActivate = await prisma.preorder.findMany({
      where: {
        status: 'confirmed',
        scheduledDate: { lte: now },
      },
    });

    let activated = 0;
    for (const preorder of toActivate) {
      const scheduledDateTime = new Date(`${preorder.scheduledDate.toISOString().split('T')[0]}T${preorder.scheduledTime}`);
      
      if (scheduledDateTime <= activationWindow) {
        await this.activatePreorder(preorder.id);
        activated++;
      }
    }

    return { activated };
  }

  /**
   * Modificar pre-pedido
   */
  async modifyPreorder(preorderId, updates) {
    const preorder = await prisma.preorder.findUnique({ where: { id: preorderId } });
    if (!preorder || preorder.status !== 'scheduled') {
      throw new Error('No se puede modificar este pre-pedido');
    }

    const { items, scheduledDate, scheduledTime, notes } = updates;

    const updateData = {};

    if (items) {
      updateData.items = JSON.stringify(items);
      updateData.subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      updateData.total = updateData.subtotal + preorder.deliveryFee;
    }

    if (scheduledDate) updateData.scheduledDate = new Date(scheduledDate);
    if (scheduledTime) updateData.scheduledTime = scheduledTime;
    if (notes !== undefined) updateData.notes = notes;

    await prisma.preorder.update({
      where: { id: preorderId },
      data: updateData,
    });

    return { success: true };
  }
}

export const preordersService = new PreordersService();
export default preordersService;

