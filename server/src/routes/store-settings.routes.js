import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, authorizeStoreAccess } from '../middlewares/auth.middleware.js';
import { corsMiddleware } from '../middlewares/security.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// Helper function para resolver storeId (puede ser UUID o nombre)
async function resolveStoreId(identifier) {
  // Intentar buscar por ID primero (UUID)
  let store = await prisma.store.findUnique({
    where: { id: identifier }
  });
  
  // Si no se encuentra por ID, intentar buscar por nombre
  if (!store) {
    store = await prisma.store.findFirst({
      where: { 
        name: {
          equals: identifier,
          mode: 'insensitive'
        }
      }
    });
  }
  
  if (!store) {
    return null;
  }
  
  return store.id;
}

// GET /api/store-settings/:storeId/public - Obtener configuración pública (sin auth)
router.get('/:storeId/public', corsMiddleware, async (req, res) => {
  try {
    const identifier = req.params.storeId;
    const storeId = await resolveStoreId(identifier);
    
    if (!storeId) {
      return res.status(404).json({ error: 'Store no encontrado' });
    }

    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    if (!settings) {
      return res.json({ isOpen: true }); // Default: abierto
    }

    // Solo devolver campos públicos (no tokens ni claves)
    res.json({
      commercialName: settings.commercialName,
      shortDescription: settings.shortDescription,
      address: settings.address,
      phone: settings.phone,
      whatsappNumber: settings.whatsappNumber,
      hours: settings.hours,
      deliveryHours: settings.deliveryHours,
      isOpen: settings.isOpen,
      closedMessage: settings.closedMessage,
      deliveryEnabled: settings.deliveryEnabled,
      pickupEnabled: settings.pickupEnabled,
      deliveryPrice: settings.deliveryPrice,
      deliveryTimeMin: settings.deliveryTimeMin,
      deliveryTimeMax: settings.deliveryTimeMax,
      deliveryZoneInfo: settings.deliveryZoneInfo,
      deliveryTempDisabled: settings.deliveryTempDisabled,
      cashEnabled: settings.cashEnabled,
      transferEnabled: settings.transferEnabled,
      transferAlias: settings.transferAlias,
      mercadoPagoEnabled: settings.mercadoPagoEnabled,
      minOrderAmount: settings.minOrderAmount,
      promotionsEnabled: settings.promotionsEnabled
    });
  } catch (error) {
    console.error('Error fetching public store settings:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// GET /api/store-settings/:storeId - Obtener configuración de tienda
router.get('/:storeId', corsMiddleware, authenticateAdmin, async (req, res) => {
  try {
    const identifier = req.params.storeId;
    const resolvedStoreId = await resolveStoreId(identifier);
    
    if (!resolvedStoreId) {
      return res.status(404).json({ error: 'Store no encontrado' });
    }
    
    const adminStoreId = req.user.storeId;
    const adminRole = req.user.role;

    // Verificar acceso (solo superadmin o admin de esa tienda)
    if (adminRole !== 'super_admin' && adminStoreId !== resolvedStoreId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    let settings = await prisma.storeSettings.findUnique({
      where: { storeId: resolvedStoreId }
    });

    // Si no existe, crear configuración por defecto
    if (!settings) {
      settings = await prisma.storeSettings.create({
        data: {
          storeId: resolvedStoreId,
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
    const identifier = req.params.storeId;
    const resolvedStoreId = await resolveStoreId(identifier);
    
    if (!resolvedStoreId) {
      return res.status(404).json({ error: 'Store no encontrado' });
    }
    
    const adminStoreId = req.user.storeId;
    const adminRole = req.user.role;

    // Verificar acceso
    if (adminRole !== 'super_admin' && adminStoreId !== resolvedStoreId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    // Extraer todos los campos del body
    const data = req.body;
    
    // Campos que no deben ser undefined para el upsert
    const settingsData = {
      // Datos básicos
      commercialName: data.commercialName || null,
      logoUrl: data.logoUrl || null,
      shortDescription: data.shortDescription || null,
      longDescription: data.longDescription || null,
      storeType: data.storeType || null,
      address: data.address || null,
      phone: data.phone || null,
      whatsappNumber: data.whatsappNumber || null,
      
      // Horarios y estado
      hours: data.hours || null,
      deliveryHours: data.deliveryHours || null,
      isOpen: data.isOpen !== undefined ? data.isOpen : true,
      closedMessage: data.closedMessage || null,
      
      // Envíos
      deliveryEnabled: data.deliveryEnabled !== undefined ? data.deliveryEnabled : true,
      pickupEnabled: data.pickupEnabled !== undefined ? data.pickupEnabled : true,
      deliveryPrice: data.deliveryPrice !== undefined ? data.deliveryPrice : 0,
      deliveryTimeMin: data.deliveryTimeMin !== undefined ? data.deliveryTimeMin : 30,
      deliveryTimeMax: data.deliveryTimeMax !== undefined ? data.deliveryTimeMax : 45,
      deliveryZoneInfo: data.deliveryZoneInfo || null,
      deliveryTempDisabled: data.deliveryTempDisabled !== undefined ? data.deliveryTempDisabled : false,
      
      // Pagos
      cashEnabled: data.cashEnabled !== undefined ? data.cashEnabled : true,
      transferEnabled: data.transferEnabled !== undefined ? data.transferEnabled : false,
      transferAlias: data.transferAlias || null,
      transferCvu: data.transferCvu || null,
      transferTitular: data.transferTitular || null,
      transferNotes: data.transferNotes || null,
      mercadoPagoEnabled: data.mercadoPagoEnabled !== undefined ? data.mercadoPagoEnabled : false,
      mercadoPagoToken: data.mercadoPagoToken || null,
      mercadoPagoKey: data.mercadoPagoKey || null,
      mercadoPagoLink: data.mercadoPagoLink || null,
      paymentNotes: data.paymentNotes || null,
      
      // Bot WhatsApp
      whatsappBotEnabled: data.whatsappBotEnabled !== undefined ? data.whatsappBotEnabled : false,
      whatsappBotNumber: data.whatsappBotNumber || null,
      welcomeMessage: data.welcomeMessage || null,
      orderConfirmMessage: data.orderConfirmMessage || null,
      orderOnWayMessage: data.orderOnWayMessage || null,
      
      // Otros
      acceptScheduledOrders: data.acceptScheduledOrders !== undefined ? data.acceptScheduledOrders : false,
      promotionsEnabled: data.promotionsEnabled !== undefined ? data.promotionsEnabled : true,
      minOrderAmount: data.minOrderAmount !== undefined ? data.minOrderAmount : null,
      maxOrdersPerHour: data.maxOrdersPerHour !== undefined ? data.maxOrdersPerHour : null,
    };

    // Upsert: actualizar si existe, crear si no existe
    const settings = await prisma.storeSettings.upsert({
      where: { storeId: resolvedStoreId },
      update: settingsData,
      create: { storeId: resolvedStoreId, ...settingsData }
    });

    res.json(settings);
  } catch (error) {
    console.error('Error updating store settings:', error);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

// GET /api/store-settings/:storeId/mercadopago-public - Obtener public key de MP (sin auth, para frontend)
router.get('/:storeId/mercadopago-public', corsMiddleware, async (req, res) => {
  try {
    const identifier = req.params.storeId;
    const storeId = await resolveStoreId(identifier);
    
    if (!storeId) {
      return res.status(404).json({ error: 'Store no encontrado' });
    }

    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    if (!settings || !settings.mercadoPagoEnabled || !settings.mercadoPagoKey) {
      return res.json({ 
        enabled: false,
        publicKey: null 
      });
    }

    // Solo devolver la public key (no el token privado)
    res.json({
      enabled: true,
      publicKey: settings.mercadoPagoKey
    });
  } catch (error) {
    console.error('Error fetching Mercado Pago public key:', error);
    res.status(500).json({ error: 'Error al obtener configuración de Mercado Pago' });
  }
});

// GET /api/store-settings/:storeId/is-empty - Verificar si tienda está vacía
router.get('/:storeId/is-empty', corsMiddleware, authenticateAdmin, async (req, res) => {
  try {
    const identifier = req.params.storeId;
    const resolvedStoreId = await resolveStoreId(identifier);
    
    if (!resolvedStoreId) {
      return res.status(404).json({ error: 'Store no encontrado' });
    }
    
    const adminStoreId = req.user.storeId;
    const adminRole = req.user.role;

    // Verificar acceso
    if (adminRole !== 'super_admin' && adminStoreId !== resolvedStoreId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    // Verificar si tiene categorías
    const categoriesCount = await prisma.category.count({
      where: { storeId: resolvedStoreId }
    });

    // Verificar si tiene productos
    const productsCount = await prisma.product.count({
      where: { storeId: resolvedStoreId }
    });

    // Verificar si tiene configuración
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId: resolvedStoreId }
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

