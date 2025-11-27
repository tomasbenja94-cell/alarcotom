/**
 * Servicio de Modo Mantenimiento
 * Permite pausar tiendas temporalmente
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class MaintenanceService {
  /**
   * Activar modo mantenimiento
   */
  async enableMaintenance(storeId, options = {}) {
    const { 
      reason = 'Mantenimiento programado',
      estimatedEnd = null,
      message = 'Estamos realizando mejoras. Volveremos pronto.',
      allowAdminAccess = true,
      notifyCustomers = true,
    } = options;

    const maintenanceData = {
      enabled: true,
      reason,
      estimatedEnd,
      message,
      allowAdminAccess,
      startedAt: new Date().toISOString(),
    };

    await prisma.storeSettings.update({
      where: { storeId },
      data: {
        maintenanceMode: JSON.stringify(maintenanceData),
      },
    });

    // Notificar si está configurado
    if (notifyCustomers) {
      // TODO: Enviar notificación a clientes con pedidos activos
    }

    logger.info({ storeId, reason }, 'Maintenance mode enabled');
    return maintenanceData;
  }

  /**
   * Desactivar modo mantenimiento
   */
  async disableMaintenance(storeId) {
    await prisma.storeSettings.update({
      where: { storeId },
      data: {
        maintenanceMode: JSON.stringify({ enabled: false }),
      },
    });

    logger.info({ storeId }, 'Maintenance mode disabled');
    return { enabled: false };
  }

  /**
   * Verificar si está en mantenimiento
   */
  async isInMaintenance(storeId) {
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
    });

    if (!settings?.maintenanceMode) {
      return { enabled: false };
    }

    try {
      const data = JSON.parse(settings.maintenanceMode);
      
      // Verificar si terminó el tiempo estimado
      if (data.enabled && data.estimatedEnd) {
        if (new Date(data.estimatedEnd) < new Date()) {
          // Auto-desactivar
          await this.disableMaintenance(storeId);
          return { enabled: false, autoDisabled: true };
        }
      }

      return data;
    } catch {
      return { enabled: false };
    }
  }

  /**
   * Pausar tienda temporalmente (pausa rápida)
   */
  async pauseStore(storeId, durationMinutes = 30, reason = 'Pausa temporal') {
    const estimatedEnd = new Date(Date.now() + durationMinutes * 60000).toISOString();
    
    return this.enableMaintenance(storeId, {
      reason,
      estimatedEnd,
      message: `Pausa temporal. Volvemos en ${durationMinutes} minutos.`,
      allowAdminAccess: true,
    });
  }

  /**
   * Reanudar tienda
   */
  async resumeStore(storeId) {
    return this.disableMaintenance(storeId);
  }

  /**
   * Obtener estado de todas las tiendas (para superadmin)
   */
  async getAllStoresStatus() {
    const stores = await prisma.store.findMany({
      include: {
        settings: {
          select: { maintenanceMode: true },
        },
      },
    });

    return stores.map(store => {
      let maintenance = { enabled: false };
      try {
        if (store.settings?.maintenanceMode) {
          maintenance = JSON.parse(store.settings.maintenanceMode);
        }
      } catch {}

      return {
        id: store.id,
        name: store.name,
        isActive: store.isActive,
        maintenance,
      };
    });
  }

  /**
   * Middleware para verificar mantenimiento
   */
  createMiddleware() {
    return async (req, res, next) => {
      const storeId = req.params.storeId || req.query.storeId || req.body?.storeId;
      
      if (!storeId) {
        return next();
      }

      const maintenance = await this.isInMaintenance(storeId);
      
      if (maintenance.enabled) {
        // Permitir acceso admin si está configurado
        if (maintenance.allowAdminAccess && req.user?.role) {
          req.maintenanceMode = true;
          return next();
        }

        return res.status(503).json({
          error: 'Tienda en mantenimiento',
          message: maintenance.message,
          estimatedEnd: maintenance.estimatedEnd,
          reason: maintenance.reason,
        });
      }

      next();
    };
  }

  /**
   * Programar mantenimiento futuro
   */
  async scheduleMaintenance(storeId, startAt, options = {}) {
    const { duration = 60, reason, message } = options;

    const scheduled = {
      startAt,
      duration,
      reason: reason || 'Mantenimiento programado',
      message: message || 'Mantenimiento programado',
      createdAt: new Date().toISOString(),
    };

    // Guardar en lista de mantenimientos programados
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
    });

    let scheduledList = [];
    try {
      if (settings?.scheduledMaintenance) {
        scheduledList = JSON.parse(settings.scheduledMaintenance);
      }
    } catch {}

    scheduledList.push(scheduled);

    await prisma.storeSettings.update({
      where: { storeId },
      data: {
        scheduledMaintenance: JSON.stringify(scheduledList),
      },
    });

    logger.info({ storeId, startAt, duration }, 'Maintenance scheduled');
    return scheduled;
  }

  /**
   * Obtener mantenimientos programados
   */
  async getScheduledMaintenance(storeId) {
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
    });

    if (!settings?.scheduledMaintenance) {
      return [];
    }

    try {
      const list = JSON.parse(settings.scheduledMaintenance);
      // Filtrar pasados
      return list.filter(m => new Date(m.startAt) > new Date());
    } catch {
      return [];
    }
  }
}

export const maintenanceService = new MaintenanceService();
export default maintenanceService;

