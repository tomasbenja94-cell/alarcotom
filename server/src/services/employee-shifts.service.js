/**
 * Sistema de Turnos para Empleados
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class EmployeeShiftsService {
  /**
   * Crear turno
   */
  async createShift(storeId, shiftData) {
    const { employeeId, date, startTime, endTime, role, notes } = shiftData;

    // Verificar conflictos
    const conflict = await this.checkConflict(employeeId, date, startTime, endTime);
    if (conflict) throw new Error('El empleado ya tiene un turno en ese horario');

    const shift = await prisma.employeeShift.create({
      data: {
        storeId,
        employeeId,
        date: new Date(date),
        startTime,
        endTime,
        role, // 'kitchen', 'delivery', 'cashier', 'manager'
        notes,
        status: 'scheduled',
      },
    });

    logger.info({ shiftId: shift.id, employeeId }, 'Shift created');
    return shift;
  }

  /**
   * Verificar conflictos de horario
   */
  async checkConflict(employeeId, date, startTime, endTime, excludeShiftId = null) {
    const shifts = await prisma.employeeShift.findMany({
      where: {
        employeeId,
        date: new Date(date),
        status: { not: 'cancelled' },
        ...(excludeShiftId && { id: { not: excludeShiftId } }),
      },
    });

    const newStart = this.timeToMinutes(startTime);
    const newEnd = this.timeToMinutes(endTime);

    return shifts.some(shift => {
      const shiftStart = this.timeToMinutes(shift.startTime);
      const shiftEnd = this.timeToMinutes(shift.endTime);
      return (newStart < shiftEnd && newEnd > shiftStart);
    });
  }

  timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Registrar entrada
   */
  async clockIn(shiftId, location = null) {
    const shift = await prisma.employeeShift.findUnique({ where: { id: shiftId } });
    
    if (!shift) throw new Error('Turno no encontrado');
    if (shift.clockInTime) throw new Error('Ya registró entrada');

    const now = new Date();
    const scheduledStart = this.timeToMinutes(shift.startTime);
    const actualStart = now.getHours() * 60 + now.getMinutes();
    const lateMinutes = Math.max(0, actualStart - scheduledStart);

    await prisma.employeeShift.update({
      where: { id: shiftId },
      data: {
        clockInTime: now,
        clockInLocation: location ? JSON.stringify(location) : null,
        status: 'in_progress',
        lateMinutes,
      },
    });

    logger.info({ shiftId, lateMinutes }, 'Clock in recorded');
    return { success: true, lateMinutes };
  }

  /**
   * Registrar salida
   */
  async clockOut(shiftId, location = null) {
    const shift = await prisma.employeeShift.findUnique({ where: { id: shiftId } });
    
    if (!shift) throw new Error('Turno no encontrado');
    if (!shift.clockInTime) throw new Error('No registró entrada');
    if (shift.clockOutTime) throw new Error('Ya registró salida');

    const now = new Date();
    const workedMinutes = Math.round((now - new Date(shift.clockInTime)) / 60000);

    await prisma.employeeShift.update({
      where: { id: shiftId },
      data: {
        clockOutTime: now,
        clockOutLocation: location ? JSON.stringify(location) : null,
        status: 'completed',
        workedMinutes,
      },
    });

    logger.info({ shiftId, workedMinutes }, 'Clock out recorded');
    return { success: true, workedMinutes };
  }

  /**
   * Obtener turnos del día
   */
  async getDayShifts(storeId, date) {
    return prisma.employeeShift.findMany({
      where: {
        storeId,
        date: new Date(date),
        status: { not: 'cancelled' },
      },
      include: {
        employee: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  /**
   * Obtener turnos de un empleado
   */
  async getEmployeeShifts(employeeId, startDate, endDate) {
    return prisma.employeeShift.findMany({
      where: {
        employeeId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Calendario de turnos semanal
   */
  async getWeekSchedule(storeId, weekStart) {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const shifts = await prisma.employeeShift.findMany({
      where: {
        storeId,
        date: { gte: start, lt: end },
        status: { not: 'cancelled' },
      },
      include: {
        employee: { select: { id: true, name: true, role: true } },
      },
    });

    // Organizar por día
    const schedule = {};
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const dayKey = day.toISOString().split('T')[0];
      schedule[dayKey] = shifts.filter(s => 
        s.date.toISOString().split('T')[0] === dayKey
      );
    }

    return schedule;
  }

  /**
   * Intercambiar turnos
   */
  async swapShifts(shiftId1, shiftId2, requestedBy) {
    const [shift1, shift2] = await Promise.all([
      prisma.employeeShift.findUnique({ where: { id: shiftId1 } }),
      prisma.employeeShift.findUnique({ where: { id: shiftId2 } }),
    ]);

    if (!shift1 || !shift2) throw new Error('Turnos no encontrados');

    // Verificar que no haya conflictos
    const conflict1 = await this.checkConflict(shift2.employeeId, shift1.date, shift1.startTime, shift1.endTime);
    const conflict2 = await this.checkConflict(shift1.employeeId, shift2.date, shift2.startTime, shift2.endTime);

    if (conflict1 || conflict2) throw new Error('El intercambio genera conflictos de horario');

    // Realizar intercambio
    await prisma.$transaction([
      prisma.employeeShift.update({
        where: { id: shiftId1 },
        data: { employeeId: shift2.employeeId },
      }),
      prisma.employeeShift.update({
        where: { id: shiftId2 },
        data: { employeeId: shift1.employeeId },
      }),
    ]);

    logger.info({ shiftId1, shiftId2, requestedBy }, 'Shifts swapped');
    return { success: true };
  }

  /**
   * Reporte de horas trabajadas
   */
  async getHoursReport(storeId, startDate, endDate) {
    const shifts = await prisma.employeeShift.findMany({
      where: {
        storeId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
        status: 'completed',
      },
      include: {
        employee: { select: { id: true, name: true } },
      },
    });

    const byEmployee = {};

    shifts.forEach(shift => {
      if (!byEmployee[shift.employeeId]) {
        byEmployee[shift.employeeId] = {
          name: shift.employee.name,
          shifts: 0,
          totalMinutes: 0,
          lateMinutes: 0,
        };
      }
      byEmployee[shift.employeeId].shifts++;
      byEmployee[shift.employeeId].totalMinutes += shift.workedMinutes || 0;
      byEmployee[shift.employeeId].lateMinutes += shift.lateMinutes || 0;
    });

    return Object.entries(byEmployee).map(([id, data]) => ({
      employeeId: id,
      ...data,
      totalHours: Math.round(data.totalMinutes / 60 * 10) / 10,
    }));
  }
}

export const employeeShiftsService = new EmployeeShiftsService();
export default employeeShiftsService;

