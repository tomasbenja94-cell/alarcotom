import express from 'express';
import { adminAuthService } from '../services/auth.service.js';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { loginRateLimit } from '../middlewares/security.middleware.js';
import { z } from 'zod';

const router = express.Router();

// Schemas de validación
const loginAdminSchema = z.object({
  email: z.string().email('Email inválido'),
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
      const { email, password } = req.body;
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'Unknown';
      const userAgent = req.headers['user-agent'] || 'Unknown';

      const result = await adminAuthService.loginAdmin(email, password, ipAddress, userAgent);

      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        admin: result.admin
      });
    } catch (error) {
      // Error genérico para no revelar si el email existe o no
      if (error.message.includes('Credenciales') || error.message.includes('desactivada')) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      next(error);
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

export default router;

