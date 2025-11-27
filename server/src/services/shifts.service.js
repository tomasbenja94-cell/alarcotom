/**
 * Sistema de Gestión de Turnos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class ShiftsService {
  /**
   * Crear turno
   */
  async createShift(storeId, shiftData) {
    const { employeeId, date, startTime, endTime, role, notes } = shiftData;

    // Verificar conflictos
    const conflict = await this.checkConflict(employeeId, date, startTime, endTime);
    if (conflict) throw new Error('El empleado ya tiene un turno en ese horario');

    const shift = await prisma.shift.create({
      data: {
        storeId,
        employeeId,
        date: new Date(date),
        startTime,
        endTime,
        role,
        notes,
        status: 'scheduled',
      },
    });

    logger.info({ shiftId: shift.id, employeeId, date }, 'Shift created');
    return shift;
  }

  async checkConflict(employeeId, date, startTime, endTime, excludeShiftId = null) {
    const shifts = await prisma.shift.findMany({
      where: {
        employeeId,
        date: new Date(date),
        status: { not: 'cancelled' },
        id: excludeShiftId ? { not: excludeShiftId } : undefined,
      },
    });

    const newStart = this.timeToMinutes(startTime);
    const newEnd = this.timeToMinutes(endTime);

    return shifts.some(shift => {
      const existStart = this.timeToMinutes(shift.startTime);
      const existEnd = this.timeToMinutes(shift.endTime);
      return newStart < existEnd && newEnd > existStart;
    });
  }

  timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Crear horario semanal
   */
  async createWeeklySchedule(storeId, weekStart, scheduleData) {
    const shifts = [];

    for (const entry of scheduleData) {
      const { employeeId, dayOffset, startTime, endTime, role } = entry;
      const date = new Date(weekStart);
      date.setDate(date.getDate() + dayOffset);

      try {
        const shift = await this.createShift(storeId, {
          employeeId,
          date: date.toISOString().split('T')[0],
          startTime,
          endTime,
          role,
        });
        shifts.push(shift);
      } catch (e) {
        shifts.push({ error: e.message, entry });
      }
    }

    return { created: shifts.filter(s => !s.error).length, errors: shifts.filter(s => s.error) };
  }

  /**
   * Registrar entrada
   */
  async clockIn(shiftId, location = null) {
    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new Error('Turno no encontrado');
    if (shift.clockIn) throw new Error('Ya registró entrada');

    const now = new Date();
    const scheduledStart = this.timeToMinutes(shift.startTime);
    const actualStart = now.getHours() * 60 + now.getMinutes();
    const lateMinutes = Math.max(0, actualStart - scheduledStart);

    await prisma.shift.update({
      where: { id: shiftId },
      data: {
        clockIn: now,
        clockInLocation: location,
        status: 'in_progress',
        lateMinutes,
      },
    });

    return { success: true, lateMinutes, clockIn: now };
  }

  /**
   * Registrar salida
   */
  async clockOut(shiftId, location = null) {
    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new Error('Turno no encontrado');
    if (!shift.clockIn) throw new Error('No registró entrada');
    if (shift.clockOut) throw new Error('Ya registró salida');

    const now = new Date();
    const workedMinutes = Math.round((now - shift.clockIn) / 60000);
    const scheduledEnd = this.timeToMinutes(shift.endTime);
    const actualEnd = now.getHours() * 60 + now.getMinutes();
    const overtimeMinutes = Math.max(0, actualEnd - scheduledEnd);

    await prisma.shift.update({
      where: { id: shiftId },
      data: {
        clockOut: now,
        clockOutLocation: location,
        status: 'completed',
        workedMinutes,
        overtimeMinutes,
      },
    });

    return { success: true, workedMinutes, overtimeMinutes, clockOut: now };
  }

  /**
   * Solicitar cambio de turno
   */
  async requestShiftSwap(shiftId, targetEmployeeId, reason) {
    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new Error('Turno no encontrado');

    const swapRequest = await prisma.shiftSwapRequest.create({
      data: {
        shiftId,
        requesterId: shift.employeeId,
        targetEmployeeId,
        reason,
        status: 'pending',
      },
    });

    logger.info({ swapRequestId: swapRequest.id, shiftId }, 'Shift swap requested');
    return swapRequest;
  }

  /**
   * Aprobar cambio de turno
   */
  async approveShiftSwap(swapRequestId, approverId) {
    const request = await prisma.shiftSwapRequest.findUnique({
      where: { id: swapRequestId },
      include: { shift: true },
    });

    if (!request) throw new Error('Solicitud no encontrada');

    // Verificar conflictos para el nuevo empleado
    const conflict = await this.checkConflict(
      request.targetEmployeeId,
      request.shift.date,
      request.shift.startTime,
      request.shift.endTime
    );

    if (conflict) throw new Error('El empleado destino tiene conflicto de horario');

    await prisma.$transaction([
      prisma.shift.update({
        where: { id: request.shiftId },
        data: { employeeId: request.targetEmployeeId },
      }),
      prisma.shiftSwapRequest.update({
        where: { id: swapRequestId },
        data: { status: 'approved', approvedBy: approverId, approvedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  /**
   * Obtener horario de la semana
   */
  async getWeeklySchedule(storeId, weekStart) {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const shifts = await prisma.shift.findMany({
      where: {
        storeId,
        date: { gte: start, lt: end },
        status: { not: 'cancelled' },
      },
      include: { employee: { select: { name: true, role: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    // Organizar por día
    const schedule = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().split('T')[0];
      schedule[key] = shifts.filter(s => s.date.toISOString().split('T')[0] === key);
    }

    return schedule;
  }

  /**
   * Reporte de horas trabajadas
   */
  async getHoursReport(storeId, employeeId, startDate, endDate) {
    const shifts = await prisma.shift.findMany({
      where: {
        storeId,
        employeeId: employeeId || undefined,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
        status: 'completed',
      },
      include: { employee: { select: { name: true } } },
    });

    const byEmployee = {};
    shifts.forEach(shift => {
      if (!byEmployee[shift.employeeId]) {
        byEmployee[shift.employeeId] = {
          name: shift.employee.name,
          totalMinutes: 0,
          overtimeMinutes: 0,
          lateMinutes: 0,
          shifts: 0,
        };
      }
      byEmployee[shift.employeeId].totalMinutes += shift.workedMinutes || 0;
      byEmployee[shift.employeeId].overtimeMinutes += shift.overtimeMinutes || 0;
      byEmployee[shift.employeeId].lateMinutes += shift.lateMinutes || 0;
      byEmployee[shift.employeeId].shifts++;
    });

    return Object.entries(byEmployee).map(([id, data]) => ({
      employeeId: id,
      ...data,
      totalHours: Math.round(data.totalMinutes / 60 * 10) / 10,
      overtimeHours: Math.round(data.overtimeMinutes / 60 * 10) / 10,
    }));
  }

  /**
   * Verificar cobertura de turnos
   */
  async checkCoverage(storeId, date, requirements) {
    const shifts = await prisma.shift.findMany({
      where: { storeId, date: new Date(date), status: { not: 'cancelled' } },
    });

    const coverage = {};
    const gaps = [];

    for (const [role, required] of Object.entries(requirements)) {
      const roleShifts = shifts.filter(s => s.role === role);
      coverage[role] = {
        required,
        scheduled: roleShifts.length,
        covered: roleShifts.length >= required,
      };

      if (roleShifts.length < required) {
        gaps.push({ role, missing: required - roleShifts.length });
      }
    }

    return { date, coverage, gaps, isFullyCovered: gaps.length === 0 };
  }
}

export const shiftsService = new ShiftsService();
export default shiftsService;

