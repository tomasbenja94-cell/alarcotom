import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION';
const JWT_DRIVER_SECRET = process.env.JWT_DRIVER_SECRET || 'CHANGE_THIS_IN_PRODUCTION_DRIVER';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'CHANGE_THIS_REFRESH_SECRET';

// ========== ADMIN AUTH SERVICE ==========
class AdminAuthService {
  // Login admin
  async loginAdmin(username, password, ipAddress, userAgent) {
    let admin;
    
    try {
      // Verificar que Prisma Client esté funcionando
      if (!prisma || !prisma.admin) {
        console.error('❌ [ADMIN LOGIN] Prisma Client no está inicializado correctamente');
        throw new Error('Error de configuración del servidor');
      }

      // 1. Buscar admin por username
      admin = await prisma.admin.findUnique({ where: { username } });
      if (!admin) {
        await this.logFailedLogin(username, 'Usuario no encontrado', ipAddress);
        throw new Error('Credenciales inválidas');
      }

      // 2. Verificar contraseña
      if (!admin.passwordHash) {
        console.error('❌ [ADMIN LOGIN] Admin sin passwordHash:', username);
        throw new Error('Credenciales inválidas');
      }

      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) {
        await this.logFailedLogin(username, 'Contraseña incorrecta', ipAddress);
        throw new Error('Credenciales inválidas');
      }

      if (!admin.isActive) {
        throw new Error('Cuenta desactivada');
      }
    } catch (error) {
      // Si es un error de Prisma (tabla no existe, etc.)
      if (error.code === 'P2021' || error.code === 'P2003' || error.message.includes('does not exist')) {
        console.error('❌ [ADMIN LOGIN] Error de base de datos:', error.message);
        throw new Error('Error de configuración del servidor. La tabla de administradores no existe.');
      }
      // Re-lanzar otros errores
      throw error;
    }

    // 3. Generar tokens
    const accessToken = this.generateAccessToken(admin);
    const refreshToken = this.generateRefreshToken(admin);

    // 4. Guardar refresh token (hasheado)
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    try {
      await prisma.refreshToken.create({
        data: {
          adminId: admin.id,
          tokenHash: refreshTokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 días
        }
      });
    } catch (tokenError) {
      console.warn('⚠️ [ADMIN LOGIN] Error guardando refresh token (continuando):', tokenError.message);
      // Continuar sin guardar el refresh token si falla
    }

    // 5. Log auditoría (opcional, no fallar si no se puede guardar)
    try {
      await this.logAccess('login_success', admin.id, admin.role, { username, ipAddress, userAgent });
    } catch (logError) {
      console.warn('⚠️ [ADMIN LOGIN] Error guardando log de auditoría (continuando):', logError.message);
      // Continuar sin guardar el log si falla
    }

