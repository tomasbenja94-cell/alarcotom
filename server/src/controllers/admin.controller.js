import { adminAuthService } from '../services/auth.service.js';
import prisma from '../utils/prisma.js';

/**
 * Controller para autenticación y gestión de admins
 */
export const adminController = {
  /**
   * Login de administrador
   */
  async login(req, res) {
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
      console.error('❌ [ADMIN LOGIN] Error:', error.message);
      
      if (error.message.includes('Credenciales') || error.message.includes('desactivada')) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      
      if (error.code === 'P2002' || error.message.includes('Unique constraint')) {
        return res.status(500).json({ error: 'Error de base de datos. Contacta al administrador.' });
      }
      
      res.status(500).json({ error: 'Error interno del servidor. Intenta más tarde.' });
    }
  },

  /**
   * Refrescar access token
   */
  async refresh(req, res) {
    try {
      const { refreshToken } = req.body;
      const newAccessToken = await adminAuthService.refreshAccessToken(refreshToken);
      res.json({ accessToken: newAccessToken });
    } catch (error) {
      if (error.message.includes('inválido') || error.message.includes('expirado')) {
        return res.status(401).json({ error: 'Refresh token inválido o expirado' });
      }
      res.status(500).json({ error: 'Error al refrescar token' });
    }
  },

  /**
   * Logout de administrador
   */
  async logout(req, res) {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await adminAuthService.logout(refreshToken);
      }
      res.json({ message: 'Sesión cerrada exitosamente' });
    } catch (error) {
      res.status(500).json({ error: 'Error al cerrar sesión' });
    }
  },

  /**
   * Obtener datos del admin autenticado
   */
  async me(req, res) {
    res.json({ admin: req.user });
  },

  /**
   * Obtener admins de una tienda (solo superadmin)
   */
  async getStoreAdmins(req, res) {
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
      res.status(500).json({ error: 'Error al obtener administradores' });
    }
  },

  /**
   * Crear administrador (solo superadmin)
   */
  async create(req, res) {
    try {
      const { username, password, role = 'admin', storeId } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }

      // Verificar que el username no exista
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

      // Crear admin
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
        return res.status(400).json({ error: 'Ya existe un administrador con este usuario' });
      }
      res.status(500).json({ error: 'Error al crear administrador' });
    }
  }
};

export default adminController;

