import prisma from '../utils/prisma.js';

/**
 * Controller para gestión de tiendas/stores
 */
export const storesController = {
  /**
   * Obtener todos los stores activos
   */
  async getAll(req, res) {
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
  },

  /**
   * Obtener un store por ID o nombre
   */
  async getById(req, res) {
    try {
      const identifier = req.params.id;
      
      // Intentar buscar por ID primero (UUID)
      let store = await prisma.store.findUnique({
        where: { id: identifier },
        include: {
          category: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      
      // Si no se encuentra por ID, intentar buscar por nombre
      if (!store) {
        store = await prisma.store.findFirst({
          where: { 
            name: {
              equals: identifier,
              mode: 'insensitive'
            }
          },
          include: {
            category: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });
      }
      
      if (!store) {
        return res.status(404).json({ error: 'Store no encontrado' });
      }
      
      res.json(store);
    } catch (error) {
      console.error('Error fetching store:', error);
      res.status(500).json({ error: 'Error al obtener store' });
    }
  },

  /**
   * Crear un nuevo store (solo superadmin)
   */
  async create(req, res) {
    try {
      const { id, name, category, categoryId, image_url, description, hours, panelType } = req.body;
      
      if (!id || !name) {
        return res.status(400).json({ error: 'id y name son requeridos' });
      }
      
      const store = await prisma.store.create({
        data: {
          id,
          name,
          categoryId: categoryId || category || null,
          imageUrl: image_url || null,
          description: description || null,
          hours: hours || null,
          panelType: panelType || 'normal',
          isActive: true
        }
      });
      
      res.json(store);
    } catch (error) {
      console.error('Error creating store:', error);
      res.status(500).json({ error: 'Error al crear store' });
    }
  },

  /**
   * Actualizar un store
   */
  async update(req, res) {
    try {
      const user = req.user;
      const storeId = req.params.id;
      
      // Verificar permisos: superadmin puede editar cualquier store, admin solo el suyo
      if (user.role !== 'super_admin' && user.storeId !== storeId) {
        return res.status(403).json({ error: 'No tienes permisos para editar este store' });
      }
      
      const { name, category, categoryId, image_url, description, hours, is_active, panelType } = req.body;
      
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (categoryId !== undefined) {
        updateData.categoryId = categoryId || null;
      } else if (category !== undefined) {
        updateData.categoryId = category || null;
      }
      if (image_url !== undefined) updateData.imageUrl = image_url;
      if (description !== undefined) updateData.description = description;
      if (hours !== undefined) updateData.hours = hours;
      if (panelType !== undefined) updateData.panelType = panelType || 'normal';
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
  },

  /**
   * Eliminar un store (solo superadmin)
   */
  async delete(req, res) {
    try {
      const storeId = req.params.id;

      const store = await prisma.store.findUnique({
        where: { id: storeId }
      });

      if (!store) {
        return res.status(404).json({ error: 'Store no encontrado' });
      }

      await prisma.store.delete({
        where: { id: storeId }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting store:', error);
      res.status(500).json({ error: 'Error al eliminar store' });
    }
  }
};

export default storesController;