    return {
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        storeId: admin.storeId
      }
    };
  }

  // Generar access token (sin expiración para sesión permanente)
  generateAccessToken(admin) {
    return jwt.sign(
      { userId: admin.id, role: admin.role, username: admin.username, storeId: admin.storeId, type: 'admin' },
      JWT_SECRET
      // Sin expiresIn para que nunca expire
    );
  }

  // Generar refresh token
  generateRefreshToken(admin) {
    return jwt.sign(
      { userId: admin.id, type: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    try {
      // 1. Verificar refresh token
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

      // 2. Verificar que existe en DB
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const storedToken = await prisma.refreshToken.findFirst({
        where: {
          tokenHash,
          adminId: decoded.userId,
          revoked: false
        },
        include: { admin: true }
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new Error('Refresh token inválido o expirado');
      }

      // 3. Generar nuevo access token
      return this.generateAccessToken(storedToken.admin);
    } catch (error) {
      throw new Error('Refresh token inválido');
    }
  }

  // Logout (revocar refresh token)
  async logout(refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true, revokedAt: new Date() }
    });
  }

  // Verificar access token (ignorar expiración para sesión permanente)
  async verifyAccessToken(token) {
    try {
      // Verificar token sin validar expiración
      const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
      if (decoded.type !== 'admin') {
        throw new Error('Token inválido');
      }

      // Verificar que el admin sigue activo
      const admin = await prisma.admin.findUnique({ where: { id: decoded.userId } });
      if (!admin || !admin.isActive) {
        throw new Error('Usuario no autorizado');
      }

      return { id: admin.id, role: admin.role, username: admin.username, storeId: admin.storeId };
    } catch (error) {
      // Si el error es de expiración, ignorarlo y verificar solo la validez del token
      if (error.name === 'TokenExpiredError') {
        try {
          const decoded = jwt.decode(token);
          if (decoded && decoded.type === 'admin') {
            const admin = await prisma.admin.findUnique({ where: { id: decoded.userId } });
            if (admin && admin.isActive) {
              return { id: admin.id, role: admin.role, username: admin.username, storeId: admin.storeId };
            }
          }
        } catch (decodeError) {
          // Si falla el decode, lanzar error original
        }
      }
      throw new Error('Token inválido');
    }
  }

  // Crear admin (solo para inicialización)
  async createAdmin(username, password, role = 'admin') {
    const passwordHash = await bcrypt.hash(password, 10);
    return await prisma.admin.create({
      data: {
        username,
        passwordHash,
        role
      }
    });
  }

  // Log intentos fallidos
  async logFailedLogin(username, reason, ipAddress) {
    // TODO: Implementar rate limiting aquí (5 intentos por IP)
    console.warn(`Intento de login fallido: ${username} - ${reason} - IP: ${ipAddress}`);
  }

  // Log de acceso exitoso
  async logAccess(action, userId, userRole, details = {}) {
    try {
      await prisma.auditLog.create({
        data: {
          action,
          userId,
          userRole,
          details: JSON.stringify(details),
          ipAddress: details.ipAddress,
          userAgent: details.userAgent,
          timestamp: new Date()
        }
      });
    } catch (error) {
      // Si la tabla audit_logs no existe o hay error, solo loguear y continuar
      console.warn('⚠️ [AUDIT LOG] Error guardando log (tabla puede no existir):', error.message);
      // No lanzar error para no interrumpir el login
    }
  }
}

// ========== DRIVER AUTH SERVICE ==========
class DriverAuthService {
  // Login repartidor
  async loginDriver(username, password, deviceInfo, ipAddress) {
    // 1. Buscar repartidor
    const driver = await prisma.deliveryPerson.findUnique({ where: { username } });
    if (!driver) {
      await this.logFailedLogin(username, 'Usuario no encontrado', ipAddress);
      throw new Error('Credenciales inválidas');
    }

    // 2. Verificar contraseña (soporta migración de password plano a hash)
    let valid = false;
    if (driver.passwordHash) {
      valid = await bcrypt.compare(password, driver.passwordHash);
    } else if (driver.password) {
      // Migración: comparar password plano y hashear si coincide
      if (driver.password === password) {
        valid = true;
        // Hashear y guardar
        const hash = await bcrypt.hash(password, 10);
        await prisma.deliveryPerson.update({
          where: { id: driver.id },
          data: { passwordHash: hash, password: null }
        });
      }
    }

    if (!valid) {
      await this.logFailedLogin(username, 'Contraseña incorrecta', ipAddress);
      throw new Error('Credenciales inválidas');
    }

    if (!driver.isActive) {
      throw new Error('Tu cuenta está desactivada');
    }

    // 3. Generar token JWT
    const accessToken = this.generateAccessToken(driver);

    // 4. Guardar sesión
    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    await prisma.driverSession.create({
      data: {
        driverId: driver.id,
        tokenHash,
        deviceInfo: deviceInfo || 'Unknown',
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 horas
      }
    });

    // 5. Retornar datos (sin passwordHash)
    const { passwordHash, ...driverData } = driver;
    return { accessToken, driver: driverData };
  }

