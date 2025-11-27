import express from 'express';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { loginRateLimit } from '../middlewares/security.middleware.js';
import { adminController } from '../controllers/admin.controller.js';
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

// ========== RUTAS ==========

// Login
router.post('/login',
  loginRateLimit,
  validate(loginAdminSchema),
  adminController.login
);

// Refresh token
router.post('/refresh',
  validate(refreshTokenSchema),
  adminController.refresh
);

// Logout
router.post('/logout',
  authenticateAdmin,
  adminController.logout
);

// Me (verificar token)
router.get('/me',
  authenticateAdmin,
  adminController.me
);

// Obtener admins de tienda (superadmin)
router.get('/store/:storeId',
  authenticateAdmin,
  authorize('super_admin'),
  adminController.getStoreAdmins
);

// Crear admin (superadmin)
router.post('/create',
  authenticateAdmin,
  authorize('super_admin'),
  adminController.create
);

export default router;
