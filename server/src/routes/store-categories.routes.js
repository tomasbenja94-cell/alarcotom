import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';
import { corsMiddleware } from '../middlewares/security.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/store-categories - Obtener todas las categorías de tiendas
router.get('/', corsMiddleware, async (req, res) => {
  try {
    const categories = await prisma.storeCategory.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        _count: {
          select: { stores: true }
        }
      }
    });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching store categories:', error);
    res.status(500).json({ error: 'Error al obtener categorías de tiendas' });
  }
});

// GET /api/store-categories/:id - Obtener una categoría específica
router.get('/:id', corsMiddleware, async (req, res) => {
  try {
    const category = await prisma.storeCategory.findUnique({
      where: { id: req.params.id },
      include: {
        stores: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            imageUrl: true
          }
        }
      }
    });
    
    if (!category) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    
    res.json(category);
  } catch (error) {
    console.error('Error fetching store category:', error);
    res.status(500).json({ error: 'Error al obtener categoría' });
  }
});

// POST /api/store-categories - Crear nueva categoría (solo superadmin)
router.post('/',
  corsMiddleware,
  authenticateAdmin,
  authorize('super_admin'),
  async (req, res) => {
    try {
      const { name, slug, icon, color, displayOrder } = req.body;
      
      if (!name || !slug) {
        return res.status(400).json({ error: 'Nombre y slug son requeridos' });
      }

      // Verificar que el slug no exista
      const existing = await prisma.storeCategory.findUnique({
        where: { slug: slug.toLowerCase() }
      });

      if (existing) {
        return res.status(400).json({ error: 'Ya existe una categoría con este slug' });
      }

      const category = await prisma.storeCategory.create({
        data: {
          name,
          slug: slug.toLowerCase(),
          icon: icon || null,
          color: color || null,
          displayOrder: displayOrder || 0,
          isActive: true
        }
      });

      res.json(category);
    } catch (error) {
      console.error('Error creating store category:', error);
      if (error.code === 'P2002') {
        return res.status(400).json({ error: 'Ya existe una categoría con este nombre o slug' });
      }
      res.status(500).json({ error: 'Error al crear categoría' });
    }
  }
);

// PUT /api/store-categories/:id - Actualizar categoría (solo superadmin)
router.put('/:id',
  corsMiddleware,
  authenticateAdmin,
  authorize('super_admin'),
  async (req, res) => {
    try {
      const { name, slug, icon, color, displayOrder, isActive } = req.body;
      
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (slug !== undefined) updateData.slug = slug.toLowerCase();
      if (icon !== undefined) updateData.icon = icon;
      if (color !== undefined) updateData.color = color;
      if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
      if (isActive !== undefined) updateData.isActive = isActive;

      const category = await prisma.storeCategory.update({
        where: { id: req.params.id },
        data: updateData
      });

      res.json(category);
    } catch (error) {
      console.error('Error updating store category:', error);
      if (error.code === 'P2002') {
        return res.status(400).json({ error: 'Ya existe una categoría con este nombre o slug' });
      }
      res.status(500).json({ error: 'Error al actualizar categoría' });
    }
  }
);

// DELETE /api/store-categories/:id - Eliminar categoría (solo superadmin)
router.delete('/:id',
  corsMiddleware,
  authenticateAdmin,
  authorize('super_admin'),
  async (req, res) => {
    try {
      // Verificar que no haya tiendas usando esta categoría
      const storesCount = await prisma.store.count({
        where: { categoryId: req.params.id }
      });

      if (storesCount > 0) {
        return res.status(400).json({ 
          error: `No se puede eliminar la categoría porque tiene ${storesCount} tienda(s) asignada(s)` 
        });
      }

      await prisma.storeCategory.delete({
        where: { id: req.params.id }
      });

      res.json({ message: 'Categoría eliminada exitosamente' });
    } catch (error) {
      console.error('Error deleting store category:', error);
      res.status(500).json({ error: 'Error al eliminar categoría' });
    }
  }
);

export default router;

