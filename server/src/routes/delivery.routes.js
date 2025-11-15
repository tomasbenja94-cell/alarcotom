import express from 'express';
import { driverAuthService } from '../services/auth.service.js';
import { authenticateDriver, authorizeDriver } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { loginRateLimit } from '../middlewares/security.middleware.js';
import { loginDriverSchema } from '../validators/index.js';

const router = express.Router();

// ========== LOGIN REPARTIDOR ==========
router.post('/logout',
  authenticateDriver, // Verificar JWT
  async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        await driverAuthService.logoutDriver(token);
      }

      res.json({ message: 'Sesión cerrada exitosamente' });
    } catch (error) {
      next(error);
    }
  }
);

// ========== VERIFICAR TOKEN (ME) ==========
router.get('/me',
  authenticateDriver, // Verificar JWT
  async (req, res) => {
    // El middleware authenticateDriver ya agrega req.driver
    const { password, passwordHash, ...driverData } = req.driver;
    res.json({ driver: driverData });
  }
);

export default router;

