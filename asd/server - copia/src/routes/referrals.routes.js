/**
 * Rutas para sistema de referidos por tienda
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Genera un código de referido único
 */
function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * GET /api/referrals/:storeId/my-code
 * Obtiene o genera el código de referido de un usuario para una tienda
 */
router.get('/:storeId/my-code', async (req, res) => {
  try {
    const { storeId } = req.params;
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ error: 'Se requiere número de teléfono' });
    }

    // Buscar si ya tiene un código para esta tienda
    let referral = await prisma.referral.findFirst({
      where: {
        storeId,
        referrerId: phone,
        referrerCode: { not: null }
      }
    });

    let code;
    if (referral?.referrerCode) {
      code = referral.referrerCode;
    } else {
      // Generar nuevo código único
      code = generateReferralCode();
      
      // Verificar que no exista
      let exists = await prisma.referral.findFirst({
        where: { storeId, referrerCode: code }
      });
      
      while (exists) {
        code = generateReferralCode();
        exists = await prisma.referral.findFirst({
          where: { storeId, referrerCode: code }
        });
      }

      // Crear registro de referido (el referrerId es el que invita)
      await prisma.referral.create({
        data: {
          storeId,
          referrerId: phone,
          referrerCode: code,
          referredId: 'placeholder', // Se actualizará cuando alguien use el código
          status: 'active'
        }
      });
    }

    // Obtener info de la tienda
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, slug: true }
    });

    const baseUrl = process.env.STORE_FRONT_URL || 'https://elbuenmenu.site';
    const referralLink = `${baseUrl}/menu?store=${store?.slug || storeId}&ref=${code}`;

    res.json({
      code,
      link: referralLink,
      storeName: store?.name || 'Tienda'
    });

  } catch (error) {
    console.error('Error obteniendo código de referido:', error);
    res.status(500).json({ error: 'Error obteniendo código' });
  }
});

/**
 * POST /api/referrals/:storeId/register
 * Registra un nuevo referido cuando alguien usa un código
 */
router.post('/:storeId/register', async (req, res) => {
  try {
    const { storeId } = req.params;
    const { code, referredPhone } = req.body;

    if (!code || !referredPhone) {
      return res.status(400).json({ error: 'Se requiere código y teléfono del referido' });
    }

    // Buscar el código de referido
    const referrerRecord = await prisma.referral.findFirst({
      where: {
        storeId,
        referrerCode: code,
        status: 'active'
      }
    });

    if (!referrerRecord) {
      return res.status(404).json({ error: 'Código de referido no válido' });
    }

    // Verificar que no se refiera a sí mismo
    if (referrerRecord.referrerId === referredPhone) {
      return res.status(400).json({ error: 'No podés usar tu propio código' });
    }

    // Verificar que el referido no haya sido referido antes en esta tienda
    const existingReferral = await prisma.referral.findFirst({
      where: {
        storeId,
        referredPhone,
        status: { in: ['pending', 'validated'] }
      }
    });

    if (existingReferral) {
      return res.status(400).json({ error: 'Ya fuiste referido en esta tienda' });
    }

    // Crear el registro de referido pendiente
    const newReferral = await prisma.referral.create({
      data: {
        storeId,
        referrerId: referrerRecord.referrerId,
        referrerCode: code,
        referredId: referredPhone,
        referredPhone,
        status: 'pending'
      }
    });

    res.json({
      success: true,
      message: 'Referido registrado. Se validará cuando hagas tu primer pedido.',
      referralId: newReferral.id
    });

  } catch (error) {
    console.error('Error registrando referido:', error);
    res.status(500).json({ error: 'Error registrando referido' });
  }
});

/**
 * GET /api/referrals/:storeId/stats
 * Obtiene estadísticas de referidos de un usuario
 */
router.get('/:storeId/stats', async (req, res) => {
  try {
    const { storeId } = req.params;
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ error: 'Se requiere número de teléfono' });
    }

    // Obtener referidos hechos por este usuario
    const referrals = await prisma.referral.findMany({
      where: {
        storeId,
        referrerId: phone,
        referredId: { not: 'placeholder' }
      },
      orderBy: { createdAt: 'desc' }
    });

    const stats = {
      total: referrals.length,
      pending: referrals.filter(r => r.status === 'pending').length,
      validated: referrals.filter(r => r.status === 'validated').length,
      pointsEarned: referrals.reduce((sum, r) => sum + (r.pointsAwarded || 0), 0),
      referrals: referrals.map(r => ({
        id: r.id,
        referredPhone: r.referredPhone ? `${r.referredPhone.slice(0, 4)}****${r.referredPhone.slice(-2)}` : 'Anónimo',
        status: r.status,
        pointsAwarded: r.pointsAwarded,
        createdAt: r.createdAt,
        validatedAt: r.validatedAt
      }))
    };

    res.json(stats);

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

/**
 * POST /api/referrals/:storeId/validate
 * Valida un referido cuando el referido hace su primer pedido
 * (Llamado internamente cuando se crea un pedido)
 */
router.post('/:storeId/validate', async (req, res) => {
  try {
    const { storeId } = req.params;
    const { referredPhone, orderId } = req.body;

    if (!referredPhone) {
      return res.status(400).json({ error: 'Se requiere teléfono del referido' });
    }

    // Buscar referido pendiente
    const pendingReferral = await prisma.referral.findFirst({
      where: {
        storeId,
        referredPhone,
        status: 'pending'
      }
    });

    if (!pendingReferral) {
      return res.json({ validated: false, message: 'No hay referido pendiente' });
    }

    // Obtener configuración de puntos por referido
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });
    const pointsPerReferral = 100; // Puntos por defecto

    // Validar el referido
    await prisma.referral.update({
      where: { id: pendingReferral.id },
      data: {
        status: 'validated',
        validatedAt: new Date(),
        validationOrderId: orderId,
        pointsAwarded: pointsPerReferral
      }
    });

    res.json({
      validated: true,
      pointsAwarded: pointsPerReferral,
      referrerId: pendingReferral.referrerId
    });

  } catch (error) {
    console.error('Error validando referido:', error);
    res.status(500).json({ error: 'Error validando referido' });
  }
});

export default router;

