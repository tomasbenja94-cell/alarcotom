import express from 'express';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';
import { auditService } from '../services/audit.service.js';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// ========== OBTENER LOGS DE AUDITORÍA (SOLO ADMIN) ==========
router.get('/audit-logs',
  authenticateAdmin, // Requiere JWT de admin
  authorize('admin', 'super_admin'), // Solo admin y super_admin
  async (req, res, next) => {
    try {
      const { 
        userId, 
        action, 
        startDate, 
        endDate, 
        limit = 100, 
        offset = 0 
      } = req.query;

      const filters = {};
      if (userId) filters.userId = userId;
      if (action) filters.action = action;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const logs = await auditService.getAuditLogs(
        filters,
        parseInt(limit),
        parseInt(offset)
      );

      res.json({
        logs,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          count: logs.length
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ========== OBTENER MÉTRICAS DEL SISTEMA (SOLO ADMIN) ==========
router.get('/metrics',
  authenticateAdmin, // Requiere JWT de admin
  authorize('admin', 'super_admin'), // Solo admin y super_admin
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Últimos 30 días por defecto
      const end = endDate ? new Date(endDate) : new Date();

      // Contar pedidos por estado
      const ordersByStatus = await prisma.order.groupBy({
        by: ['status'],
        _count: { id: true },
        where: {
          createdAt: {
            gte: start,
            lte: end
          }
        }
      });

      // Contar pedidos por método de pago
      const ordersByPayment = await prisma.order.groupBy({
        by: ['paymentMethod'],
        _count: { id: true },
        where: {
          createdAt: {
            gte: start,
            lte: end
          }
        }
      });

      // Estadísticas de repartidores
      const driverStats = await prisma.deliveryPerson.aggregate({
        _count: { id: true },
        _sum: { 
          balance: true,
          totalDeliveries: true
        },
        where: {
          isActive: true
        }
      });

      // Estadísticas de transacciones
      const transactionStats = await prisma.driverBalanceTransaction.groupBy({
        by: ['type'],
        _sum: { amount: true },
        _count: { id: true },
        where: {
          createdAt: {
            gte: start,
            lte: end
          }
        }
      });

      // Actividad reciente (últimas 24 horas)
      const recentActivity = await prisma.auditLog.findMany({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 50,
        select: {
          action: true,
          userRole: true,
          timestamp: true,
          ipAddress: true
        }
      });

      // Actividad sospechosa
      const suspiciousActivity = await prisma.auditLog.findMany({
        where: {
          action: 'suspicious_activity',
          timestamp: {
            gte: start,
            lte: end
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 20
      });

      res.json({
        period: { start, end },
        orders: {
          byStatus: ordersByStatus.reduce((acc, item) => {
            acc[item.status] = item._count.id;
            return acc;
          }, {}),
          byPayment: ordersByPayment.reduce((acc, item) => {
            acc[item.paymentMethod || 'unknown'] = item._count.id;
            return acc;
          }, {})
        },
        drivers: {
          total: driverStats._count.id,
          totalBalance: driverStats._sum.balance || 0,
          totalDeliveries: driverStats._sum.totalDeliveries || 0
        },
        transactions: transactionStats.reduce((acc, item) => {
          acc[item.type] = {
            count: item._count.id,
            totalAmount: item._sum.amount || 0
          };
          return acc;
        }, {}),
        recentActivity: recentActivity.length,
        suspiciousActivity: suspiciousActivity.length,
        summary: {
          totalOrders: ordersByStatus.reduce((sum, item) => sum + item._count.id, 0),
          totalRevenue: ordersByPayment.reduce((sum, item) => sum + (item.paymentMethod ? 1 : 0), 0), // Simplificado
          activeDrivers: driverStats._count.id
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ========== OBTENER ACTIVIDAD SOSPECHOSA (SOLO SUPER ADMIN) ==========
router.get('/suspicious-activity',
  authenticateAdmin, // Requiere JWT de admin
  authorize('super_admin'), // Solo super_admin
  async (req, res, next) => {
    try {
      const { limit = 50, offset = 0 } = req.query;

      const suspiciousLogs = await prisma.auditLog.findMany({
        where: {
          action: 'suspicious_activity'
        },
        orderBy: { timestamp: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      });

      res.json({
        logs: suspiciousLogs,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          count: suspiciousLogs.length
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ========== OBTENER ESTADÍSTICAS DE INTENTOS DE CÓDIGO (SOLO ADMIN) ==========
router.get('/delivery-code-attempts',
  authenticateAdmin, // Requiere JWT de admin
  authorize('admin', 'super_admin'), // Solo admin y super_admin
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Últimos 7 días por defecto
      const end = endDate ? new Date(endDate) : new Date();

      const attempts = await prisma.deliveryCodeAttempt.findMany({
        where: {
          lastAttemptAt: {
            gte: start,
            lte: end
          }
        },
        orderBy: { lastAttemptAt: 'desc' },
        take: 100
      });

      // Agrupar por número de intentos
      const attemptsByCount = attempts.reduce((acc, attempt) => {
        const count = attempt.attemptCount;
        acc[count] = (acc[count] || 0) + 1;
        return acc;
      }, {});

      res.json({
        period: { start, end },
        attempts: attempts.length,
        byAttemptCount: attemptsByCount,
        recentAttempts: attempts.slice(0, 20)
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

