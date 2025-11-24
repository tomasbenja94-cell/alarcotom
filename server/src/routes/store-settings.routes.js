import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, authorizeStoreAccess } from '../middlewares/auth.middleware.js';
import { corsMiddleware } from '../middlewares/security.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/store-settings/:storeId - Obtener configuración de tienda
router.get('/:storeId', corsMiddleware, authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    const adminStoreId = req.user.storeId;
    const adminRole = req.user.role;

    // Verificar acceso (solo superadmin o admin de esa tienda)
    if (adminRole !== 'super_admin' && adminStoreId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    let settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    // Si no existe, crear configuración por defecto
    if (!settings) {
      settings = await prisma.storeSettings.create({
        data: {
          storeId,
          deliveryEnabled: true,
          pickupEnabled: true,
          cashEnabled: true,
          transferEnabled: true,
          mercadoPagoEnabled: false
        }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Error fetching store settings:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// PUT /api/store-settings/:storeId - Actualizar configuración de tienda
router.put('/:storeId', corsMiddleware, authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    const adminStoreId = req.user.storeId;
    const adminRole = req.user.role;

    // Verificar acceso
    if (adminRole !== 'super_admin' && adminStoreId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    const {
      address,
      hours,
      deliveryEnabled,
      pickupEnabled,
      cashEnabled,
      transferEnabled,
      transferAlias,
      transferCvu,
      transferTitular,
      mercadoPagoEnabled,
      mercadoPagoToken,
      mercadoPagoKey
    } = req.body;

    // Upsert: actualizar si existe, crear si no existe
    const settings = await prisma.storeSettings.upsert({
      where: { storeId },
      update: {
        address,
        hours,
        deliveryEnabled: deliveryEnabled !== undefined ? deliveryEnabled : true,
        pickupEnabled: pickupEnabled !== undefined ? pickupEnabled : true,
        cashEnabled: cashEnabled !== undefined ? cashEnabled : true,
        transferEnabled: transferEnabled !== undefined ? transferEnabled : true,
        transferAlias,
        transferCvu,
        transferTitular,
        mercadoPagoEnabled: mercadoPagoEnabled !== undefined ? mercadoPagoEnabled : false,
        mercadoPagoToken,
        mercadoPagoKey
      },
      create: {
        storeId,
        address,
        hours,
        deliveryEnabled: deliveryEnabled !== undefined ? deliveryEnabled : true,
        pickupEnabled: pickupEnabled !== undefined ? pickupEnabled : true,
        cashEnabled: cashEnabled !== undefined ? cashEnabled : true,
        transferEnabled: transferEnabled !== undefined ? transferEnabled : true,
        transferAlias,
        transferCvu,
        transferTitular,
        mercadoPagoEnabled: mercadoPagoEnabled !== undefined ? mercadoPagoEnabled : false,
        mercadoPagoToken,
        mercadoPagoKey
      }
    });

    res.json(settings);
  } catch (error) {
    console.error('Error updating store settings:', error);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

// GET /api/store-settings/:storeId/is-empty - Verificar si tienda está vacía
router.get('/:storeId/is-empty', corsMiddleware, authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    const adminStoreId = req.user.storeId;
    const adminRole = req.user.role;

    // Verificar acceso
    if (adminRole !== 'super_admin' && adminStoreId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    // Verificar si tiene categorías
    const categoriesCount = await prisma.category.count({
      where: { storeId }
    });

    // Verificar si tiene productos
    const productsCount = await prisma.product.count({
      where: { storeId }
    });

    // Verificar si tiene configuración
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    const isEmpty = categoriesCount === 0 && productsCount === 0 && !settings?.address;

    res.json({
      isEmpty,
      hasCategories: categoriesCount > 0,
      hasProducts: productsCount > 0,
      hasSettings: !!settings?.address,
      categoriesCount,
      productsCount
    });
  } catch (error) {
    console.error('Error checking if store is empty:', error);
    res.status(500).json({ error: 'Error al verificar tienda' });
  }
});

export default router;

