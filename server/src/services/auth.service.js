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
  async loginAdmin(email, password, ipAddress, userAgent) {
    // 1. Buscar admin
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      await this.logFailedLogin(email, 'Usuario no encontrado', ipAddress);
      throw new Error('Credenciales inválidas');
    }

    // 2. Verificar contraseña
    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      await this.logFailedLogin(email, 'Contraseña incorrecta', ipAddress);
      throw new Error('Credenciales inválidas');
    }

    if (!admin.isActive) {
      throw new Error('Cuenta desactivada');
    }

    // 3. Generar tokens
    const accessToken = this.generateAccessToken(admin);
    const refreshToken = this.generateRefreshToken(admin);

    // 4. Guardar refresh token (hasheado)
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await prisma.refreshToken.create({
      data: {
        adminId: admin.id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 días
      }
    });

    // 5. Log auditoría
    await this.logAccess('login_success', admin.id, admin.role, { email, ipAddress, userAgent });

    return {
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role
      }
    };
  }

  // Generar access token (sin expiración para sesión permanente)
  generateAccessToken(admin) {
    return jwt.sign(
      { userId: admin.id, role: admin.role, email: admin.email, type: 'admin' },
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

      return { id: admin.id, role: admin.role, email: admin.email };
    } catch (error) {
      // Si el error es de expiración, ignorarlo y verificar solo la validez del token
      if (error.name === 'TokenExpiredError') {
        try {
          const decoded = jwt.decode(token);
          if (decoded && decoded.type === 'admin') {
            const admin = await prisma.admin.findUnique({ where: { id: decoded.userId } });
            if (admin && admin.isActive) {
              return { id: admin.id, role: admin.role, email: admin.email };
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
  async createAdmin(email, password, role = 'admin') {
    const passwordHash = await bcrypt.hash(password, 10);
    return await prisma.admin.create({
      data: {
        email,
        passwordHash,
        role
      }
    });
  }

  // Log intentos fallidos
  async logFailedLogin(email, reason, ipAddress) {
    // TODO: Implementar rate limiting aquí (5 intentos por IP)
    console.warn(`Intento de login fallido: ${email} - ${reason} - IP: ${ipAddress}`);
  }

  // Log de acceso exitoso
  async logAccess(action, userId, userRole, details = {}) {
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
      const decoded = jwt.verify(token, JWT_DRIVER_SECRET);
      if (decoded.type !== 'driver') {
        throw new Error('Token inválido');
      }

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const session = await prisma.driverSession.findFirst({
        where: {
          tokenHash,
          driverId: decoded.driverId,
          revoked: false
        },
        include: { driver: true }
      });

      if (!session || session.expiresAt < new Date()) {
        throw new Error('Sesión expirada');
      }

      const { passwordHash, ...driverData } = session.driver;
      return driverData;
    } catch (error) {
      throw new Error('Token inválido o expirado');
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

