import { adminAuthService, driverAuthService } from '../services/auth.service.js';

// ========== MIDDLEWARE DE AUTENTICACIÓN ADMIN ==========
export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Si no hay token, crear un usuario mock para desarrollo
    // TODO: Implementar sistema de login real en el frontend
    if (!authHeader?.startsWith('Bearer ')) {
      // Usuario mock para desarrollo - REMOVER EN PRODUCCIÓN
      req.user = {
        id: 'admin-dev',
        email: 'admin@dev.local',
        role: 'admin',
        isActive: true
      };
      return next();
    }

    const token = authHeader.split(' ')[1];
    const user = await adminAuthService.verifyAccessToken(token);

    // Agregar usuario al request
    req.user = user;
    next();
  } catch (error) {
    // Si el token es inválido pero no es crítico, permitir acceso con usuario mock
    // TODO: En producción, esto debe requerir autenticación real
    // Solo mostrar warning en desarrollo para no saturar logs
    const nodeEnv = process.env.NODE_ENV || 'development';
    // Solo mostrar warning si NO estamos en producción
    if (nodeEnv.toLowerCase() !== 'production') {
      console.warn('⚠️ Token inválido, usando usuario mock para desarrollo:', error.message);
    }
    req.user = {
      id: 'admin-dev',
      email: 'admin@dev.local',
      role: 'admin',
      isActive: true
    };
    next();
  }
};

// ========== MIDDLEWARE DE AUTORIZACIÓN POR ROLES ==========
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Si es usuario mock de desarrollo, permitir acceso a todos los roles
    // TODO: En producción, esto debe validar roles correctamente
    if (req.user.id === 'admin-dev') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Log intento de acceso no autorizado
      console.warn('Intento de acceso no autorizado', {
        userId: req.user.id,
        role: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path
      });
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }

    next();
  };
};

// ========== MIDDLEWARE DE AUTENTICACIÓN REPARTIDOR ==========
export const authenticateDriver = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    const driver = await driverAuthService.verifyDriverToken(token);

    req.driver = driver;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// ========== MIDDLEWARE PARA VERIFICAR QUE EL REPARTIDOR SOLO ACCEDE A SUS DATOS ==========
export const authorizeDriver = (req, res, next) => {
  const driverIdFromToken = req.driver.id;
  const driverIdFromParams = req.params.driver_id || req.body.driver_id;

  if (driverIdFromParams && driverIdFromParams !== driverIdFromToken) {
    console.warn('Intento de acceso a datos de otro repartidor', {
      driverId: driverIdFromToken,
      attemptedAccess: driverIdFromParams,
      ip: req.ip
    });
    return res.status(403).json({ error: 'No tienes permiso para acceder a estos datos' });
  }

  // Asegurar que el driver_id en el body sea el correcto
  if (req.body.driver_id) {
    req.body.driver_id = driverIdFromToken;
  }

  next();
};

// ========== MIDDLEWARE PARA API KEY (WEBHOOKS) ==========
export const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.INTERNAL_API_KEY || 'CHANGE_THIS_API_KEY';

  if (!apiKey || apiKey !== expectedKey) {
    console.warn('Intento de acceso con API key inválida', { ip: req.ip });
    return res.status(401).json({ error: 'API key inválida' });
  }

  next();
};

