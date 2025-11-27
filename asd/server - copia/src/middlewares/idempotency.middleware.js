import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Store para idempotencia en memoria (en producción usar Redis)
const idempotencyStore = new Map();

// ========== MIDDLEWARE DE IDEMPOTENCIA ==========
export const idempotencyMiddleware = async (req, res, next) => {
  // Solo aplicar a métodos que modifican estado
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  // Obtener idempotency key del header o generar uno
  let idempotencyKey = req.headers['idempotency-key'];

  // Si no existe, intentar generar uno basado en el contenido
  if (!idempotencyKey) {
    const payload = JSON.stringify(req.body);
    idempotencyKey = crypto
      .createHash('sha256')
      .update(`${req.path}:${payload}`)
      .digest('hex');
  }

  // Buscar respuesta cacheada
  const cached = idempotencyStore.get(idempotencyKey);

  if (cached) {
    // Verificar que no haya expirado (24 horas)
    const now = Date.now();
    if (now - cached.timestamp < 24 * 60 * 60 * 1000) {
      // Retornar respuesta cacheada
      res.status(cached.status).json(cached.body);
      return;
    } else {
      // Eliminar entrada expirada
      idempotencyStore.delete(idempotencyKey);
    }
  }

  // Interceptar respuesta para cachear
  const originalJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);
  let statusCode = 200;
  let responseBody = null;

  res.status = function(code) {
    statusCode = code;
    return originalStatus(code);
  };

  res.json = function(body) {
    responseBody = body;

    // Cachear respuesta solo si fue exitosa (2xx)
    if (statusCode >= 200 && statusCode < 300) {
      idempotencyStore.set(idempotencyKey, {
        status: statusCode,
        body: responseBody,
        timestamp: Date.now()
      });

      // Agregar header de idempotencia
      res.setHeader('Idempotency-Key', idempotencyKey);
    }

    return originalJson(body);
  };

  req.idempotencyKey = idempotencyKey;
  next();
};

// Limpiar store de idempotencia cada hora
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 horas

  for (const [key, cached] of idempotencyStore.entries()) {
    if (now - cached.timestamp > maxAge) {
      idempotencyStore.delete(key);
    }
  }
}, 60 * 60 * 1000); // Cada hora

// ========== IDEMPOTENCIA PARA WEBHOOKS (USANDO TIMESTAMP + PAYLOAD) ==========
export const webhookIdempotencyMiddleware = async (req, res, next) => {
  if (!req.webhookTimestamp) {
    return next(); // Solo funciona si hay timestamp del webhook
  }

  // Generar key de idempotencia basado en timestamp + payload
  const payload = JSON.stringify(req.body);
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${req.webhookTimestamp}:${req.path}:${payload}`)
    .digest('hex');

  // Buscar respuesta cacheada
  const cached = idempotencyStore.get(idempotencyKey);

  if (cached) {
    // Retornar respuesta cacheada
    res.status(cached.status).json(cached.body);
    return;
  }

  // Interceptar respuesta para cachear
  const originalJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);
  let statusCode = 200;
  let responseBody = null;

  res.status = function(code) {
    statusCode = code;
    return originalStatus(code);
  };

  res.json = function(body) {
    responseBody = body;

    // Cachear respuesta solo si fue exitosa (2xx)
    if (statusCode >= 200 && statusCode < 300) {
      idempotencyStore.set(idempotencyKey, {
        status: statusCode,
        body: responseBody,
        timestamp: Date.now()
      });

      // Agregar header de idempotencia
      res.setHeader('Idempotency-Key', idempotencyKey);
    }

    return originalJson(body);
  };

  req.idempotencyKey = idempotencyKey;
  next();
};

