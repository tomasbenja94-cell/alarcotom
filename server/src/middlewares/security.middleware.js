import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import cors from 'cors';

// ========== HEADERS DE SEGURIDAD ==========
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://api.mapbox.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://api.mapbox.com"],
      imgSrc: ["'self'", "data:", "https://api.mapbox.com", "https://elbuenmenu.site"],
      connectSrc: ["'self'", "https://api.mapbox.com", "https://elbuenmenu.site"]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// ========== CORS CONFIGURADO ==========
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'https://elbuenmenu.site',
      'https://elbuenmenu.site',
      'https://buenmenuapp.online' // Mantener por compatibilidad
    ];
    
    // Permitir requests sin origin (Postman, mobile apps, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS bloqueado para origen:', origin);
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'Idempotency-Key', 'X-Webhook-Signature', 'X-Webhook-Timestamp'],
  maxAge: 86400
};

export const corsMiddleware = cors(corsOptions);

// ========== RATE LIMITING PARA SISTEMA/ADMIN (MÁS PERMISIVO) ==========
// Para endpoints del panel de admin que hacen polling frecuente
export const systemRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 200, // 200 requests por minuto para endpoints del sistema
  message: 'Demasiadas peticiones del sistema, intenta más tarde',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Saltar rate limiting para webhooks autenticados con API key
    if (req.headers['x-api-key'] === process.env.INTERNAL_API_KEY) {
      return true;
    }
    return false;
  }
});

// ========== RATE LIMITING GENERAL ==========
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 2000, // 2000 requests por IP (aumentado para soportar múltiples componentes)
  message: 'Demasiadas peticiones, intenta más tarde',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Saltar rate limiting para webhooks autenticados con API key
    if (req.headers['x-api-key'] === process.env.INTERNAL_API_KEY) {
      return true;
    }
    // Saltar rate limiting para rutas de delivery autenticadas (tienen req.driver)
    if (req.path?.startsWith('/api/delivery') && req.driver) {
      return true;
    }
    // Saltar rate limiting para todas las rutas de delivery en desarrollo
    if (process.env.NODE_ENV !== 'production' && req.path?.startsWith('/api/delivery')) {
      return true;
    }
    // Saltar rate limiting para endpoints del sistema (tienen su propio rate limit)
    if (req.path?.startsWith('/api/system/')) {
      return true;
    }
    return false;
  }
});

// ========== RATE LIMITING PARA LOGIN ==========
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por 15 minutos
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos de login, intenta más tarde',
  standardHeaders: true,
  legacyHeaders: false
});

// ========== RATE LIMITING PARA CÓDIGOS DE ENTREGA ==========
export const deliveryCodeRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5, // 5 intentos por minuto
  message: 'Demasiados intentos de código, espera un momento',
  standardHeaders: true,
  legacyHeaders: false
});

// ========== RATE LIMITING PARA RUTAS DE DELIVERY (MÁS PERMISIVO) ==========
// Para ubicación GPS y polling frecuente
export const deliveryLocationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60, // 60 actualizaciones por minuto (1 por segundo)
  message: 'Demasiadas actualizaciones de ubicación',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Usar driver ID si está autenticado, sino usar ipKeyGenerator helper para IPv6
    if (req.driver?.id) {
      return req.driver.id;
    }
    return ipKeyGenerator(req) || 'unknown';
  }
});

// Para polling de pedidos disponibles y balance
// Optimizado para 24/7: permite hasta 120 peticiones por minuto (2 por segundo)
// Esto permite polling cada 30 segundos con múltiples endpoints
export const deliveryPollingRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120, // 120 peticiones por minuto (2 por segundo) - optimizado para 24/7
  message: 'Demasiadas peticiones de polling',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Usar driver ID si está autenticado, sino usar ipKeyGenerator helper para IPv6
    if (req.driver?.id) {
      return req.driver.id;
    }
    return ipKeyGenerator(req) || 'unknown';
  }
});

