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
    // Verificación estricta: debe ser exactamente 'production' (case-insensitive)
    if (nodeEnv && nodeEnv.trim().toLowerCase() === 'production') {
      // En producción, no mostrar warnings
    } else {
      // Solo en desarrollo o si NODE_ENV no está configurado
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

// ========== MIDDLEWARE PARA VERIFICAR ACCESO AL STORE ==========
export const authorizeStoreAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  // Si es usuario mock de desarrollo, permitir acceso
  if (req.user.id === 'admin-dev') {
    return next();
  }

  // Superadmin puede acceder a cualquier store
  if (req.user.role === 'super_admin') {
    return next();
  }

  // Obtener storeId del request (query, params o body)
  const storeId = req.query.storeId || req.params.storeId || req.body.storeId || req.body.store_id;

  // Si no hay storeId en el request, permitir (puede ser endpoint global)
  if (!storeId) {
    return next();
  }

  // Admin de tienda solo puede acceder a su propio store
  if (req.user.storeId && req.user.storeId !== storeId) {
    console.warn('Intento de acceso a store no autorizado', {
      userId: req.user.id,
      userStoreId: req.user.storeId,
      requestedStoreId: storeId,
      path: req.path
    });
    return res.status(403).json({ error: 'No tienes permiso para acceder a este store' });
  }

  next();
};

// ========== MIDDLEWARE DE AUTENTICACIÓN REPARTIDOR ==========
export const authenticateDriver = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      // Solo loggear en desarrollo
      if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ [AUTH DRIVER] Token no proporcionado en:', req.path);
      }
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    // Solo loggear en desarrollo para no saturar logs en producción
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔍 [AUTH DRIVER] Verificando token para:', req.path);
    }
    const driver = await driverAuthService.verifyDriverToken(token);
    // Solo loggear en desarrollo
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ [AUTH DRIVER] Token válido, driver:', driver.id);
    }

    req.driver = driver;
    next();
  } catch (error) {
    // Solo loggear errores críticos en producción, todos en desarrollo
    if (process.env.NODE_ENV !== 'production' || error.message?.includes('invalid signature')) {
      console.error('❌ [AUTH DRIVER] Error verificando token:', error.message);
    }
    return res.status(401).json({ error: 'Token inválido o expirado', details: error.message });
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

