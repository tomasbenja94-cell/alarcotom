/**
 * Sistema de Reservas Avanzado
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class ReservationsService {
  /**
   * Crear reservación
   */
  async createReservation(storeId, reservationData) {
    const {
      customerName,
      customerPhone,
      customerEmail,
      date,
      time,
      partySize,
      tablePreference,
      occasion,
      specialRequests,
      preOrderItems,
    } = reservationData;

    // Verificar disponibilidad
    const availability = await this.checkAvailability(storeId, date, time, partySize);
    if (!availability.available) {
      throw new Error(availability.reason);
    }

    // Asignar mesa automáticamente
    const assignedTable = await this.assignTable(storeId, date, time, partySize, tablePreference);

    const reservation = await prisma.reservation.create({
      data: {
        storeId,
        customerName,
        customerPhone,
        customerEmail,
        date: new Date(date),
        time,
        partySize,
        tableId: assignedTable?.id,
        occasion,
        specialRequests,
        preOrderItems: preOrderItems ? JSON.stringify(preOrderItems) : null,
        status: 'confirmed',
        confirmationCode: this.generateConfirmationCode(),
      },
    });

    // Enviar confirmación
    logger.info({ reservationId: reservation.id, code: reservation.confirmationCode }, 'Reservation created');

    return {
      ...reservation,
      table: assignedTable,
    };
  }

  generateConfirmationCode() {
    return 'R' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
  }

  /**
   * Verificar disponibilidad
   */
  async checkAvailability(storeId, date, time, partySize) {
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    // Verificar horario de la tienda
    const storeHours = await prisma.storeHours.findFirst({
      where: { storeId, dayOfWeek },
    });

    if (!storeHours || storeHours.isClosed) {
      return { available: false, reason: 'Tienda cerrada ese día' };
    }

    if (time < storeHours.openTime || time > storeHours.closeTime) {
      return { available: false, reason: 'Fuera del horario de atención' };
    }

    // Verificar mesas disponibles
    const availableTables = await this.getAvailableTables(storeId, date, time, partySize);
    
    if (availableTables.length === 0) {
      // Sugerir horarios alternativos
      const alternatives = await this.suggestAlternativeTimes(storeId, date, partySize);
      return { 
        available: false, 
        reason: 'No hay mesas disponibles para ese horario',
        alternatives,
      };
    }

    return { available: true, tables: availableTables };
  }

  /**
   * Obtener mesas disponibles
   */
  async getAvailableTables(storeId, date, time, partySize) {
    const tables = await prisma.table.findMany({
      where: {
        storeId,
        capacity: { gte: partySize },
        status: { not: 'maintenance' },
      },
    });

    // Filtrar mesas con reservaciones existentes
    const reservations = await prisma.reservation.findMany({
      where: {
        storeId,
        date: new Date(date),
        status: { in: ['confirmed', 'seated'] },
      },
    });

    const reservedTableIds = new Set();
    reservations.forEach(r => {
      // Considerar duración de 2 horas por reservación
      const resTime = this.timeToMinutes(r.time);
      const reqTime = this.timeToMinutes(time);
      if (Math.abs(resTime - reqTime) < 120) {
        reservedTableIds.add(r.tableId);
      }
    });

    return tables.filter(t => !reservedTableIds.has(t.id));
  }

  timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Asignar mesa óptima
   */
  async assignTable(storeId, date, time, partySize, preference) {
    const availableTables = await this.getAvailableTables(storeId, date, time, partySize);
    
    if (availableTables.length === 0) return null;

    // Ordenar por preferencia
    let sorted = availableTables;

    if (preference === 'window') {
      sorted = availableTables.sort((a, b) => (b.isWindow ? 1 : 0) - (a.isWindow ? 1 : 0));
    } else if (preference === 'quiet') {
      sorted = availableTables.sort((a, b) => (b.isQuiet ? 1 : 0) - (a.isQuiet ? 1 : 0));
    } else if (preference === 'outdoor') {
      sorted = availableTables.sort((a, b) => (b.isOutdoor ? 1 : 0) - (a.isOutdoor ? 1 : 0));
    } else {
      // Por defecto, asignar la mesa más pequeña que acomode al grupo
      sorted = availableTables.sort((a, b) => a.capacity - b.capacity);
    }

    return sorted[0];
  }

  /**
   * Sugerir horarios alternativos
   */
  async suggestAlternativeTimes(storeId, date, partySize) {
    const alternatives = [];
    const times = ['12:00', '12:30', '13:00', '13:30', '14:00', '19:00', '19:30', '20:00', '20:30', '21:00'];

    for (const time of times) {
      const available = await this.getAvailableTables(storeId, date, time, partySize);
      if (available.length > 0) {
        alternatives.push({ time, tablesAvailable: available.length });
      }
    }

    return alternatives.slice(0, 5);
  }

  /**
   * Modificar reservación
   */
  async modifyReservation(reservationId, updates) {
    const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new Error('Reservación no encontrada');

    if (updates.date || updates.time || updates.partySize) {
      const availability = await this.checkAvailability(
        reservation.storeId,
        updates.date || reservation.date,
        updates.time || reservation.time,
        updates.partySize || reservation.partySize
      );

      if (!availability.available) {
        throw new Error(availability.reason);
      }

      if (updates.partySize !== reservation.partySize) {
        const newTable = await this.assignTable(
          reservation.storeId,
          updates.date || reservation.date,
          updates.time || reservation.time,
          updates.partySize
        );
        updates.tableId = newTable?.id;
      }
    }

    const updated = await prisma.reservation.update({
      where: { id: reservationId },
      data: updates,
    });

    logger.info({ reservationId }, 'Reservation modified');
    return updated;
  }

  /**
   * Cancelar reservación
   */
  async cancelReservation(reservationId, reason = null) {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    logger.info({ reservationId, reason }, 'Reservation cancelled');
    return { success: true };
  }

  /**
   * Check-in de reservación
   */
  async checkIn(reservationId) {
    const reservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'seated',
        seatedAt: new Date(),
      },
    });

    // Actualizar estado de la mesa
    if (reservation.tableId) {
      await prisma.table.update({
        where: { id: reservation.tableId },
        data: { status: 'occupied' },
      });
    }

    return reservation;
  }

  /**
   * Lista de espera
   */
  async addToWaitlist(storeId, waitlistData) {
    const { customerName, customerPhone, partySize, estimatedWait } = waitlistData;

    const entry = await prisma.waitlistEntry.create({
      data: {
        storeId,
        customerName,
        customerPhone,
        partySize,
        estimatedWait,
        status: 'waiting',
        addedAt: new Date(),
      },
    });

    return entry;
  }

  /**
   * Obtener reservaciones del día
   */
  async getDayReservations(storeId, date) {
    return prisma.reservation.findMany({
      where: {
        storeId,
        date: new Date(date),
        status: { not: 'cancelled' },
      },
      include: { table: true },
      orderBy: { time: 'asc' },
    });
  }

  /**
   * Estadísticas de reservaciones
   */
  async getReservationStats(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const reservations = await prisma.reservation.findMany({
      where: { storeId, date: { gte: startDate } },
    });

    const total = reservations.length;
    const confirmed = reservations.filter(r => r.status === 'confirmed').length;
    const seated = reservations.filter(r => r.status === 'seated' || r.status === 'completed').length;
    const noShow = reservations.filter(r => r.status === 'no_show').length;
    const cancelled = reservations.filter(r => r.status === 'cancelled').length;

    return {
      total,
      confirmed,
      seated,
      noShow,
      cancelled,
      showRate: total > 0 ? Math.round((seated / (total - cancelled)) * 100) : 0,
      avgPartySize: total > 0
        ? Math.round(reservations.reduce((sum, r) => sum + r.partySize, 0) / total * 10) / 10
        : 0,
    };
  }
}

export const reservationsService = new ReservationsService();
export default reservationsService;

