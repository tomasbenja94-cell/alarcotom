import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DeliverySlotsService {
  /**
   * Obtener slots disponibles para un día
   */
  async getAvailableSlots(storeId, date) {
    try {
      const dayOfWeek = new Date(date).getDay();
      
      // Obtener configuración de slots
      const config = await prisma.deliverySlotConfig.findFirst({
        where: { storeId }
      });

      if (!config) {
        return this.getDefaultSlots();
      }

      // Obtener reservas existentes
      const existingReservations = await prisma.deliverySlot.findMany({
        where: {
          storeId,
          date: new Date(date),
          status: { in: ['RESERVED', 'CONFIRMED'] }
        }
      });

      const slots = this.generateSlots(config, dayOfWeek);
      
      return slots.map(slot => {
        const reserved = existingReservations.filter(
          r => r.startTime === slot.startTime
        ).length;
        
        return {
          ...slot,
          available: slot.maxOrders - reserved,
          reserved
        };
      }).filter(s => s.available > 0);
    } catch (error) {
      logger.error({ error, storeId }, 'Error obteniendo slots');
      throw error;
    }
  }

  /**
   * Reservar slot de entrega
   */
  async reserveSlot(storeId, customerId, date, startTime, orderId = null) {
    try {
      const slots = await this.getAvailableSlots(storeId, date);
      const slot = slots.find(s => s.startTime === startTime);

      if (!slot || slot.available <= 0) {
        throw new Error('Slot no disponible');
      }

      const reservation = await prisma.deliverySlot.create({
        data: {
          storeId,
          customerId,
          orderId,
          date: new Date(date),
          startTime,
          endTime: slot.endTime,
          status: 'RESERVED',
          createdAt: new Date()
        }
      });

      logger.info({ slotId: reservation.id, date, startTime }, 'Slot reservado');
      return reservation;
    } catch (error) {
      logger.error({ error, storeId }, 'Error reservando slot');
      throw error;
    }
  }

  /**
   * Confirmar slot con pedido
   */
  async confirmSlot(slotId, orderId) {
    return prisma.deliverySlot.update({
      where: { id: slotId },
      data: { orderId, status: 'CONFIRMED' }
    });
  }

  /**
   * Cancelar reserva
   */
  async cancelSlot(slotId) {
    return prisma.deliverySlot.update({
      where: { id: slotId },
      data: { status: 'CANCELLED' }
    });
  }

  /**
   * Configurar slots de tienda
   */
  async configureSlots(storeId, config) {
    return prisma.deliverySlotConfig.upsert({
      where: { storeId },
      create: { storeId, ...config },
      update: config
    });
  }

  /**
   * Generar slots según configuración
   */
  generateSlots(config, dayOfWeek) {
    const slots = [];
    const { startHour, endHour, slotDuration, maxOrdersPerSlot } = config;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += slotDuration) {
        const startTime = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        const endMin = min + slotDuration;
        const endHr = endMin >= 60 ? hour + 1 : hour;
        const endTime = `${endHr.toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;

        slots.push({
          startTime,
          endTime,
          maxOrders: maxOrdersPerSlot
        });
      }
    }

    return slots;
  }

  /**
   * Slots por defecto
   */
  getDefaultSlots() {
    const slots = [];
    for (let hour = 11; hour <= 22; hour++) {
      slots.push({
        startTime: `${hour}:00`,
        endTime: `${hour}:30`,
        maxOrders: 5,
        available: 5
      });
      slots.push({
        startTime: `${hour}:30`,
        endTime: `${hour + 1}:00`,
        maxOrders: 5,
        available: 5
      });
    }
    return slots;
  }
}

export const deliverySlotsService = new DeliverySlotsService();
export default deliverySlotsService;

