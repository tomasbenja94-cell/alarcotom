/**
 * Logger estructurado para el backend
 * Usa pino si está disponible, sino fallback a console
 */

let pino;
try {
  pino = (await import('pino')).default;
} catch {
  pino = null;
}

const isDev = process.env.NODE_ENV !== 'production';

// Crear logger con pino si está disponible
const createLogger = () => {
  if (pino) {
    return pino({
      level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
      transport: isDev ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      } : undefined,
      base: {
        env: process.env.NODE_ENV || 'development'
      }
    });
  }

  // Fallback a console con formato estructurado
  return {
    info: (obj, msg) => console.log(`ℹ️  [INFO] ${msg || ''}`, typeof obj === 'object' ? JSON.stringify(obj) : obj),
    warn: (obj, msg) => console.warn(`⚠️  [WARN] ${msg || ''}`, typeof obj === 'object' ? JSON.stringify(obj) : obj),
    error: (obj, msg) => console.error(`❌ [ERROR] ${msg || ''}`, typeof obj === 'object' ? JSON.stringify(obj) : obj),
    debug: (obj, msg) => isDev && console.log(`🔍 [DEBUG] ${msg || ''}`, typeof obj === 'object' ? JSON.stringify(obj) : obj),
    fatal: (obj, msg) => console.error(`💀 [FATAL] ${msg || ''}`, typeof obj === 'object' ? JSON.stringify(obj) : obj),
    child: (bindings) => createLogger() // Simplified child logger
  };
};

const logger = createLogger();

// Helpers para logging común
export const logRequest = (req, extra = {}) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    ...extra
  }, `${req.method} ${req.url}`);
};

export const logError = (error, context = {}) => {
  logger.error({
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...context
  }, error.message);
};

export const logOrderEvent = (orderId, event, data = {}) => {
  logger.info({
    orderId,
    event,
    ...data
  }, `Order ${orderId}: ${event}`);
};

export const logBotEvent = (storeId, event, data = {}) => {
  logger.info({
    storeId,
    event,
    ...data
  }, `Bot [${storeId}]: ${event}`);
};

export default logger;

