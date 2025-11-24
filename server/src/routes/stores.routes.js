import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';
import { corsMiddleware } from '../middlewares/security.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// Verificar que Prisma Client esté correctamente inicializado
console.log('🔍 Verificando Prisma Client...');
console.log('Prisma Client disponible:', !!prisma);
console.log('Modelos disponibles:', Object.keys(prisma).filter(key => !key.startsWith('$') && !key.startsWith('_')));
console.log('Store disponible:', !!prisma.store);

if (!prisma || !prisma.store) {
  console.error('❌ ERROR: Prisma Client no está correctamente inicializado.');
  console.error('Modelos encontrados:', Object.keys(prisma).filter(key => !key.startsWith('$') && !key.startsWith('_')));
  console.error('Ejecuta: cd server && npx prisma generate && pm2 restart backend');
}

// GET /api/stores - Obtener todos los stores activos
router.get('/', corsMiddleware, async (req, res) => {
  try {
    // Verificar que prisma.store existe
    if (!prisma.store) {
      console.error('❌ ERROR: Prisma Client no tiene el modelo Store. Ejecuta: cd server && npx prisma generate');
      return res.status(500).json({ 
        error: 'Error de configuración del servidor. Prisma Client no está actualizado.' 
      });
    }
    
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
    // Verificar que prisma.store existe
    if (!prisma.store) {
      console.error('❌ ERROR: Prisma Client no tiene el modelo Store. Ejecuta: cd server && npx prisma generate');
      return res.status(500).json({ 
        error: 'Error de configuración del servidor. Prisma Client no está actualizado.' 
      });
    }
    
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
  corsMiddleware,
  authenticateAdmin,
  authorize('super_admin'),
  async (req, res) => {
    try {
      const { id, name, category, categoryId, image_url, description, hours } = req.body;
      
      if (!id || !name) {
        return res.status(400).json({ error: 'id y name son requeridos' });
      }
      
      const store = await prisma.store.create({
        data: {
          id,
          name,
          categoryId: categoryId || category || null, // categoryId tiene prioridad
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
  corsMiddleware,
  authenticateAdmin,
  async (req, res) => {
    try {
      const user = req.user;
      const storeId = req.params.id;
      
      // Verificar permisos: superadmin puede editar cualquier store, admin solo el suyo
      if (user.role !== 'super_admin' && user.storeId !== storeId) {
        return res.status(403).json({ error: 'No tienes permisos para editar este store' });
      }
      
      const { name, category, categoryId, image_url, description, hours, is_active } = req.body;
      
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      // categoryId tiene prioridad sobre category (para compatibilidad)
      if (categoryId !== undefined) {
        updateData.categoryId = categoryId || null;
      } else if (category !== undefined) {
        // Si se envía category como string, buscar el StoreCategory correspondiente
        // Por ahora, mantener compatibilidad: si category es un ID válido, usarlo como categoryId
        // Si es un string de nombre, mantenerlo como null (requeriría búsqueda)
        updateData.categoryId = category || null;
      }
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

