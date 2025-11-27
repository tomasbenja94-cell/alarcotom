/**
 * Sistema de Gestión de Horarios de Empleados
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class EmployeeSchedulingService {
  /**
   * Crear turno
   */
  async createShift(storeId, shiftData) {
    const { employeeId, date, startTime, endTime, role, notes } = shiftData;

    // Validar conflictos
    const conflict = await this.checkConflict(employeeId, date, startTime, endTime);
    if (conflict) {
      throw new Error('El empleado ya tiene un turno en ese horario');
    }

    const shift = await prisma.employeeShift.create({
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

    logger.info({ shiftId: shift.id, employeeId }, 'Shift created');
    return shift;
  }

  async checkConflict(employeeId, date, startTime, endTime, excludeShiftId = null) {
    const shifts = await prisma.employeeShift.findMany({
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
      const existingStart = this.timeToMinutes(shift.startTime);
      const existingEnd = this.timeToMinutes(shift.endTime);
      return newStart < existingEnd && newEnd > existingStart;
    });
  }

  timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Obtener horario semanal
   */
  async getWeeklySchedule(storeId, weekStart) {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const shifts = await prisma.employeeShift.findMany({
      where: {
        storeId,
        date: { gte: start, lt: end },
        status: { not: 'cancelled' },
      },
      include: { employee: { select: { id: true, name: true, role: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    // Agrupar por día
    const schedule = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      schedule[dateStr] = shifts.filter(s => s.date.toISOString().split('T')[0] === dateStr);
    }

    return schedule;
  }

  /**
   * Fichar entrada
   */
  async clockIn(shiftId, employeeId, location = null) {
    const shift = await prisma.employeeShift.findUnique({ where: { id: shiftId } });

    if (!shift || shift.employeeId !== employeeId) {
      throw new Error('Turno no válido');
    }

    if (shift.clockInTime) {
      throw new Error('Ya fichaste entrada');
    }

    const now = new Date();
    const scheduledStart = this.parseTime(shift.date, shift.startTime);
    const lateMinutes = Math.max(0, Math.floor((now - scheduledStart) / 60000));

    await prisma.employeeShift.update({
      where: { id: shiftId },
      data: {
        clockInTime: now,
        clockInLocation: location ? JSON.stringify(location) : null,
        lateMinutes,
        status: 'in_progress',
      },
    });

    logger.info({ shiftId, lateMinutes }, 'Clock in recorded');
    return { success: true, lateMinutes };
  }

  parseTime(date, time) {
    const [hours, minutes] = time.split(':').map(Number);
    const d = new Date(date);
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  /**
   * Fichar salida
   */
  async clockOut(shiftId, employeeId, location = null) {
    const shift = await prisma.employeeShift.findUnique({ where: { id: shiftId } });

    if (!shift || shift.employeeId !== employeeId) {
      throw new Error('Turno no válido');
    }

    if (!shift.clockInTime) {
      throw new Error('No fichaste entrada');
    }

    if (shift.clockOutTime) {
      throw new Error('Ya fichaste salida');
    }

    const now = new Date();
    const workedMinutes = Math.floor((now - shift.clockInTime) / 60000);
    const scheduledEnd = this.parseTime(shift.date, shift.endTime);
    const earlyMinutes = Math.max(0, Math.floor((scheduledEnd - now) / 60000));
    const overtimeMinutes = Math.max(0, Math.floor((now - scheduledEnd) / 60000));

    await prisma.employeeShift.update({
      where: { id: shiftId },
      data: {
        clockOutTime: now,
        clockOutLocation: location ? JSON.stringify(location) : null,
        workedMinutes,
        earlyMinutes,
        overtimeMinutes,
        status: 'completed',
      },
    });

    logger.info({ shiftId, workedMinutes, overtimeMinutes }, 'Clock out recorded');
    return { success: true, workedMinutes, overtimeMinutes };
  }

  /**
   * Solicitar cambio de turno
   */
  async requestShiftSwap(shiftId, targetEmployeeId, reason) {
    const shift = await prisma.employeeShift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new Error('Turno no encontrado');

    // Verificar disponibilidad del empleado objetivo
    const conflict = await this.checkConflict(
      targetEmployeeId,
      shift.date.toISOString().split('T')[0],
      shift.startTime,
      shift.endTime
    );

    if (conflict) {
      throw new Error('El empleado objetivo tiene un conflicto de horario');
    }

    return prisma.shiftSwapRequest.create({
      data: {
        shiftId,
        requestingEmployeeId: shift.employeeId,
        targetEmployeeId,
        reason,
        status: 'pending',
      },
    });
  }

  /**
   * Aprobar cambio de turno
   */
  async approveShiftSwap(requestId, approved, managerId) {
    const request = await prisma.shiftSwapRequest.findUnique({
      where: { id: requestId },
      include: { shift: true },
    });

    if (!request) throw new Error('Solicitud no encontrada');

    if (approved) {
      await prisma.$transaction([
        prisma.employeeShift.update({
          where: { id: request.shiftId },
          data: { employeeId: request.targetEmployeeId },
        }),
        prisma.shiftSwapRequest.update({
          where: { id: requestId },
          data: { status: 'approved', approvedBy: managerId, approvedAt: new Date() },
        }),
      ]);
    } else {
      await prisma.shiftSwapRequest.update({
        where: { id: requestId },
        data: { status: 'rejected', approvedBy: managerId, approvedAt: new Date() },
      });
    }

    return { success: true };
  }

  /**
   * Solicitar tiempo libre
   */
  async requestTimeOff(employeeId, startDate, endDate, reason, type) {
    return prisma.timeOffRequest.create({
      data: {
        employeeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        type, // 'vacation', 'sick', 'personal', 'other'
        status: 'pending',
      },
    });
  }

  /**
   * Reporte de horas trabajadas
   */
  async getWorkHoursReport(storeId, employeeId, startDate, endDate) {
    const shifts = await prisma.employeeShift.findMany({
      where: {
        storeId,
        employeeId: employeeId || undefined,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
        status: 'completed',
      },
      include: { employee: { select: { name: true, role: true } } },
    });

    const byEmployee = {};

    shifts.forEach(shift => {
      const empId = shift.employeeId;
      if (!byEmployee[empId]) {
        byEmployee[empId] = {
          name: shift.employee.name,
          role: shift.employee.role,
          totalMinutes: 0,
          overtimeMinutes: 0,
          lateMinutes: 0,
          shifts: 0,
        };
      }

      byEmployee[empId].totalMinutes += shift.workedMinutes || 0;
      byEmployee[empId].overtimeMinutes += shift.overtimeMinutes || 0;
      byEmployee[empId].lateMinutes += shift.lateMinutes || 0;
      byEmployee[empId].shifts++;
    });

    return Object.entries(byEmployee).map(([id, data]) => ({
      employeeId: id,
      ...data,
      totalHours: Math.round(data.totalMinutes / 60 * 10) / 10,
      overtimeHours: Math.round(data.overtimeMinutes / 60 * 10) / 10,
    }));
  }

  /**
   * Generar horario automático
   */
  async autoGenerateSchedule(storeId, weekStart, requirements) {
    // requirements: { day: { role: count } }
    const employees = await prisma.employee.findMany({
      where: { storeId, isActive: true },
      include: { availability: true },
    });

    const schedule = [];
    const start = new Date(weekStart);

    for (let day = 0; day < 7; day++) {
      const date = new Date(start);
      date.setDate(date.getDate() + day);
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];

      const dayRequirements = requirements[dayName] || {};

      for (const [role, count] of Object.entries(dayRequirements)) {
        const availableEmployees = employees.filter(e =>
          e.role === role &&
          e.availability?.some(a => a.day === dayName && a.isAvailable)
        );

        const assigned = availableEmployees.slice(0, count);

        for (const emp of assigned) {
          const availability = emp.availability.find(a => a.day === dayName);
          schedule.push({
            storeId,
            employeeId: emp.id,
            date: date.toISOString().split('T')[0],
            startTime: availability?.startTime || '09:00',
            endTime: availability?.endTime || '17:00',
            role,
          });
        }
      }
    }

    // Crear turnos
    for (const shift of schedule) {
      try {
        await this.createShift(storeId, shift);
      } catch (e) {
        logger.warn({ shift, error: e.message }, 'Failed to create shift');
      }
    }

    return { created: schedule.length };
  }

  /**
   * Disponibilidad del empleado
   */
  async setEmployeeAvailability(employeeId, availability) {
    // availability: [{ day, isAvailable, startTime, endTime }]
    await prisma.employeeAvailability.deleteMany({ where: { employeeId } });

    await prisma.employeeAvailability.createMany({
      data: availability.map(a => ({
        employeeId,
        day: a.day,
        isAvailable: a.isAvailable,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
    });

    return { success: true };
  }
}

export const employeeSchedulingService = new EmployeeSchedulingService();
export default employeeSchedulingService;

