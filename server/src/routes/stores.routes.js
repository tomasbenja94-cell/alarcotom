import express from 'express';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';
import { corsMiddleware } from '../middlewares/security.middleware.js';
import { storesController } from '../controllers/stores.controller.js';

const router = express.Router();

// GET /api/stores - Obtener todos los stores activos
router.get('/', corsMiddleware, storesController.getAll);

// GET /api/stores/:id - Obtener un store específico
router.get('/:id', corsMiddleware, storesController.getById);

// POST /api/stores - Crear un nuevo store (solo superadmin)
router.post('/', 
  corsMiddleware,
  authenticateAdmin,
  authorize('super_admin'),
  storesController.create
);

// PUT /api/stores/:id - Actualizar un store
router.put('/:id',
  corsMiddleware,
  authenticateAdmin,
  storesController.update
);

// DELETE /api/stores/:id - Eliminar un store (solo superadmin)
router.delete('/:id',
  corsMiddleware,
  authenticateAdmin,
  authorize('super_admin'),
  storesController.delete
);

export default router;
