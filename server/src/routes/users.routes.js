import express from 'express';
import { PrismaClient } from '@prisma/client';
import { corsMiddleware } from '../middlewares/security.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/users/auth/google - Login/Registro con Google
router.post('/auth/google', corsMiddleware, async (req, res) => {
  try {
    const { idToken, email, name, imageUrl } = req.body;

    if (!idToken || !email) {
      return res.status(400).json({ error: 'idToken y email son requeridos' });
    }

    // Buscar usuario existente
    let user = await prisma.user.findUnique({
      where: { email }
    });

    // Si no existe, crear nuevo usuario
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || null,
          provider: 'google',
          providerId: idToken, // En producción, verificar el token y extraer el ID real
          imageUrl: imageUrl || null
        }
      });
    } else {
      // Actualizar datos si cambió
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name || user.name,
          imageUrl: imageUrl || user.imageUrl
        }
      });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        address: user.address,
        imageUrl: user.imageUrl
      }
    });
  } catch (error) {
    console.error('Error in Google auth:', error);
    res.status(500).json({ error: 'Error en autenticación con Google' });
  }
});

// POST /api/users/auth/apple - Login/Registro con Apple
router.post('/auth/apple', corsMiddleware, async (req, res) => {
  try {
    const { identityToken, email, name } = req.body;

    if (!identityToken || !email) {
      return res.status(400).json({ error: 'identityToken y email son requeridos' });
    }

    // Buscar usuario existente
    let user = await prisma.user.findUnique({
      where: { email }
    });

    // Si no existe, crear nuevo usuario
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || null,
          provider: 'apple',
          providerId: identityToken // En producción, verificar el token y extraer el ID real
        }
      });
    } else {
      // Actualizar datos si cambió
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name || user.name
        }
      });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        address: user.address,
        imageUrl: user.imageUrl
      }
    });
  } catch (error) {
    console.error('Error in Apple auth:', error);
    res.status(500).json({ error: 'Error en autenticación con Apple' });
  }
});

// GET /api/users/:userId/orders - Obtener pedidos del usuario
router.get('/:userId/orders', corsMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            category: true,
            imageUrl: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                imageUrl: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(orders);
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// PUT /api/users/:userId - Actualizar perfil de usuario
router.put('/:userId', corsMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, phone, address } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(address && { address })
      }
    });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      address: user.address,
      imageUrl: user.imageUrl
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

export default router;