  // Generar access token para repartidor
  generateAccessToken(driver) {
    return jwt.sign(
      { driverId: driver.id, type: 'driver' },
      JWT_DRIVER_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  // Verificar token de repartidor
  async verifyDriverToken(token) {
    try {
      // 1. Verificar JWT
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_DRIVER_SECRET);
      } catch (jwtError) {
        // Loggear el error específico para debugging
        if (process.env.NODE_ENV !== 'production') {
          console.error('❌ [VERIFY DRIVER TOKEN] Error verificando JWT:', jwtError.message);
          console.error('❌ [VERIFY DRIVER TOKEN] Error name:', jwtError.name);
        }
        
        if (jwtError.name === 'TokenExpiredError') {
          throw new Error('Token expirado');
        } else if (jwtError.name === 'JsonWebTokenError') {
          // Mensaje más específico para errores de firma
          if (jwtError.message.includes('invalid signature')) {
            throw new Error('Token inválido: firma incorrecta. El token puede haber sido generado con un secret diferente.');
          }
          throw new Error('Token inválido: ' + jwtError.message);
        }
        throw jwtError;
      }

      if (decoded.type !== 'driver') {
        console.error('❌ [VERIFY DRIVER TOKEN] Tipo de token incorrecto:', decoded.type);
        throw new Error('Token inválido: tipo incorrecto');
      }

      if (!decoded.driverId) {
        console.error('❌ [VERIFY DRIVER TOKEN] Token sin driverId');
        throw new Error('Token inválido: sin driverId');
      }

      // 2. Verificar que el driver existe y está activo
      const driver = await prisma.deliveryPerson.findUnique({
        where: { id: decoded.driverId }
      });

      if (!driver) {
        console.error('❌ [VERIFY DRIVER TOKEN] Driver no encontrado:', decoded.driverId);
        throw new Error('Repartidor no encontrado');
      }

      if (!driver.isActive) {
        console.error('❌ [VERIFY DRIVER TOKEN] Driver desactivado:', decoded.driverId);
        throw new Error('Repartidor desactivado');
      }

      // 3. Verificar sesión en BD (opcional, puede no existir la tabla)
      // Si la tabla existe y la sesión está revocada, rechazar
      // Pero si solo está expirada, permitir (el JWT puede seguir siendo válido)
      try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const session = await prisma.driverSession.findFirst({
          where: {
            tokenHash,
            driverId: decoded.driverId
          }
        });

        // Solo rechazar si la sesión está explícitamente revocada
        if (session && session.revoked) {
          console.warn('⚠️ [VERIFY DRIVER TOKEN] Sesión revocada para driver:', decoded.driverId);
          throw new Error('Sesión revocada');
        }
        
        // Si la sesión está expirada pero no revocada, permitir (el JWT puede seguir siendo válido)
        // Esto permite que el token funcione aunque la sesión en BD haya expirado
        // No loggear esto para no saturar logs
      } catch (sessionError) {
        // Si la tabla no existe o hay error, continuar con verificación básica del token
        // Esto permite que funcione aunque no exista la tabla de sesiones
        if (sessionError.code === 'P2021' || sessionError.message?.includes('does not exist')) {
          // No loggear esto para no saturar logs (es un caso esperado si la tabla no existe)
        } else if (sessionError.message?.includes('Sesión revocada')) {
          // Si la sesión está revocada, rechazar
          throw sessionError;
        } else {
          // Otros errores de sesión: ignorar y continuar con verificación básica
          // Solo loggear en desarrollo para no saturar logs
          if (process.env.NODE_ENV !== 'production') {
            console.warn('⚠️ [VERIFY DRIVER TOKEN] Error verificando sesión (continuando):', sessionError.message);
          }
        }
      }

      // 4. Retornar datos del driver (sin passwordHash)
      const { passwordHash, password, ...driverData } = driver;
      return driverData;
    } catch (error) {
      console.error('❌ [VERIFY DRIVER TOKEN] Error final:', error.message);
      throw error; // Relanzar el error original para que el middleware pueda manejarlo
    }
  }

  // Logout repartidor
  async logoutDriver(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await prisma.driverSession.updateMany({
      where: { tokenHash },
      data: { revoked: true, revokedAt: new Date() }
    });
  }

  // Log intentos fallidos
  async logFailedLogin(username, reason, ipAddress) {
    console.warn(`Intento de login fallido repartidor: ${username} - ${reason} - IP: ${ipAddress}`);
  }
}

// ========== UTILIDADES ==========

// Hash contraseña
export async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

// Comparar contraseña
export async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Exportar servicios
export const adminAuthService = new AdminAuthService();
export const driverAuthService = new DriverAuthService();

