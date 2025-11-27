import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ========== DETECCIÓN DE PATRONES SQL INJECTION ==========
const sqlInjectionPatterns = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/gi,
  /(--|#|\/\*|\*\/|;|'|"|`)/g,
  /(\bOR\b\s*\d+\s*=\s*\d+)/gi,
  /(\bAND\b\s*\d+\s*=\s*\d+)/gi,
  /(\bUNION\b\s+\bSELECT\b)/gi,
  /(\bEXEC\b|\bEXECUTE\b)/gi,
  /(\bDROP\b\s+\bTABLE\b|\bDROP\b\s+\bDATABASE\b)/gi,
  /(\bCREATE\b\s+\bTABLE\b)/gi,
  /(\bALTER\b\s+\bTABLE\b)/gi,
  /(;\s*DROP\s+TABLE|;\s*DELETE\s+FROM)/gi,
  /(\bXP_\w+)/gi, // SQL Server extended procedures
  /(\bSP_\w+)/gi, // SQL Server stored procedures
  /(\bCAST\b|\bCONVERT\b)/gi,
  /(\bCHAR\b\s*\(|\bASCII\b\s*\()/gi,
  /(\bWAITFOR\b\s+\bDELAY\b)/gi,
  /(\bBENCHMARK\b)/gi,
  /(\bSLEEP\b\s*\()/gi,
  /(\bLOAD_FILE\b)/gi,
  /(\bINTO\b\s+\bOUTFILE\b|\bINTO\b\s+\bDUMPFILE\b)/gi
];

// ========== DETECCIÓN DE PATRONES XSS ==========
const xssPatterns = [
  /<script[^>]*>.*?<\/script>/gi,
  /<iframe[^>]*>.*?<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // onclick, onerror, etc.
  /<img[^>]*src[^>]*=.*?javascript:/gi,
  /<svg[^>]*onload/gi,
  /<body[^>]*onload/gi,
  /<input[^>]*onfocus/gi,
  /<link[^>]*href[^>]*=.*?javascript:/gi,
  /<style[^>]*>.*?@import.*?javascript:/gi,
  /expression\s*\(/gi, // CSS expressions
  /vbscript:/gi,
  /data:text\/html/gi,
  /<object[^>]*>/gi,
  /<embed[^>]*>/gi,
  /<form[^>]*>/gi
];

// ========== DETECCIÓN DE PATH TRAVERSAL ==========
const pathTraversalPatterns = [
  /\.\.\//g,
  /\.\.\\/g,
  /\.\.%2F/gi,
  /\.\.%5C/gi,
  /%2E%2E%2F/gi,
  /%2E%2E%5C/gi,
  /\.\.%252F/gi,
  /\.\.%255C/gi,
  /\/etc\/passwd/gi,
  /\/proc\/self\/environ/gi,
  /\/windows\/system32/gi,
  /\/boot\.ini/gi
];

// ========== DETECCIÓN DE COMMAND INJECTION ==========
const commandInjectionPatterns = [
  /[;&|`$(){}[\]]/g,
  /(\||\||&&|;|`|\$\(|\$\{)/g,
  /(\bcat\b|\bless\b|\bmore\b|\btail\b|\bhead\b)/gi,
  /(\bwget\b|\bcurl\b|\bfetch\b)/gi,
  /(\brm\b|\bdel\b|\bdelete\b)/gi,
  /(\bchmod\b|\bchown\b)/gi,
  /(\bping\b|\bnc\b|\btelnet\b)/gi,
  /(\bpython\b|\bperl\b|\bruby\b|\bphp\b)/gi,
  /(\bexec\b|\bsystem\b|\bshell_exec\b)/gi
];

// ========== SANITIZAR STRING CONTRA SQL INJECTION ==========
export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input;
  }

  // Detectar patrones SQL injection
  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(input)) {
      throw new Error('Entrada potencialmente peligrosa detectada');
    }
  }

  // Escapar caracteres especiales
  return input
    .replace(/'/g, "''") // Escapar comillas simples
    .replace(/;/g, '') // Remover punto y coma
    .replace(/--/g, '') // Remover comentarios SQL
    .replace(/\/\*/g, '') // Remover comentarios multilinea
    .replace(/\*\//g, '')
    .trim();
}

// ========== SANITIZAR CONTRA XSS ==========
export function sanitizeXSS(input) {
  if (typeof input !== 'string') {
    return input;
  }

  // Detectar patrones XSS
  for (const pattern of xssPatterns) {
    if (pattern.test(input)) {
      throw new Error('Contenido XSS detectado');
    }
  }

  // Escapar caracteres HTML
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ========== SANITIZAR CONTRA PATH TRAVERSAL ==========
export function sanitizePath(input) {
  if (typeof input !== 'string') {
    return input;
  }

  // Detectar path traversal
  for (const pattern of pathTraversalPatterns) {
    if (pattern.test(input)) {
      throw new Error('Intento de path traversal detectado');
    }
  }

  // Normalizar path
  return input
    .replace(/\.\./g, '')
    .replace(/\/\//g, '/')
    .replace(/\\/g, '/');
}

// ========== MIDDLEWARE DE SANITIZACIÓN AUTOMÁTICA ==========
export const inputSanitization = (req, res, next) => {
  try {
    // Solo sanitizar strings, no lanzar errores automáticamente
    // Solo detectar y loguear patrones peligrosos, pero permitir el request
    const detectDangerousPatterns = (obj, path = '') => {
      if (typeof obj === 'string') {
        // Solo detectar patrones realmente peligrosos
        const dangerousPatterns = [
          /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION)\b.*?;)/gi,
          /(--|#|\/\*|\*\/).*?(SELECT|DROP|DELETE)/gi,
          /<script[^>]*>.*?<\/script>/gi,
          /javascript:.*?\(/gi,
          /\.\.\/.*?\.\.\//g
        ];
        
        for (const pattern of dangerousPatterns) {
          if (pattern.test(obj)) {
            console.warn('⚠️ Patrón peligroso detectado (permitiendo request):', {
              ip: req.ip,
              path: req.path,
              field: path,
              pattern: pattern.toString()
            });
            logSecurityEvent(req, 'SUSPICIOUS_PATTERN', `Campo: ${path}`);
            // No bloquear, solo loguear
            break;
          }
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          detectDangerousPatterns(item, `${path}[${index}]`);
        });
      } else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          detectDangerousPatterns(value, path ? `${path}.${key}` : key);
        }
      }
    };

    // Detectar patrones peligrosos pero no bloquear
    if (req.body && typeof req.body === 'object') {
      detectDangerousPatterns(req.body, 'body');
    }
    if (req.query && typeof req.query === 'object') {
      detectDangerousPatterns(req.query, 'query');
    }
    if (req.params && typeof req.params === 'object') {
      detectDangerousPatterns(req.params, 'params');
    }

    next();
  } catch (error) {
    console.error('Error en sanitización:', error);
    // Continuar con el request incluso si hay error en la sanitización
    next();
  }
};

// ========== SANITIZAR OBJETO RECURSIVAMENTE ==========
function sanitizeObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'string') {
        return sanitizeInput(item);
      } else if (typeof item === 'object' && item !== null) {
        return sanitizeObject(item);
      }
      return item;
    });
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Para paths, usar sanitizePath
      if (key.toLowerCase().includes('path') || key.toLowerCase().includes('file')) {
        sanitized[key] = sanitizePath(value);
      } else {
        sanitized[key] = sanitizeInput(value);
      }
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ========== MIDDLEWARE DE LÍMITE DE TAMAÑO DE REQUEST ==========
export const requestSizeLimit = express.json({
  limit: '10mb', // Límite de 10MB para JSON
  verify: (req, res, buf) => {
    // Verificar tamaño del buffer
    if (buf.length > 10 * 1024 * 1024) {
      throw new Error('Request demasiado grande');
    }
  }
});

