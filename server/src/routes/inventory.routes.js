import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin } from '../middlewares/auth.middleware.js';
import { generalRateLimit } from '../middlewares/security.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// Agregar stock (entrada)
router.post('/stock/add', authenticateAdmin, generalRateLimit, async (req, res) => {
  try {
    const { productId, quantity, reason, reference, notes } = req.body;
    const userId = req.user?.id;

    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'productId y quantity son obligatorios' });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const previousStock = product.stock || 0;
    const newStock = previousStock + parseFloat(quantity);

    // Actualizar stock del producto
    await prisma.product.update({
      where: { id: productId },
      data: { stock: newStock }
    });

    // Registrar en Kardex
    const kardexEntry = await prisma.kardexEntry.create({
      data: {
        productId,
        storeId: product.storeId,
        type: 'entrada',
        quantity: parseFloat(quantity),
        previousStock,
        newStock,
        reason: reason || 'Carga de stock',
        reference: reference || null,
        userId: userId || null,
        notes: notes || null
      }
    });

    res.json({ success: true, kardexEntry, newStock });
  } catch (error) {
    console.error('Error adding stock:', error);
    res.status(500).json({ error: 'Error al agregar stock', details: error.message });
  }
});

// Ajustar stock (baja)
router.post('/stock/adjust', authenticateAdmin, generalRateLimit, async (req, res) => {
  try {
    const { productId, quantity, reason, notes } = req.body;
    const userId = req.user?.id;

    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'productId y quantity son obligatorios' });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const previousStock = product.stock || 0;
    const newStock = Math.max(0, previousStock - parseFloat(quantity));

    // Actualizar stock del producto
    await prisma.product.update({
      where: { id: productId },
      data: { stock: newStock }
    });

    // Registrar en Kardex
    const kardexEntry = await prisma.kardexEntry.create({
      data: {
        productId,
        storeId: product.storeId,
        type: reason || 'ajuste',
        quantity: -parseFloat(quantity),
        previousStock,
        newStock,
        reason: reason || 'Ajuste de stock',
        userId: userId || null,
        notes: notes || null
      }
    });

    res.json({ success: true, kardexEntry, newStock });
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json({ error: 'Error al ajustar stock', details: error.message });
  }
});

// Obtener entradas de Kardex
router.get('/kardex/entries', authenticateAdmin, generalRateLimit, async (req, res) => {
  try {
    const { storeId, productId, type, dateFrom, dateTo, userId, limit = 100 } = req.query;

    const where = {};
    if (storeId) where.storeId = storeId;
    if (productId) where.productId = productId;
    if (type && type !== 'all') where.type = type;
    if (userId) where.userId = userId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    const entries = await prisma.kardexEntry.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    // Formatear respuesta
    const formatted = entries.map(entry => ({
      ...entry,
      productName: entry.product?.name || 'Producto eliminado'
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching kardex entries:', error);
    res.status(500).json({ error: 'Error al obtener entradas de Kardex', details: error.message });
  }
});

export default router;

