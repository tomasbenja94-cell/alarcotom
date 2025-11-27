import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

// ========== SERVICIO DE AUDITORÍA ==========
class AuditService {
  // Log genérico de acción
  async logAction(action, userId, userRole, details = {}, ipAddress = null, userAgent = null) {
    try {
      await prisma.auditLog.create({
        data: {
          action,
          userId: userId || null,
          userRole: userRole || 'system',
          details: JSON.stringify(this.sanitizeForLog(details)),
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error('Error guardando log de auditoría:', error);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  // Logs específicos para acciones críticas
  async logLogin(userId, userRole, email, success, ipAddress, userAgent) {
    await this.logAction(
      success ? 'login_success' : 'login_failed',
      userId,
      userRole,
      { email, success },
      ipAddress,
      userAgent
    );
  }

  async logBalanceChange(driverId, amount, type, orderId, adminId) {
    await this.logAction(
      'balance_change',
      adminId || driverId,
      adminId ? 'admin' : 'driver',
      {
        driverId,
        amount,
        type,
        orderId,
        timestamp: new Date().toISOString()
      }
    );
  }

  async logOrderStatusChange(orderId, oldStatus, newStatus, userId, userRole) {
    await this.logAction(
      'order_status_change',
      userId,
      userRole,
      {
        orderId,
        oldStatus,
        newStatus,
        timestamp: new Date().toISOString()
      }
    );
  }

  async logOrderApproval(orderId, approved, userId, userRole, reason = null) {
    await this.logAction(
      approved ? 'order_approved' : 'order_rejected',
      userId,
      userRole,
      {
        orderId,
        approved,
        reason,
        timestamp: new Date().toISOString()
      }
    );
  }

  async logPaymentRegistration(driverId, amount, adminId, reference) {
    await this.logAction(
      'payment_registered',
      adminId,
      'admin',
      {
        driverId,
        amount,
        reference,
        timestamp: new Date().toISOString()
      }
    );
  }

  async logDeliveryCodeAttempt(orderId, driverId, success, attempts) {
    await this.logAction(
      'delivery_code_attempt',
      driverId,
      'driver',
      {
        orderId,
        success,
        attempts,
        timestamp: new Date().toISOString()
      }
    );
  }

  async logSuspiciousActivity(type, details, ipAddress = null) {
    await this.logAction(
      'suspicious_activity',
      null,
      'system',
      {
        type,
        details,
        timestamp: new Date().toISOString()
      },
      ipAddress
    );

    // Log adicional para alertar
    console.warn('⚠️ Actividad sospechosa detectada:', { type, details, ipAddress });
  }

  async logUnauthorizedAccess(userId, userRole, path, ipAddress) {
    await this.logAction(
      'unauthorized_access',
      userId,
      userRole,
      {
        path,
        timestamp: new Date().toISOString()
      },
      ipAddress
    );

    // Alertar si es crítico
    await this.logSuspiciousActivity('unauthorized_access', {
      userId,
      userRole,
      path
    }, ipAddress);
  }

  async logDataAccess(resource, resourceId, userId, userRole, ipAddress) {
    await this.logAction(
      'data_access',
      userId,
      userRole,
      {
        resource,
        resourceId,
        timestamp: new Date().toISOString()
      },
      ipAddress
    );
  }

  async logDataModification(resource, resourceId, action, userId, userRole, changes) {
    await this.logAction(
      'data_modification',
      userId,
      userRole,
      {
        resource,
        resourceId,
        action,
        changes: this.sanitizeForLog(changes),
        timestamp: new Date().toISOString()
      }
    );
  }

  // Sanitizar datos sensibles antes de loguear
  sanitizeForLog(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sensitive = ['password', 'passwordHash', 'token', 'apiKey', 'secret', 'refreshToken'];
    const sanitized = { ...data };

    for (const key of Object.keys(sanitized)) {
      if (sensitive.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeForLog(sanitized[key]);
      }
    }

    return sanitized;
  }

  // Obtener logs de auditoría (solo para admins)
  async getAuditLogs(filters = {}, limit = 100, offset = 0) {
    const where = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.storeId) {
      // Buscar en details que contenga el storeId
      where.details = { contains: filters.storeId };
    }

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.timestamp.lte = new Date(filters.endDate);
      }
    }

    return await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset
    });
  }

  // Obtener resumen de actividad por usuario
  async getUserActivitySummary(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await prisma.auditLog.findMany({
      where: {
        userId,
        timestamp: { gte: startDate },
      },
    });

    const summary = {
      totalActions: logs.length,
      byAction: {},
      lastActivity: logs[0]?.timestamp || null,
      suspiciousCount: logs.filter(l => l.action.includes('suspicious') || l.action.includes('unauthorized')).length,
    };

    logs.forEach(log => {
      summary.byAction[log.action] = (summary.byAction[log.action] || 0) + 1;
    });

    return summary;
  }

  // Logs específicos para productos
  async logProductChange(productId, action, changes, userId, userRole, storeId) {
    await this.logAction(
      `product_${action}`,
      userId,
      userRole,
      {
        productId,
        storeId,
        action,
        changes: this.sanitizeForLog(changes),
        timestamp: new Date().toISOString()
      }
    );
  }

  // Logs específicos para tienda
  async logStoreChange(storeId, action, changes, userId, userRole) {
    await this.logAction(
      `store_${action}`,
      userId,
      userRole,
      {
        storeId,
        action,
        changes: this.sanitizeForLog(changes),
        timestamp: new Date().toISOString()
      }
    );
  }

  // Logs específicos para cupones
  async logCouponChange(couponId, action, details, userId, userRole) {
    await this.logAction(
      `coupon_${action}`,
      userId,
      userRole,
      {
        couponId,
        action,
        details: this.sanitizeForLog(details),
        timestamp: new Date().toISOString()
      }
    );
  }

  // Exportar logs a CSV
  async exportLogs(filters = {}) {
    const logs = await this.getAuditLogs(filters, 10000, 0);
    
    const headers = ['timestamp', 'action', 'userId', 'userRole', 'ipAddress', 'details'];
    const rows = logs.map(log => [
      log.timestamp.toISOString(),
      log.action,
      log.userId || '',
      log.userRole,
      log.ipAddress || '',
      log.details?.replace(/"/g, '""') || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csv;
  }

  // Limpiar logs antiguos (más de X días)
  async cleanupOldLogs(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.auditLog.deleteMany({
      where: {
        timestamp: { lt: cutoffDate },
        // No borrar logs críticos
        action: {
          notIn: ['suspicious_activity', 'unauthorized_access', 'data_modification']
        }
      }
    });

    logger.info({ deleted: result.count, daysToKeep }, 'Old audit logs cleaned up');
    return result.count;
  }
}

export const auditService = new AuditService();

