import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';
import { corsMiddleware } from '../middlewares/security.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/stores - Obtener todos los stores activos
router.get('/', corsMiddleware, async (req, res) => {
  try {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
    res.json(stores);
  } catch (error) {
    console.error('Error fetching stores:', error);
    res.status(500).json({ error: 'Error al obtener stores' });
  }
});

// GET /api/stores/:id - Obtener un store específico
router.get('/:id', corsMiddleware, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.params.id }
    });
    
    if (!store) {
      return res.status(404).json({ error: 'Store no encontrado' });
    }
    
    res.json(store);
  } catch (error) {
    console.error('Error fetching store:', error);
    res.status(500).json({ error: 'Error al obtener store' });
  }
});

// POST /api/stores - Crear un nuevo store (solo superadmin)
router.post('/', 
  authenticateAdmin,
  authorize('super_admin'),
  async (req, res) => {
    try {
      const { id, name, category, image_url, description, hours } = req.body;
      
      if (!id || !name) {
        return res.status(400).json({ error: 'id y name son requeridos' });
      }
      
      const store = await prisma.store.create({
        data: {
          id,
          name,
          category: category || null,
          imageUrl: image_url || null,
          description: description || null,
          hours: hours || null,
          isActive: true
        }
      });
      
      res.json(store);
    } catch (error) {
      console.error('Error creating store:', error);
      res.status(500).json({ error: 'Error al crear store' });
    }
  }
);

// PUT /api/stores/:id - Actualizar un store (solo superadmin o admin del store)
router.put('/:id',
  authenticateAdmin,
  async (req, res) => {
    try {
      const user = req.user;
      const storeId = req.params.id;
      
      // Verificar permisos: superadmin puede editar cualquier store, admin solo el suyo
      if (user.role !== 'super_admin' && user.storeId !== storeId) {
        return res.status(403).json({ error: 'No tienes permisos para editar este store' });
      }
      
      const { name, category, image_url, description, hours, is_active } = req.body;
      
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (category !== undefined) updateData.category = category;
      if (image_url !== undefined) updateData.imageUrl = image_url;
      if (description !== undefined) updateData.description = description;
      if (hours !== undefined) updateData.hours = hours;
      if (is_active !== undefined) updateData.isActive = is_active;
      
      const store = await prisma.store.update({
        where: { id: storeId },
        data: updateData
      });
      
      res.json(store);
    } catch (error) {
      console.error('Error updating store:', error);
      res.status(500).json({ error: 'Error al actualizar store' });
    }
  }
);

export default router;

