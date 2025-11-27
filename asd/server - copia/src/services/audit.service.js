import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
}

export const auditService = new AuditService();

