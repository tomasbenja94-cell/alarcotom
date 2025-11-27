/**
 * Sistema de Horarios de Tienda
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class StoreHoursService {
  DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  /**
   * Configurar horarios
   */
  async setHours(storeId, hours) {
    // hours: { monday: { open: '09:00', close: '22:00', isOpen: true }, ... }
    
    await prisma.storeHours.deleteMany({ where: { storeId } });

    const data = Object.entries(hours).map(([day, config]) => ({
      storeId,
      day,
      openTime: config.open,
      closeTime: config.close,
      isOpen: config.isOpen ?? true,
    }));

    await prisma.storeHours.createMany({ data });

    logger.info({ storeId }, 'Store hours updated');
    return { success: true };
  }

  /**
   * Obtener horarios
   */
  async getHours(storeId) {
    const hours = await prisma.storeHours.findMany({
      where: { storeId },
    });

    const result = {};
    this.DAYS.forEach((day, i) => {
      const config = hours.find(h => h.day === day);
      result[day] = {
        dayName: this.DAY_NAMES[i],
        open: config?.openTime || '09:00',
        close: config?.closeTime || '22:00',
        isOpen: config?.isOpen ?? true,
      };
    });

    return result;
  }

  /**
   * Verificar si está abierto ahora
   */
  async isOpen(storeId) {
    const now = new Date();
    const dayName = this.DAYS[now.getDay()];
    const currentTime = now.toTimeString().slice(0, 5);

    // Verificar cierre temporal
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (store?.temporarilyClosed) {
      return {
        isOpen: false,
        reason: 'temporarily_closed',
        message: store.closedMessage || 'Cerrado temporalmente',
      };
    }

    // Verificar feriado
    const holiday = await this.checkHoliday(storeId, now);
    if (holiday) {
      return {
        isOpen: holiday.isOpen,
        reason: 'holiday',
        message: holiday.name,
        hours: holiday.isOpen ? { open: holiday.openTime, close: holiday.closeTime } : null,
      };
    }

    // Verificar horario normal
    const hours = await prisma.storeHours.findFirst({
      where: { storeId, day: dayName },
    });

    if (!hours || !hours.isOpen) {
      return {
        isOpen: false,
        reason: 'closed_day',
        message: `Cerrado los ${this.DAY_NAMES[now.getDay()]}`,
      };
    }

    const isWithinHours = currentTime >= hours.openTime && currentTime < hours.closeTime;

    if (!isWithinHours) {
      const opensAt = currentTime < hours.openTime ? hours.openTime : null;
      return {
        isOpen: false,
        reason: 'outside_hours',
        message: opensAt ? `Abre a las ${opensAt}` : `Cerrado. Abre mañana`,
        hours: { open: hours.openTime, close: hours.closeTime },
      };
    }

    // Verificar si está por cerrar (últimos 30 min)
    const closeMinutes = this.timeToMinutes(hours.closeTime);
    const currentMinutes = this.timeToMinutes(currentTime);
    const minutesUntilClose = closeMinutes - currentMinutes;

    return {
      isOpen: true,
      closingSoon: minutesUntilClose <= 30,
      closesAt: hours.closeTime,
      minutesUntilClose,
    };
  }

  timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Próxima apertura
   */
  async getNextOpenTime(storeId) {
    const now = new Date();
    const hours = await this.getHours(storeId);

    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + i);
      const dayName = this.DAYS[checkDate.getDay()];
      const dayHours = hours[dayName];

      if (!dayHours.isOpen) continue;

      // Si es hoy, verificar si ya pasó la hora de apertura
      if (i === 0) {
        const currentTime = now.toTimeString().slice(0, 5);
        if (currentTime < dayHours.open) {
          return {
            date: checkDate,
            day: dayHours.dayName,
            time: dayHours.open,
            isToday: true,
          };
        }
        continue;
      }

      return {
        date: checkDate,
        day: dayHours.dayName,
        time: dayHours.open,
        isToday: false,
      };
    }

    return null;
  }

  /**
   * Agregar feriado/día especial
   */
  async addSpecialDay(storeId, specialDay) {
    const { date, name, isOpen, openTime, closeTime } = specialDay;

    return prisma.storeSpecialDay.create({
      data: {
        storeId,
        date: new Date(date),
        name,
        isOpen: isOpen ?? false,
        openTime,
        closeTime,
      },
    });
  }

  /**
   * Verificar feriado
   */
  async checkHoliday(storeId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return prisma.storeSpecialDay.findFirst({
      where: {
        storeId,
        date: { gte: startOfDay, lte: endOfDay },
      },
    });
  }

  /**
   * Cerrar temporalmente
   */
  async setTemporaryClosure(storeId, isClosed, message = null, reopenAt = null) {
    await prisma.store.update({
      where: { id: storeId },
      data: {
        temporarilyClosed: isClosed,
        closedMessage: message,
        reopenAt: reopenAt ? new Date(reopenAt) : null,
      },
    });

    logger.info({ storeId, isClosed }, 'Store temporary closure updated');
    return { success: true };
  }

  /**
   * Horarios formateados para mostrar
   */
  async getFormattedHours(storeId) {
    const hours = await this.getHours(storeId);
    
    const formatted = [];
    let currentGroup = null;

    Object.entries(hours).forEach(([day, config], i) => {
      const hoursStr = config.isOpen ? `${config.open} - ${config.close}` : 'Cerrado';

      if (currentGroup && currentGroup.hours === hoursStr) {
        currentGroup.endDay = this.DAY_NAMES[i];
        currentGroup.endIndex = i;
      } else {
        if (currentGroup) formatted.push(currentGroup);
        currentGroup = {
          startDay: this.DAY_NAMES[i],
          endDay: this.DAY_NAMES[i],
          startIndex: i,
          endIndex: i,
          hours: hoursStr,
          isOpen: config.isOpen,
        };
      }
    });

    if (currentGroup) formatted.push(currentGroup);

    return formatted.map(g => ({
      days: g.startIndex === g.endIndex 
        ? g.startDay 
        : `${g.startDay} a ${g.endDay}`,
      hours: g.hours,
      isOpen: g.isOpen,
    }));
  }

  /**
   * Verificar si puede recibir pedidos
   */
  async canAcceptOrders(storeId, scheduledFor = null) {
    // Si es pedido programado, verificar esa fecha
    if (scheduledFor) {
      const scheduleDate = new Date(scheduledFor);
      const dayName = this.DAYS[scheduleDate.getDay()];
      const time = scheduleDate.toTimeString().slice(0, 5);

      const hours = await prisma.storeHours.findFirst({
        where: { storeId, day: dayName },
      });

      if (!hours?.isOpen) {
        return { canAccept: false, reason: 'Cerrado ese día' };
      }

      if (time < hours.openTime || time >= hours.closeTime) {
        return { canAccept: false, reason: `Horario: ${hours.openTime} - ${hours.closeTime}` };
      }

      return { canAccept: true };
    }

    // Pedido inmediato
    const status = await this.isOpen(storeId);
    return {
      canAccept: status.isOpen,
      reason: status.message,
      closingSoon: status.closingSoon,
    };
  }
}

export const storeHoursService = new StoreHoursService();
export default storeHoursService;
