/**
 * Sistema de Gestión de Mesas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class TablesService {
  TABLE_STATUS = {
    AVAILABLE: 'available',
    OCCUPIED: 'occupied',
    RESERVED: 'reserved',
    CLEANING: 'cleaning',
  };

  /**
   * Crear mesa
   */
  async createTable(storeId, tableData) {
    const { number, capacity, zone = 'main', position = null } = tableData;

    // Verificar que no exista mesa con ese número
    const existing = await prisma.table.findFirst({
      where: { storeId, number },
    });

    if (existing) {
      throw new Error(`Ya existe la mesa ${number}`);
    }

    const table = await prisma.table.create({
      data: {
        storeId,
        number,
        capacity,
        zone,
        position: position ? JSON.stringify(position) : null,
        status: this.TABLE_STATUS.AVAILABLE,
        qrCode: this.generateQRCode(storeId, number),
      },
    });

    logger.info({ tableId: table.id, number }, 'Table created');
    return table;
  }

  /**
   * Generar código QR único
   */
  generateQRCode(storeId, tableNumber) {
    const timestamp = Date.now().toString(36);
    return `${storeId}-T${tableNumber}-${timestamp}`;
  }

  /**
   * Obtener todas las mesas de una tienda
   */
  async getStoreTables(storeId) {
    return prisma.table.findMany({
      where: { storeId },
      orderBy: [{ zone: 'asc' }, { number: 'asc' }],
      include: {
        currentOrder: {
          select: { id: true, orderNumber: true, total: true, status: true },
        },
      },
    });
  }

  /**
   * Actualizar estado de mesa
   */
  async updateTableStatus(tableId, status) {
    if (!Object.values(this.TABLE_STATUS).includes(status)) {
      throw new Error('Estado de mesa inválido');
    }

    const table = await prisma.table.update({
      where: { id: tableId },
      data: { status, updatedAt: new Date() },
    });

    logger.info({ tableId, status }, 'Table status updated');
    return table;
  }

  /**
   * Ocupar mesa con pedido
   */
  async occupyTable(tableId, orderId) {
    const table = await prisma.table.findUnique({ where: { id: tableId } });

    if (!table) throw new Error('Mesa no encontrada');
    if (table.status === this.TABLE_STATUS.OCCUPIED) {
      throw new Error('La mesa ya está ocupada');
    }

    await prisma.table.update({
      where: { id: tableId },
      data: {
        status: this.TABLE_STATUS.OCCUPIED,
        currentOrderId: orderId,
        occupiedAt: new Date(),
      },
    });

    logger.info({ tableId, orderId }, 'Table occupied');
    return { success: true };
  }

  /**
   * Liberar mesa
   */
  async releaseTable(tableId) {
    await prisma.table.update({
      where: { id: tableId },
      data: {
        status: this.TABLE_STATUS.CLEANING,
        currentOrderId: null,
        occupiedAt: null,
      },
    });

    // Después de 5 min, marcar como disponible
    setTimeout(async () => {
      await prisma.table.update({
        where: { id: tableId },
        data: { status: this.TABLE_STATUS.AVAILABLE },
      });
    }, 5 * 60 * 1000);

    logger.info({ tableId }, 'Table released');
    return { success: true };
  }

  /**
   * Obtener mesa por QR
   */
  async getTableByQR(qrCode) {
    return prisma.table.findFirst({
      where: { qrCode },
      include: { store: { select: { id: true, name: true, slug: true } } },
    });
  }

  /**
   * Reservar mesa
   */
  async reserveTable(tableId, reservationData) {
    const { customerName, customerPhone, date, time, partySize, notes } = reservationData;

    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new Error('Mesa no encontrada');
    if (table.capacity < partySize) throw new Error('La mesa no tiene suficiente capacidad');

    const reservationDate = new Date(`${date}T${time}`);

    const reservation = await prisma.tableReservation.create({
      data: {
        tableId,
        storeId: table.storeId,
        customerName,
        customerPhone,
        reservationDate,
        partySize,
        notes,
        status: 'confirmed',
      },
    });

    logger.info({ reservationId: reservation.id, tableId }, 'Table reserved');
    return reservation;
  }

  /**
   * Obtener reservaciones del día
   */
  async getDayReservations(storeId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return prisma.tableReservation.findMany({
      where: {
        storeId,
        reservationDate: { gte: startOfDay, lte: endOfDay },
        status: { not: 'cancelled' },
      },
      include: { table: true },
      orderBy: { reservationDate: 'asc' },
    });
  }

  /**
   * Mapa de mesas en tiempo real
   */
  async getTableMap(storeId) {
    const tables = await this.getStoreTables(storeId);

    const zones = {};
    tables.forEach(table => {
      if (!zones[table.zone]) {
        zones[table.zone] = [];
      }
      zones[table.zone].push({
        id: table.id,
        number: table.number,
        capacity: table.capacity,
        status: table.status,
        position: table.position ? JSON.parse(table.position) : null,
        currentOrder: table.currentOrder,
        occupiedMinutes: table.occupiedAt 
          ? Math.floor((Date.now() - new Date(table.occupiedAt).getTime()) / 60000)
          : null,
      });
    });

    return zones;
  }

  /**
   * Estadísticas de mesas
   */
  async getTableStats(storeId) {
    const tables = await prisma.table.findMany({ where: { storeId } });

    const stats = {
      total: tables.length,
      available: tables.filter(t => t.status === this.TABLE_STATUS.AVAILABLE).length,
      occupied: tables.filter(t => t.status === this.TABLE_STATUS.OCCUPIED).length,
      reserved: tables.filter(t => t.status === this.TABLE_STATUS.RESERVED).length,
      cleaning: tables.filter(t => t.status === this.TABLE_STATUS.CLEANING).length,
      totalCapacity: tables.reduce((sum, t) => sum + t.capacity, 0),
    };

    stats.occupancyRate = stats.total > 0 
      ? Math.round((stats.occupied / stats.total) * 100) 
      : 0;

    return stats;
  }
}

export const tablesService = new TablesService();
export default tablesService;
