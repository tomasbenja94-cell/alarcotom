/**
 * Rate Limiting Multi-Tenant por Store
 * Límites configurables por tienda
 */

import logger from '../utils/logger.js';

// Store de rate limits en memoria (en producción usar Redis)
const rateLimitStore = new Map();

// Configuración por defecto
const DEFAULT_LIMITS = {
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 100,    // 100 requests por minuto
  maxOrdersPerHour: 50,
  maxMessagesPerMinute: 30,
};

/**
 * Obtener configuración de límites para una tienda
 */
async function getStoreLimits(storeId) {
  // TODO: Cargar desde DB o cache
  // Por ahora usar defaults
  return DEFAULT_LIMITS;
}

/**
 * Generar clave de rate limit
 */
function getRateLimitKey(storeId, ip, type = 'general') {
  return `ratelimit:${type}:${storeId}:${ip}`;
}

/**
 * Verificar y actualizar rate limit
 */
function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let record = rateLimitStore.get(key);
  
  if (!record || now - record.windowStart > windowMs) {
    // Nueva ventana
    record = {
      windowStart: now,
      count: 1,
    };
    rateLimitStore.set(key, record);
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }
  
  record.count++;
  
  if (record.count > maxRequests) {
    return { 
      allowed: false, 
      remaining: 0, 
      resetAt: record.windowStart + windowMs,
      retryAfter: Math.ceil((record.windowStart + windowMs - now) / 1000),
    };
  }
  
  return { 
    allowed: true, 
    remaining: maxRequests - record.count, 
    resetAt: record.windowStart + windowMs,
  };
}

/**
 * Middleware de rate limiting por store
 */
export function storeRateLimit(options = {}) {
  const {
    type = 'general',
    keyGenerator = (req) => req.ip,
    skipSuccessfulRequests = false,
    skip = () => false,
  } = options;

  return async (req, res, next) => {
    // Obtener storeId del request
    const storeId = req.params.storeId || req.body?.storeId || req.user?.storeId || 'global';
    
    // Verificar si debe saltar
    if (skip(req)) {
      return next();
    }
    
    // Obtener límites de la tienda
    const limits = await getStoreLimits(storeId);
    const key = getRateLimitKey(storeId, keyGenerator(req), type);
    
    // Seleccionar límite según tipo
    let maxRequests = limits.maxRequests;
    if (type === 'orders') maxRequests = limits.maxOrdersPerHour;
    if (type === 'messages') maxRequests = limits.maxMessagesPerMinute;
    
    const result = checkRateLimit(key, maxRequests, limits.windowMs);
    
    // Agregar headers de rate limit
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': result.remaining,
      'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000),
      'X-RateLimit-Store': storeId,
    });
    
    if (!result.allowed) {
      logger.warn({
        storeId,
        ip: req.ip,
        type,
        path: req.path,
      }, 'Rate limit exceeded');
      
      res.set('Retry-After', result.retryAfter);
      
      return res.status(429).json({
        error: {
          code: 6001,
          message: 'Demasiadas solicitudes. Intenta de nuevo más tarde.',
          retryAfter: result.retryAfter,
        },
        timestamp: new Date().toISOString(),
      });
    }
    
    // Si skipSuccessfulRequests, decrementar después de respuesta exitosa
    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400) {
          const record = rateLimitStore.get(key);
          if (record) record.count--;
        }
      });
    }
    
    next();
  };
}

/**
 * Rate limit específico para pedidos
 */
export const orderRateLimit = storeRateLimit({
  type: 'orders',
  keyGenerator: (req) => req.body?.customerPhone || req.ip,
});

/**
 * Rate limit específico para mensajes WhatsApp
 */
export const messageRateLimit = storeRateLimit({
  type: 'messages',
  keyGenerator: (req) => req.body?.phone || req.ip,
});

/**
 * Rate limit para login (más estricto)
 */
export const loginStoreRateLimit = storeRateLimit({
  type: 'login',
  keyGenerator: (req) => `${req.ip}:${req.body?.username || 'unknown'}`,
});

/**
 * Limpiar rate limits expirados (llamar periódicamente)
 */
export function cleanupRateLimits() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, record] of rateLimitStore) {
    // Limpiar registros de más de 5 minutos
    if (now - record.windowStart > 5 * 60 * 1000) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug({ cleaned }, 'Rate limit records cleaned');
  }
}

// Limpiar cada 5 minutos
setInterval(cleanupRateLimits, 5 * 60 * 1000);

export default storeRateLimit;

