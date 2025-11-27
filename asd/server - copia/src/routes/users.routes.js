/**
 * Rutas de usuarios - Autenticación, niveles, puntos, cupones
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Cargar variables de entorno desde la raíz del proyecto
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'elbuenmenu-secret-key-2024';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

console.log('[Users] GOOGLE_CLIENT_ID configurado:', !!GOOGLE_CLIENT_ID);

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Puntos por nivel
const LEVEL_THRESHOLDS = {
  bronce: 0,
  plata: 500,
  oro: 2000,
  platino: 5000
};

// Puntos por peso gastado
const POINTS_PER_PESO = 0.1; // 10 puntos por cada $100

/**
 * Calcula el nivel basado en puntos
 */
function calculateLevel(points) {
  if (points >= LEVEL_THRESHOLDS.platino) return 'platino';
  if (points >= LEVEL_THRESHOLDS.oro) return 'oro';
  if (points >= LEVEL_THRESHOLDS.plata) return 'plata';
  return 'bronce';
}

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
 * POST /api/users/auth/google
 * Login con Google
 */
router.post('/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Credential requerido' });
    }

    let email, name, imageUrl, providerId;

    if (googleClient && GOOGLE_CLIENT_ID) {
      // Verificar token con Google
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      
      email = payload.email;
      name = payload.name;
      imageUrl = payload.picture;
      providerId = payload.sub;
    } else {
      // Modo demo sin Google configurado
      return res.status(400).json({ error: 'Google OAuth no configurado' });
    }

    // Buscar o crear usuario
    let user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          imageUrl,
          provider: 'google',
          providerId,
          level: 'bronce',
          points: 0
        }
      });
    } else {
      // Actualizar datos si cambiaron
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name || user.name,
          imageUrl: imageUrl || user.imageUrl
        }
      });
    }

    // Generar token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ user, token });

  } catch (error) {
    console.error('Error en login Google:', error);
    res.status(500).json({ error: 'Error en autenticación' });
  }
});

/**
 * POST /api/users/auth/demo
 * Login demo (para desarrollo)
 */
router.post('/auth/demo', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requerido' });
    }

    // Buscar o crear usuario demo
    let user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || 'Usuario Demo',
          provider: 'demo',
          level: 'bronce',
          points: 100 // Puntos de bienvenida
        }
      });
    }

    // Generar token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ user, token });

  } catch (error) {
    console.error('Error en login demo:', error);
    res.status(500).json({ error: 'Error en autenticación' });
  }
});

/**
 * GET /api/users/me
 * Obtener usuario actual
 */
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        addresses: true,
        _count: {
          select: { orders: true, reviews: true }
        }
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({ error: 'Error obteniendo usuario' });
  }
});

/**
 * PUT /api/users/me
 * Actualizar perfil
 */
router.put('/me', authenticateUser, async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: name || undefined,
        phone: phone || undefined,
        address: address || undefined
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ error: 'Error actualizando usuario' });
  }
});

/**
 * GET /api/users/me/points
 * Obtener puntos y nivel
 */
router.get('/me/points', authenticateUser, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        points: true,
        level: true,
        totalSpent: true,
        totalOrders: true
      }
    });

    const nextLevel = user.level === 'bronce' ? 'plata' : 
                      user.level === 'plata' ? 'oro' : 
                      user.level === 'oro' ? 'platino' : null;
    
    const pointsToNextLevel = nextLevel ? LEVEL_THRESHOLDS[nextLevel] - user.points : 0;

    res.json({
      ...user,
      nextLevel,
      pointsToNextLevel: Math.max(0, pointsToNextLevel),
      levelThresholds: LEVEL_THRESHOLDS
    });
  } catch (error) {
    console.error('Error obteniendo puntos:', error);
    res.status(500).json({ error: 'Error obteniendo puntos' });
  }
});

/**
 * POST /api/users/me/addresses
 * Agregar dirección
 */
router.post('/me/addresses', authenticateUser, async (req, res) => {
  try {
    const { label, street, number, floor, apartment, city, notes, isDefault } = req.body;

    if (!street || !number) {
      return res.status(400).json({ error: 'Calle y número requeridos' });
    }

    // Si es default, quitar default de otras
    if (isDefault) {
      await prisma.userAddress.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }

    const address = await prisma.userAddress.create({
      data: {
        userId: req.user.id,
        label,
        street,
        number,
        floor,
        apartment,
        city,
        notes,
        isDefault: isDefault || false
      }
    });

    res.json(address);
  } catch (error) {
    console.error('Error creando dirección:', error);
    res.status(500).json({ error: 'Error creando dirección' });
  }
});

/**
 * GET /api/users/me/addresses
 * Obtener direcciones
 */
