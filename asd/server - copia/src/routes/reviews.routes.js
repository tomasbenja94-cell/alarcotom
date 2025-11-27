/**
 * Rutas de reseñas
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'elbuenmenu-secret-key-2024';

/**
 * Middleware de autenticación de usuario
 */
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

/**
 * POST /api/reviews
 * Crear una reseña para un pedido
 */
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { orderId, rating, comment } = req.body;

    if (!orderId || !rating) {
      return res.status(400).json({ error: 'orderId y rating requeridos' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating debe ser entre 1 y 5' });
    }

    // Verificar que el pedido existe y pertenece al usuario
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (order.userId !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para reseñar este pedido' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ error: 'Solo puedes reseñar pedidos entregados' });
    }

    // Verificar que no exista reseña
    const existingReview = await prisma.review.findUnique({
      where: { orderId }
    });

    if (existingReview) {
      return res.status(400).json({ error: 'Ya existe una reseña para este pedido' });
    }

    // Crear reseña
    const review = await prisma.review.create({
      data: {
        userId: req.user.id,
        orderId,
        storeId: order.storeId,
        rating,
        comment: comment || null
      }
    });

    res.json(review);

  } catch (error) {
    console.error('Error creando reseña:', error);
    res.status(500).json({ error: 'Error creando reseña' });
  }
});

/**
 * GET /api/reviews/store/:storeId
 * Obtener reseñas de un local
 */
router.get('/store/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    const reviews = await prisma.review.findMany({
      where: {
        storeId,
        isPublic: true
      },
      include: {
        user: {
          select: { name: true, imageUrl: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    // Calcular promedio
    const stats = await prisma.review.aggregate({
      where: { storeId, isPublic: true },
      _avg: { rating: true },
      _count: true
    });

    res.json({
      reviews,
      averageRating: stats._avg.rating || 0,
      totalReviews: stats._count
    });

  } catch (error) {
    console.error('Error obteniendo reseñas:', error);
    res.status(500).json({ error: 'Error obteniendo reseñas' });
  }
});

/**
 * GET /api/reviews/pending
 * Obtener pedidos pendientes de reseña del usuario
 */
router.get('/pending', authenticateUser, async (req, res) => {
  try {
    // Pedidos entregados sin reseña
    const orders = await prisma.order.findMany({
      where: {
        userId: req.user.id,
        status: 'delivered',
        review: null
      },
      include: {
        store: { select: { name: true, imageUrl: true } },
        items: { take: 3 }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    res.json(orders);

  } catch (error) {
    console.error('Error obteniendo pedidos pendientes:', error);
    res.status(500).json({ error: 'Error obteniendo pedidos' });
  }
});

/**
 * GET /api/reviews/my
 * Obtener mis reseñas
 */
router.get('/my', authenticateUser, async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { userId: req.user.id },
      include: {
        store: { select: { name: true, imageUrl: true } },
        order: { select: { orderNumber: true, total: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(reviews);

  } catch (error) {
    console.error('Error obteniendo mis reseñas:', error);
    res.status(500).json({ error: 'Error obteniendo reseñas' });
  }
});

export default router;

