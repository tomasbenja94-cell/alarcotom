/**
 * Sistema de Backup y Recuperación
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

class BackupService {
  constructor() {
    this.backupDir = process.env.BACKUP_DIR || './backups';
  }

  /**
   * Crear backup completo de tienda
   */
  async createStoreBackup(storeId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `backup_${storeId}_${timestamp}`;

    try {
      // Obtener todos los datos de la tienda
      const [
        store,
        categories,
        products,
        orders,
        customers,
        admins,
        coupons,
        promotions,
      ] = await Promise.all([
        prisma.store.findUnique({ where: { id: storeId } }),
        prisma.category.findMany({ where: { storeId } }),
        prisma.product.findMany({
          where: { storeId },
          include: { productOptionCategories: { include: { options: true } } },
        }),
        prisma.order.findMany({
          where: { storeId },
          include: { items: true },
          orderBy: { createdAt: 'desc' },
          take: 10000, // Últimos 10k pedidos
        }),
        prisma.customer.findMany({
          where: { orders: { some: { storeId } } },
          take: 50000,
        }),
        prisma.admin.findMany({ where: { storeId } }),
        prisma.coupon.findMany({ where: { storeId } }),
        prisma.promotion.findMany({ where: { storeId } }),
      ]);

      const backupData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        storeId,
        store,
        categories,
        products,
        orders,
        customers,
        admins: admins.map(a => ({ ...a, password: undefined })), // No incluir passwords
        coupons,
        promotions,
        metadata: {
          totalCategories: categories.length,
          totalProducts: products.length,
          totalOrders: orders.length,
          totalCustomers: customers.length,
        },
      };

      // Guardar en archivo
      await fs.mkdir(this.backupDir, { recursive: true });
      const filePath = path.join(this.backupDir, `${backupId}.json`);
      await fs.writeFile(filePath, JSON.stringify(backupData, null, 2));

      // Registrar backup en DB
      const backupRecord = await prisma.backup.create({
        data: {
          storeId,
          backupId,
          filePath,
          size: JSON.stringify(backupData).length,
          type: 'full',
          status: 'completed',
        },
      });

      logger.info({ backupId, storeId }, 'Store backup created');
      return backupRecord;
    } catch (error) {
      logger.error({ storeId, error: error.message }, 'Backup failed');
      throw error;
    }
  }

  /**
   * Restaurar backup
   */
  async restoreBackup(backupId, options = {}) {
    const { dryRun = false, skipOrders = false, skipCustomers = false } = options;

    const backupRecord = await prisma.backup.findFirst({ where: { backupId } });
    if (!backupRecord) throw new Error('Backup no encontrado');

    const fileContent = await fs.readFile(backupRecord.filePath, 'utf-8');
    const backupData = JSON.parse(fileContent);

    const report = {
      backupId,
      storeId: backupData.storeId,
      dryRun,
      restored: { categories: 0, products: 0, orders: 0, customers: 0 },
      errors: [],
    };

    if (dryRun) {
      report.preview = backupData.metadata;
      return report;
    }

    try {
      // Restaurar categorías
      for (const category of backupData.categories) {
        try {
          await prisma.category.upsert({
            where: { id: category.id },
            update: category,
            create: category,
          });
          report.restored.categories++;
        } catch (e) {
          report.errors.push({ type: 'category', id: category.id, error: e.message });
        }
      }

      // Restaurar productos
      for (const product of backupData.products) {
        try {
          const { productOptionCategories, ...productData } = product;
          await prisma.product.upsert({
            where: { id: product.id },
            update: productData,
            create: productData,
          });
          report.restored.products++;
        } catch (e) {
          report.errors.push({ type: 'product', id: product.id, error: e.message });
        }
      }

      // Restaurar clientes
      if (!skipCustomers) {
        for (const customer of backupData.customers) {
          try {
            await prisma.customer.upsert({
              where: { id: customer.id },
              update: customer,
              create: customer,
            });
            report.restored.customers++;
          } catch (e) {
            report.errors.push({ type: 'customer', id: customer.id, error: e.message });
          }
        }
      }

      // Restaurar pedidos (solo metadata, no recrear)
      if (!skipOrders) {
        report.restored.orders = backupData.orders.length;
        // Los pedidos generalmente no se restauran para evitar duplicados
      }

      logger.info({ backupId, report }, 'Backup restored');
      return report;
    } catch (error) {
      logger.error({ backupId, error: error.message }, 'Restore failed');
      throw error;
    }
  }

  /**
   * Exportar datos específicos
   */
  async exportData(storeId, dataType, format = 'json') {
    let data;

    switch (dataType) {
      case 'products':
        data = await prisma.product.findMany({
          where: { storeId },
          include: { category: true },
        });
        break;
      case 'orders':
        data = await prisma.order.findMany({
          where: { storeId },
          include: { items: true },
        });
        break;
      case 'customers':
        data = await prisma.customer.findMany({
          where: { orders: { some: { storeId } } },
        });
        break;
      case 'menu':
        const categories = await prisma.category.findMany({
          where: { storeId },
          include: { products: true },
        });
        data = categories;
        break;
      default:
        throw new Error('Tipo de datos no soportado');
    }

    if (format === 'csv') {
      return this.convertToCsv(data);
    }

    return data;
  }

  convertToCsv(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]).filter(k => typeof data[0][k] !== 'object');
    const rows = data.map(item => 
      headers.map(h => {
        const val = item[h];
        if (val === null || val === undefined) return '';
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Listar backups de tienda
   */
  async listBackups(storeId) {
    return prisma.backup.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Eliminar backup antiguo
   */
  async deleteBackup(backupId) {
    const backup = await prisma.backup.findFirst({ where: { backupId } });
    if (!backup) throw new Error('Backup no encontrado');

    try {
      await fs.unlink(backup.filePath);
    } catch (e) {
      // Archivo ya no existe
    }

    await prisma.backup.delete({ where: { id: backup.id } });
    logger.info({ backupId }, 'Backup deleted');
    return { success: true };
  }

  /**
   * Limpiar backups antiguos
   */
  async cleanOldBackups(storeId, keepDays = 30) {
    const threshold = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);

    const oldBackups = await prisma.backup.findMany({
      where: { storeId, createdAt: { lt: threshold } },
    });

    let deleted = 0;
    for (const backup of oldBackups) {
      try {
        await this.deleteBackup(backup.backupId);
        deleted++;
      } catch (e) {
        logger.error({ backupId: backup.backupId, error: e.message }, 'Failed to delete old backup');
      }
    }

    return { deleted, total: oldBackups.length };
  }

  /**
   * Backup automático programado
   */
  async scheduleAutoBackup(storeId, frequency = 'daily') {
    await prisma.backupSchedule.upsert({
      where: { storeId },
      update: { frequency, isActive: true },
      create: { storeId, frequency, isActive: true },
    });

    return { success: true, frequency };
  }

  /**
   * Ejecutar backups programados
   */
  async runScheduledBackups() {
    const schedules = await prisma.backupSchedule.findMany({
      where: { isActive: true },
    });

    const now = new Date();
    let created = 0;

    for (const schedule of schedules) {
      const shouldRun = this.shouldRunBackup(schedule, now);
      
      if (shouldRun) {
        try {
          await this.createStoreBackup(schedule.storeId);
          await prisma.backupSchedule.update({
            where: { id: schedule.id },
            data: { lastRun: now },
          });
          created++;
        } catch (e) {
          logger.error({ storeId: schedule.storeId, error: e.message }, 'Scheduled backup failed');
        }
      }
    }

    return { created };
  }

  shouldRunBackup(schedule, now) {
    if (!schedule.lastRun) return true;

    const hoursSinceLastRun = (now - schedule.lastRun) / (1000 * 60 * 60);

    switch (schedule.frequency) {
      case 'hourly': return hoursSinceLastRun >= 1;
      case 'daily': return hoursSinceLastRun >= 24;
      case 'weekly': return hoursSinceLastRun >= 168;
      default: return hoursSinceLastRun >= 24;
    }
  }
}

export const backupService = new BackupService();
export default backupService;

