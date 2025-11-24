import express from 'express';
import { adminAuthService } from '../services/auth.service.js';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { loginRateLimit } from '../middlewares/security.middleware.js';
import { z } from 'zod';

const router = express.Router();

// Schemas de validación
const loginAdminSchema = z.object({
  username: z.string().min(1, 'El usuario es requerido'),
  password: z.string().min(1, 'La contraseña es requerida')
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token es requerido')
});

// ========== LOGIN ADMIN ==========
router.post('/login',
  loginRateLimit, // Rate limiting para login
  validate(loginAdminSchema),
  async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'Unknown';
      const userAgent = req.headers['user-agent'] || 'Unknown';

      const result = await adminAuthService.loginAdmin(username, password, ipAddress, userAgent);

      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        admin: result.admin
      });
    } catch (error) {
      console.error('❌ [ADMIN LOGIN] Error:', error);
      console.error('❌ [ADMIN LOGIN] Error message:', error.message);
      console.error('❌ [ADMIN LOGIN] Error stack:', error.stack);
      
      // Error genérico para no revelar si el email existe o no
      if (error.message.includes('Credenciales') || error.message.includes('desactivada')) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      
      // Si es un error de base de datos, dar mensaje más específico
      if (error.code === 'P2002' || error.message.includes('Unique constraint')) {
        return res.status(500).json({ error: 'Error de base de datos. Contacta al administrador.' });
      }
      
      // Error genérico del servidor
      res.status(500).json({ error: 'Error interno del servidor. Intenta más tarde.' });
    }
  }
);

// ========== REFRESH ACCESS TOKEN ==========
router.post('/refresh',
  validate(refreshTokenSchema),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;

      const newAccessToken = await adminAuthService.refreshAccessToken(refreshToken);

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      if (error.message.includes('inválido') || error.message.includes('expirado')) {
        return res.status(401).json({ error: 'Refresh token inválido o expirado' });
      }
      next(error);
    }
  }
);

// ========== LOGOUT ADMIN ==========
router.post('/logout',
  authenticateAdmin, // Verificar JWT
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        await adminAuthService.logout(refreshToken);
      }

      res.json({ message: 'Sesión cerrada exitosamente' });
    } catch (error) {
      next(error);
    }
  }
);

// ========== VERIFICAR TOKEN (ME) ==========
router.get('/me',
  authenticateAdmin, // Verificar JWT
  async (req, res) => {
    // El middleware authenticateAdmin ya agrega req.user
    res.json({ admin: req.user });
  }
);

// ========== OBTENER ADMINS DE UNA TIENDA (Solo superadmin) ==========
router.get('/store/:storeId',
  authenticateAdmin,
  authorize('super_admin'),
  async (req, res, next) => {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      try {
        const admins = await prisma.admin.findMany({
          where: { 
            storeId: req.params.storeId,
            role: 'admin',
            isActive: true
          },
          select: {
            id: true,
            username: true,
            role: true,
            isActive: true
          }
        });

        res.json(admins);
      } catch (error) {
        console.error('❌ [GET STORE ADMINS] Error:', error);
        throw error;
      } finally {
        await prisma.$disconnect();
      }
    } catch (error) {
      console.error('❌ [GET STORE ADMINS] Error no manejado:', error);
      res.status(500).json({ error: error.message || 'Error al obtener administradores' });
    }
  }
);

// ========== CREAR ADMINISTRADOR (Solo superadmin) ==========
router.post('/create',
  authenticateAdmin,
  authorize('super_admin'),
  async (req, res, next) => {
    try {
      const { username, password, role = 'admin', storeId } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }

      // Verificar que el email no exista y que el store existe
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      try {
        const existing = await prisma.admin.findUnique({
          where: { username }
        });

        if (existing) {
          return res.status(400).json({ error: 'Ya existe un administrador con este usuario' });
        }

        // Verificar que el store existe si se proporciona
        if (storeId) {
          const store = await prisma.store.findUnique({
            where: { id: storeId }
          });
          if (!store) {
            return res.status(400).json({ error: 'La tienda especificada no existe' });
          }
        }

        // Crear admin usando el servicio
        const admin = await adminAuthService.createAdmin(username, password, role);

        // Si hay storeId, actualizarlo
        if (storeId) {
          await prisma.admin.update({
            where: { id: admin.id },
            data: { storeId }
          });
        }

      res.json({
        id: admin.id,
        username: admin.username,
        role: admin.role,
        storeId: storeId || null
      });
      } catch (error) {
        console.error('❌ [CREATE ADMIN] Error:', error);
        if (error.code === 'P2002') {
          return res.status(400).json({ error: 'Ya existe un administrador con este email' });
        }
        throw error;
      } finally {
        await prisma.$disconnect();
      }
    } catch (error) {
      console.error('❌ [CREATE ADMIN] Error no manejado:', error);
      res.status(500).json({ error: error.message || 'Error al crear administrador' });
    }
  }
);

export default router;

