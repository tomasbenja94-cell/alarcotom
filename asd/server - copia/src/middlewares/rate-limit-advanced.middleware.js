import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Store para rate limiting en memoria (en producción usar Redis)
export const rateLimitStore = new Map();

// ========== RATE LIMITING POR USUARIO ==========
export const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    keyGenerator: (req) => {
      // Usar userId del token JWT si está autenticado
      return req.user?.id || req.driver?.id || ipKeyGenerator(req);
    },
    message: 'Demasiadas peticiones, intenta más tarde',
    standardHeaders: true,
    legacyHeaders: false
  });
};

// ========== RATE LIMITING POR IP CON TRACKING EN DB ==========
// DESHABILITADO: Este middleware bloquea IPs y causa problemas en desarrollo
// Para habilitarlo, descomenta el código y úsalo en server/index.js
export const ipRateLimit = async (req, res, next) => {
  // En desarrollo, siempre permitir
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  // Saltar rate limiting para rutas de delivery autenticadas
  if (req.path?.startsWith('/api/delivery') && req.driver) {
    return next();
  }
  
  const ip = req.ip || req.headers['x-forwarded-for'] || 'Unknown';
  const windowMs = 15 * 60 * 1000; // 15 minutos
  const maxRequests = 200;

  try {
    // Buscar en DB si existe tracking para esta IP
    // Por ahora usar memoria, en producción usar Redis o DB
    const key = `ip:${ip}`;
    const record = rateLimitStore.get(key);

    const now = Date.now();

    if (!record || now > record.expiresAt) {
      // Nueva entrada o expirada
      rateLimitStore.set(key, {
        count: 1,
        expiresAt: now + windowMs,
        blocked: false
      });
      return next();
    }

    if (record.blocked && now < record.blockedUntil) {
      const remaining = Math.ceil((record.blockedUntil - now) / 1000 / 60);
      return res.status(429).json({
        error: 'IP bloqueada temporalmente',
        message: `Intenta nuevamente en ${remaining} minutos`
      });
    }

    if (record.count >= maxRequests) {
      // Bloquear IP por 1 hora
      record.blocked = true;
      record.blockedUntil = now + 60 * 60 * 1000; // 1 hora
      rateLimitStore.set(key, record);
      
      console.warn('IP bloqueada por exceso de requests', { ip, count: record.count });
      
      return res.status(429).json({
        error: 'IP bloqueada temporalmente',
        message: 'Has excedido el límite de peticiones. Intenta en 1 hora.'
      });
    }

    record.count++;
    rateLimitStore.set(key, record);
    next();
  } catch (error) {
    console.error('Error en rate limiting por IP:', error);
    next(); // Continuar si falla el rate limiting
  }
};

// ========== RATE LIMITING POR ENDPOINT ==========
export const endpointRateLimit = (endpoint, maxRequests = 50, windowMs = 15 * 60 * 1000) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    keyGenerator: (req) => {
      return `${endpoint}:${req.user?.id || req.driver?.id || ipKeyGenerator(req)}`;
    },
    message: `Demasiadas peticiones a ${endpoint}, intenta más tarde`,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Saltar rate limiting para webhooks autenticados con API key
      return req.headers['x-api-key'] === process.env.INTERNAL_API_KEY;
    }
  });
};

// ========== RATE LIMITING PARA ACCIONES CRÍTICAS ==========
export const criticalActionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // 10 acciones críticas por hora
  keyGenerator: (req) => {
    return `critical:${req.user?.id || req.driver?.id || ipKeyGenerator(req)}`;
  },
  message: 'Has excedido el límite de acciones críticas. Intenta en 1 hora.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false // Contar todos los intentos
});

// ========== RATE LIMITING PARA CREACIÓN DE RECURSOS ==========
export const createResourceRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // 20 creaciones por 15 minutos
  keyGenerator: (req) => {
    return `create:${req.user?.id || req.driver?.id || ipKeyGenerator(req)}`;
  },
  message: 'Demasiadas creaciones de recursos, intenta más tarde',
  standardHeaders: true,
  legacyHeaders: false
});

// Limpiar store cada hora (en producción usar Redis TTL)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.expiresAt && (!record.blocked || now > record.blockedUntil)) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 60 * 1000); // Cada hora