// ========== MIDDLEWARE DE TIMEOUT ==========
export const requestTimeout = (timeoutMs = 30000) => {
  return (req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request timeout',
          message: 'La petición tardó demasiado tiempo'
        });
      }
    }, timeoutMs);

    // Limpiar timeout cuando la respuesta se envía
    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));
    
    next();
  };
};

// ========== DETECCIÓN DE PATRONES DDoS ==========
const suspiciousIPs = new Map(); // IP -> { count, firstSeen, blocked }

// Función para limpiar todas las IPs bloqueadas (útil para desarrollo)
export const clearBlockedIPs = () => {
  suspiciousIPs.clear();
  console.log('✅ Todas las IPs bloqueadas han sido limpiadas');
};

export const ddosDetection = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const windowMs = 60000; // 1 minuto
  const maxRequests = 1000; // Aumentado a 1000 requests por minuto para soportar apps SPA
  const blockDuration = 5 * 60 * 1000; // Reducido a 5 minutos

  // Obtener registro de IP
  let record = suspiciousIPs.get(ip);
  
  if (!record) {
    record = {
      count: 0,
      firstSeen: now,
      blocked: false,
      blockedUntil: 0
    };
    suspiciousIPs.set(ip, record);
  }

  // Verificar si está bloqueada
  if (record.blocked && now < record.blockedUntil) {
    const remaining = Math.ceil((record.blockedUntil - now) / 1000 / 60);
    // Solo loguear 1 de cada 100 para no saturar logs
    if (record.count % 100 === 0) {
      logSecurityEvent(req, 'DDOS_BLOCKED', `IP bloqueada por ${remaining} minutos más`);
    }
    
    return res.status(429).json({
      error: 'IP bloqueada temporalmente',
      message: `Demasiadas peticiones. Intenta en ${remaining} minutos.`
    });
  }

  // Resetear contador si pasó la ventana
  if (now - record.firstSeen > windowMs) {
    record.count = 0;
    record.firstSeen = now;
    record.blocked = false;
  }

  // Incrementar contador
  record.count++;

  // Detectar patrón DDoS - solo bloquear si es realmente excesivo
  if (record.count > maxRequests) {
    record.blocked = true;
    record.blockedUntil = now + blockDuration;
    
    console.warn('🚨 IP bloqueada por DDoS:', {
      ip,
      count: record.count,
      path: req.path,
      userAgent: req.headers['user-agent']
    });
    
    logSecurityEvent(req, 'DDOS_DETECTED', `IP bloqueada: ${ip}, ${record.count} requests`);
    
    return res.status(429).json({
      error: 'IP bloqueada por actividad sospechosa',
      message: 'Has excedido el límite de peticiones. Intenta en 5 minutos.'
    });
  }

  next();
};

