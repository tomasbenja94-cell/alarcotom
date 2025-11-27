/**
 * Rutas de cupones (admin)
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/coupons
 * Listar cupones (admin)
 */
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.query;
    
    const where = {};
    if (req.user.role !== 'super_admin') {
      where.storeId = req.user.storeId;
    } else if (storeId) {
      where.storeId = storeId;
    }

    const coupons = await prisma.coupon.findMany({
      where,
      include: {
        store: { select: { name: true } },
        _count: { select: { users: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(coupons);

  } catch (error) {
    console.error('Error listando cupones:', error);
    res.status(500).json({ error: 'Error listando cupones' });
  }
});

/**
 * POST /api/coupons
 * Crear cupón
 */
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      usageLimit,
      userLimit,
      requiredLevel,
      storeId,
      validFrom,
      validUntil
    } = req.body;

    if (!code || !discountType || !discountValue) {
      return res.status(400).json({ error: 'Código, tipo y valor de descuento requeridos' });
    }

    // Verificar que el código no exista
    const existing = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (existing) {
      return res.status(400).json({ error: 'El código ya existe' });
    }

    // Si no es superadmin, solo puede crear para su tienda
    const finalStoreId = req.user.role === 'super_admin' 
      ? (storeId || null) 
      : req.user.storeId;

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        description,
        discountType,
        discountValue: parseFloat(discountValue),
        minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : null,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit) : null,
        userLimit: userLimit ? parseInt(userLimit) : 1,
        requiredLevel: requiredLevel || null,
        storeId: finalStoreId,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validUntil: validUntil ? new Date(validUntil) : null
      }
    });

    res.json(coupon);

  } catch (error) {
    console.error('Error creando cupón:', error);
    res.status(500).json({ error: 'Error creando cupón' });
  }
});

/**
 * PUT /api/coupons/:id
 * Actualizar cupón
 */
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      usageLimit,
      userLimit,
      requiredLevel,
      validUntil,
      isActive
    } = req.body;

    // Verificar permisos
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
      return res.status(404).json({ error: 'Cupón no encontrado' });
    }

    if (req.user.role !== 'super_admin' && coupon.storeId !== req.user.storeId) {
      return res.status(403).json({ error: 'No tienes permiso' });
    }

    const updated = await prisma.coupon.update({
      where: { id },
      data: {
        description,
        discountType,
        discountValue: discountValue ? parseFloat(discountValue) : undefined,
        minOrderAmount: minOrderAmount !== undefined ? parseFloat(minOrderAmount) : undefined,
        maxDiscount: maxDiscount !== undefined ? parseFloat(maxDiscount) : undefined,
        usageLimit: usageLimit !== undefined ? parseInt(usageLimit) : undefined,
        userLimit: userLimit !== undefined ? parseInt(userLimit) : undefined,
        requiredLevel: requiredLevel !== undefined ? requiredLevel : undefined,
        validUntil: validUntil ? new Date(validUntil) : undefined,
        isActive: isActive !== undefined ? isActive : undefined
      }
    });

    res.json(updated);

  } catch (error) {
    console.error('Error actualizando cupón:', error);
    res.status(500).json({ error: 'Error actualizando cupón' });
  }
});

/**
 * DELETE /api/coupons/:id
 * Eliminar cupón
 */
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar permisos
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
      return res.status(404).json({ error: 'Cupón no encontrado' });
    }

    if (req.user.role !== 'super_admin' && coupon.storeId !== req.user.storeId) {
      return res.status(403).json({ error: 'No tienes permiso' });
    }

    await prisma.coupon.delete({ where: { id } });

    res.json({ success: true });

  } catch (error) {
    console.error('Error eliminando cupón:', error);
    res.status(500).json({ error: 'Error eliminando cupón' });
  }
});

/**
 * GET /api/coupons/:id/stats
 * Estadísticas de un cupón
 */
router.get('/:id/stats', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: { select: { name: true, email: true } }
          },
          orderBy: { usedAt: 'desc' },
          take: 20
        }
      }
    });

    if (!coupon) {
      return res.status(404).json({ error: 'Cupón no encontrado' });
    }

    res.json({
      coupon,
      usageCount: coupon.usageCount,
      recentUses: coupon.users
    });

  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

export default router;

