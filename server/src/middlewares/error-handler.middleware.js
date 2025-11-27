/**
 * Middleware centralizado de manejo de errores
 * Con códigos de error, logging estructurado y respuestas consistentes
 */

import logger from '../utils/logger.js';

// Códigos de error internos
export const ErrorCodes = {
  // Validación (1xxx)
  VALIDATION_ERROR: { code: 1001, status: 400, message: 'Datos de entrada inválidos' },
  MISSING_FIELD: { code: 1002, status: 400, message: 'Campo requerido faltante' },
  INVALID_FORMAT: { code: 1003, status: 400, message: 'Formato inválido' },
  
  // Autenticación (2xxx)
  UNAUTHORIZED: { code: 2001, status: 401, message: 'No autorizado' },
  TOKEN_INVALID: { code: 2002, status: 401, message: 'Token inválido' },
  TOKEN_EXPIRED: { code: 2003, status: 401, message: 'Token expirado' },
  CREDENTIALS_INVALID: { code: 2004, status: 401, message: 'Credenciales inválidas' },
  
  // Autorización (3xxx)
  FORBIDDEN: { code: 3001, status: 403, message: 'Acceso denegado' },
  INSUFFICIENT_PERMISSIONS: { code: 3002, status: 403, message: 'Permisos insuficientes' },
  STORE_ACCESS_DENIED: { code: 3003, status: 403, message: 'No tienes acceso a esta tienda' },
  
  // Recursos (4xxx)
  NOT_FOUND: { code: 4001, status: 404, message: 'Recurso no encontrado' },
  STORE_NOT_FOUND: { code: 4002, status: 404, message: 'Tienda no encontrada' },
  PRODUCT_NOT_FOUND: { code: 4003, status: 404, message: 'Producto no encontrado' },
  ORDER_NOT_FOUND: { code: 4004, status: 404, message: 'Pedido no encontrado' },
  USER_NOT_FOUND: { code: 4005, status: 404, message: 'Usuario no encontrado' },
  
  // Conflictos (5xxx)
  CONFLICT: { code: 5001, status: 409, message: 'Conflicto con el estado actual' },
  DUPLICATE_ENTRY: { code: 5002, status: 409, message: 'El registro ya existe' },
  ORDER_ALREADY_PROCESSED: { code: 5003, status: 409, message: 'El pedido ya fue procesado' },
  
  // Rate limiting (6xxx)
  RATE_LIMITED: { code: 6001, status: 429, message: 'Demasiadas solicitudes' },
  SPAM_DETECTED: { code: 6002, status: 429, message: 'Actividad sospechosa detectada' },
  
  // Servidor (9xxx)
  INTERNAL_ERROR: { code: 9001, status: 500, message: 'Error interno del servidor' },
  DATABASE_ERROR: { code: 9002, status: 500, message: 'Error de base de datos' },
  EXTERNAL_SERVICE_ERROR: { code: 9003, status: 502, message: 'Error en servicio externo' },
  SERVICE_UNAVAILABLE: { code: 9004, status: 503, message: 'Servicio no disponible' },
};

/**
 * Clase de error personalizada
 */
export class AppError extends Error {
  constructor(errorType, details = null, originalError = null) {
    super(errorType.message);
    this.name = 'AppError';
    this.code = errorType.code;
    this.status = errorType.status;
    this.details = details;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
      timestamp: this.timestamp,
    };
  }
}

/**
 * Middleware principal de errores
 */
export const errorHandler = (err, req, res, next) => {
  // Si ya se envió respuesta, delegar al handler por defecto
  if (res.headersSent) {
    return next(err);
  }

  // Contexto para logging
  const errorContext = {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
    storeId: req.user?.storeId || req.params?.storeId,
    userAgent: req.headers['user-agent'],
  };

  // AppError (errores controlados)
  if (err instanceof AppError) {
    logger.warn({ ...errorContext, errorCode: err.code }, err.message);
    return res.status(err.status).json(err.toJSON());
  }

  // Error de validación (Zod)
  if (err.name === 'ZodError') {
    const details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    logger.warn({ ...errorContext, validationErrors: details }, 'Validation error');
    return res.status(400).json({
      error: {
        code: ErrorCodes.VALIDATION_ERROR.code,
        message: ErrorCodes.VALIDATION_ERROR.message,
        details,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Errores de JWT
  if (err.name === 'JsonWebTokenError') {
    logger.warn(errorContext, 'Invalid JWT token');
    return res.status(401).json({
      error: {
        code: ErrorCodes.TOKEN_INVALID.code,
        message: ErrorCodes.TOKEN_INVALID.message,
      },
      timestamp: new Date().toISOString(),
    });
  }

  if (err.name === 'TokenExpiredError') {
    logger.warn(errorContext, 'Expired JWT token');
    return res.status(401).json({
      error: {
        code: ErrorCodes.TOKEN_EXPIRED.code,
        message: ErrorCodes.TOKEN_EXPIRED.message,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Errores de Prisma
  if (err.code?.startsWith?.('P')) {
    const prismaErrors = {
      P2002: ErrorCodes.DUPLICATE_ENTRY,
      P2025: ErrorCodes.NOT_FOUND,
      P2003: ErrorCodes.CONFLICT,
    };
    
    const errorType = prismaErrors[err.code] || ErrorCodes.DATABASE_ERROR;
    logger.error({ ...errorContext, prismaCode: err.code, meta: err.meta }, 'Prisma error');
    
    return res.status(errorType.status).json({
      error: {
        code: errorType.code,
        message: errorType.message,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Error genérico no manejado
  logger.error({
    ...errorContext,
    error: err.message,
    stack: err.stack,
  }, 'Unhandled error');

  // Respuesta genérica (no exponer detalles en producción)
  const response = {
    error: {
      code: ErrorCodes.INTERNAL_ERROR.code,
      message: ErrorCodes.INTERNAL_ERROR.message,
    },
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV === 'development') {
    response.error.debug = {
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 5),
    };
  }

  res.status(500).json(response);
};

/**
 * Middleware para rutas no encontradas
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: ErrorCodes.NOT_FOUND.code,
      message: `Ruta no encontrada: ${req.method} ${req.path}`,
    },
    timestamp: new Date().toISOString(),
  });
};

/**
 * Wrapper async para controllers (evita try-catch repetitivo)
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default errorHandler;