// ========== LIMPIAR IPs BLOQUEADAS CADA HORA ==========
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of suspiciousIPs.entries()) {
    if (record.blocked && now > record.blockedUntil) {
      suspiciousIPs.delete(ip);
    }
  }
}, 60 * 60 * 1000); // Cada hora

// ========== LOG DE EVENTOS DE SEGURIDAD ==========
async function logSecurityEvent(req, eventType, details) {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Log a consola
    console.warn(`🔒 [SECURITY] ${eventType}:`, {
      ip,
      path: req.path,
      method: req.method,
      userAgent,
      details,
      timestamp: new Date().toISOString()
    });

    // Opcional: Guardar en base de datos (descomentar si tienes tabla de auditoría)
    /*
    try {
      await prisma.securityLog.create({
        data: {
          eventType,
          ip,
          path: req.path,
          method: req.method,
          userAgent,
          details: JSON.stringify(details),
          timestamp: new Date()
        }
      });
    } catch (dbError) {
      // Si no existe la tabla, solo loguear
      console.warn('No se pudo guardar en DB:', dbError.message);
    }
    */
  } catch (error) {
    console.error('Error logueando evento de seguridad:', error);
  }
}

// ========== MIDDLEWARE DE PROTECCIÓN CSRF ==========
export const csrfProtection = (req, res, next) => {
  // Solo aplicar a métodos que modifican datos
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return next();
  }

  // Permitir requests con API key interna (webhooks, etc.)
  if (req.headers['x-api-key'] === process.env.INTERNAL_API_KEY) {
    return next();
  }

  // Permitir requests autenticadas con token válido
  if (req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer ')) {
    return next();
  }

  // Verificar header de origen solo si está presente
  const origin = req.headers.origin || req.headers.referer;
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'https://elbuenmenu.site',
    'https://elbuenmenu.site',
    'https://buenmenuapp.online',
    'http://localhost:3000',
    'http://localhost:5173'
  ];

  // Si no hay origin, permitir (puede ser Postman, mobile apps, etc.)
  if (!origin) {
    return next();
  }

  // Verificar origen
  try {
    const originUrl = new URL(origin);
    const isAllowed = allowedOrigins.some(allowed => {
      try {
        const allowedUrl = new URL(allowed);
        return originUrl.hostname === allowedUrl.hostname;
      } catch {
        return false;
      }
    });

    if (!isAllowed) {
      console.warn('⚠️ Origen no permitido (permitiendo request):', origin);
      logSecurityEvent(req, 'CSRF_WARNING', `Origen no en lista: ${origin}`);
      // No bloquear, solo loguear
    }
  } catch (error) {
    // Si hay error parseando URL, continuar
    console.warn('⚠️ Error parseando origen:', error.message);
  }

  next();
};

// ========== MIDDLEWARE DE VALIDACIÓN DE QUERIES RAW ==========
export const validateRawQuery = (query, params = []) => {
  // Verificar que no haya patrones SQL injection en la query
  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(query)) {
      throw new Error('Query contiene patrones SQL injection');
    }
  }

  // Verificar que los parámetros estén usando placeholders
  // Prisma $queryRaw usa ${} para parámetros, que es seguro
  // Pero $queryRawUnsafe puede ser peligroso si se concatenan strings
  const hasStringConcatenation = query.includes('+') || query.includes('||');
  if (hasStringConcatenation && !query.includes('${')) {
    throw new Error('Query usa concatenación de strings en lugar de parámetros');
  }

  return true;
};

// ========== WRAPPER PARA QUERIES RAW SEGURAS ==========
export async function safeRawQuery(queryFn) {
  try {
    // Ejecutar query
    const result = await queryFn();
    return result;
  } catch (error) {
    // Detectar errores de SQL injection
    if (error.message && (
      error.message.includes('SQL syntax') ||
      error.message.includes('syntax error') ||
      error.message.includes('injection')
    )) {
      console.error('🚨 Posible intento de SQL injection detectado:', error.message);
      logSecurityEvent({ ip: 'unknown', path: 'database' }, 'SQL_INJECTION_ATTEMPT', error.message);
      throw new Error('Error en la consulta');
    }
    throw error;
  }
}