router.get('/me/addresses', authenticateUser, async (req, res) => {
  try {
    const addresses = await prisma.userAddress.findMany({
      where: { userId: req.user.id },
      orderBy: { isDefault: 'desc' }
    });

    res.json(addresses);
  } catch (error) {
    console.error('Error obteniendo direcciones:', error);
    res.status(500).json({ error: 'Error obteniendo direcciones' });
  }
});

/**
 * DELETE /api/users/me/addresses/:id
 * Eliminar dirección
 */
router.delete('/me/addresses/:id', authenticateUser, async (req, res) => {
  try {
    await prisma.userAddress.deleteMany({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando dirección:', error);
    res.status(500).json({ error: 'Error eliminando dirección' });
  }
});

/**
 * GET /api/users/me/coupons
 * Obtener cupones disponibles para el usuario
 */
router.get('/me/coupons', authenticateUser, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { level: true }
    });

    // Cupones usados por el usuario
    const usedCoupons = await prisma.userCoupon.findMany({
      where: { userId: req.user.id },
      select: { couponId: true }
    });
    const usedCouponIds = usedCoupons.map(uc => uc.couponId);

    // Cupones disponibles
    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        OR: [
          { validUntil: null },
          { validUntil: { gte: new Date() } }
        ],
        validFrom: { lte: new Date() },
        OR: [
          { usageLimit: null },
          { usageCount: { lt: prisma.raw('usage_limit') } }
        ]
      },
      include: {
        store: { select: { name: true } }
      }
    });

    // Filtrar por nivel y usos
    const availableCoupons = coupons.filter(coupon => {
      // Verificar nivel requerido
      if (coupon.requiredLevel) {
        const levels = ['bronce', 'plata', 'oro', 'platino'];
        const userLevelIndex = levels.indexOf(user.level);
        const requiredLevelIndex = levels.indexOf(coupon.requiredLevel);
        if (userLevelIndex < requiredLevelIndex) return false;
      }

      // Verificar usos por usuario
      const userUsageCount = usedCoupons.filter(uc => uc.couponId === coupon.id).length;
      if (userUsageCount >= coupon.userLimit) return false;

      return true;
    });

    res.json(availableCoupons);
  } catch (error) {
    console.error('Error obteniendo cupones:', error);
    res.status(500).json({ error: 'Error obteniendo cupones' });
  }
});

/**
 * POST /api/users/coupons/validate
 * Validar un código de cupón
 */
router.post('/coupons/validate', authenticateUser, async (req, res) => {
  try {
    const { code, storeId, orderTotal } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Código requerido' });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (!coupon) {
      return res.status(404).json({ error: 'Cupón no encontrado' });
    }

    if (!coupon.isActive) {
      return res.status(400).json({ error: 'Cupón inactivo' });
    }

    if (coupon.validUntil && new Date() > coupon.validUntil) {
      return res.status(400).json({ error: 'Cupón expirado' });
    }

    if (coupon.storeId && coupon.storeId !== storeId) {
      return res.status(400).json({ error: 'Cupón no válido para este local' });
    }

    if (coupon.minOrderAmount && orderTotal < coupon.minOrderAmount) {
      return res.status(400).json({ 
        error: `Monto mínimo: $${coupon.minOrderAmount.toLocaleString()}` 
      });
    }

    // Verificar usos
    const userUsage = await prisma.userCoupon.count({
      where: { userId: req.user.id, couponId: coupon.id }
    });

    if (userUsage >= coupon.userLimit) {
      return res.status(400).json({ error: 'Ya usaste este cupón' });
    }

    // Calcular descuento
    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = (orderTotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      discount = coupon.discountValue;
    }

    res.json({
      valid: true,
      coupon,
      discount: Math.round(discount)
    });

  } catch (error) {
    console.error('Error validando cupón:', error);
    res.status(500).json({ error: 'Error validando cupón' });
  }
});

/**
 * Función para agregar puntos a un usuario después de un pedido
 */
export async function addPointsForOrder(userId, orderTotal) {
  try {
    const pointsToAdd = Math.floor(orderTotal * POINTS_PER_PESO);
    
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        points: { increment: pointsToAdd },
        totalSpent: { increment: orderTotal },
        totalOrders: { increment: 1 }
      }
    });

    // Verificar si sube de nivel
    const newLevel = calculateLevel(user.points);
    if (newLevel !== user.level) {
      await prisma.user.update({
        where: { id: userId },
        data: { level: newLevel }
      });
    }

    return { pointsAdded: pointsToAdd, newLevel };
  } catch (error) {
    console.error('Error agregando puntos:', error);
    return null;
  }
}

export default router;
