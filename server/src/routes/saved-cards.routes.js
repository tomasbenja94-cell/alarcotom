import express from 'express';
import { PrismaClient } from '@prisma/client';
import { generalRateLimit } from '../middlewares/security.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// Obtener tarjetas guardadas de un cliente
router.get('/', generalRateLimit, async (req, res) => {
  try {
    const { userId, customerPhone } = req.query;

    if (!userId && !customerPhone) {
      return res.status(400).json({ error: 'userId o customerPhone es obligatorio' });
    }

    const where = {};
    if (userId) where.userId = userId;
    if (customerPhone) where.customerPhone = customerPhone;

    const cards = await prisma.savedCard.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    res.json(cards);
  } catch (error) {
    console.error('Error fetching saved cards:', error);
    res.status(500).json({ error: 'Error al obtener tarjetas guardadas', details: error.message });
  }
});

// Guardar nueva tarjeta
router.post('/', generalRateLimit, async (req, res) => {
  try {
    const { userId, customerPhone, cardToken, lastFourDigits, cardHolderName, expirationMonth, expirationYear, cardType, isDefault } = req.body;

    if (!cardToken || !lastFourDigits || !cardHolderName || !expirationMonth || !expirationYear) {
      return res.status(400).json({ error: 'Datos de tarjeta incompletos' });
    }

    // Verificar límite de 3 tarjetas
    const where = {};
    if (userId) where.userId = userId;
    if (customerPhone) where.customerPhone = customerPhone;

    const existingCards = await prisma.savedCard.findMany({ where });
    
    if (existingCards.length >= 3) {
      return res.status(400).json({ error: 'Máximo 3 tarjetas guardadas por cliente' });
    }

    // Si es la primera tarjeta o se marca como default, quitar default de otras
    if (isDefault || existingCards.length === 0) {
      await prisma.savedCard.updateMany({
        where: { ...where, isDefault: true },
        data: { isDefault: false }
      });
    }

    const card = await prisma.savedCard.create({
      data: {
        userId: userId || null,
        customerPhone: customerPhone || null,
        cardToken,
        lastFourDigits,
        cardHolderName,
        expirationMonth,
        expirationYear,
        cardType: cardType || null,
        isDefault: isDefault || existingCards.length === 0
      }
    });

    res.json(card);
  } catch (error) {
    console.error('Error saving card:', error);
    res.status(500).json({ error: 'Error al guardar tarjeta', details: error.message });
  }
});

// Eliminar tarjeta
router.delete('/:id', generalRateLimit, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.savedCard.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting card:', error);
    res.status(500).json({ error: 'Error al eliminar tarjeta', details: error.message });
  }
});

// Marcar tarjeta como default
router.put('/:id/default', generalRateLimit, async (req, res) => {
  try {
    const { id } = req.params;
    const card = await prisma.savedCard.findUnique({ where: { id } });

    if (!card) {
      return res.status(404).json({ error: 'Tarjeta no encontrada' });
    }

    // Quitar default de otras tarjetas del mismo cliente
    const where = {};
    if (card.userId) where.userId = card.userId;
    if (card.customerPhone) where.customerPhone = card.customerPhone;

    await prisma.savedCard.updateMany({
      where: { ...where, isDefault: true },
      data: { isDefault: false }
    });

    // Marcar esta como default
    const updated = await prisma.savedCard.update({
      where: { id },
      data: { isDefault: true }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error setting default card:', error);
    res.status(500).json({ error: 'Error al marcar tarjeta como default', details: error.message });
  }
});

export default router;

