import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin } from '../middlewares/auth.middleware.js';
import { generalRateLimit } from '../middlewares/security.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// Generar número de venta único
async function generateSaleNumber(storeId) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  let counter = 1;
  
  while (true) {
    const saleNumber = `POS-${dateStr}-${String(counter).padStart(4, '0')}`;
    const existing = await prisma.pOSSale.findUnique({
      where: { saleNumber }
    });
    
    if (!existing) {
      return saleNumber;
    }
    counter++;
  }
}

// Crear venta POS
router.post('/sales', authenticateAdmin, generalRateLimit, async (req, res) => {
  try {
    const { storeId, items, subtotal, total, discount, paymentMethod, paymentStatus, cashReceived, change, mpPaymentId, customerName, customerPhone, notes } = req.body;
    const userId = req.user?.id;

    if (!storeId || !items || items.length === 0) {
      return res.status(400).json({ error: 'storeId e items son obligatorios' });
    }

    // Generar número de venta
    const saleNumber = await generateSaleNumber(storeId);

    // Crear venta
    const sale = await prisma.pOSSale.create({
      data: {
        storeId,
        saleNumber,
        subtotal: parseFloat(subtotal) || 0,
        total: parseFloat(total) || 0,
        discount: parseFloat(discount) || 0,
        paymentMethod: paymentMethod || 'cash',
        paymentStatus: paymentStatus || 'completed',
        cashReceived: cashReceived ? parseFloat(cashReceived) : null,
        change: change ? parseFloat(change) : null,
        mpPaymentId: mpPaymentId || null,
        userId: userId || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        notes: notes || null,
        items: {
          create: items.map(item => ({
            productId: item.productId || null,
            productName: item.productName,
            quantity: parseFloat(item.quantity) || 1,
            unitPrice: parseFloat(item.unitPrice) || 0,
            subtotal: parseFloat(item.subtotal) || 0
          }))
        }
      },
      include: {
        items: true
      }
    });

    // Registrar movimientos de Kardex para cada item
    for (const item of items) {
      if (item.productId) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId }
        });

        if (product && product.stock !== undefined && product.stock !== null) {
          const previousStock = product.stock;
          const quantitySold = parseFloat(item.quantity) || 1;
          const newStock = Math.max(0, previousStock - quantitySold);

          // Actualizar stock del producto
          await prisma.product.update({
            where: { id: item.productId },
            data: { stock: newStock }
          });

          // Registrar en Kardex
          await prisma.kardexEntry.create({
            data: {
              productId: item.productId,
              storeId,
              type: 'venta',
              quantity: -quantitySold,
              previousStock,
              newStock,
              unitPrice: parseFloat(item.unitPrice) || 0,
              totalPrice: parseFloat(item.subtotal) || 0,
              reason: 'Venta POS',
              reference: saleNumber,
              posSaleId: sale.id,
              userId: userId || null
            }
          });
        }
      }
    }

    res.json(sale);
  } catch (error) {
    console.error('Error creating POS sale:', error);
    res.status(500).json({ error: 'Error al crear venta POS', details: error.message });
  }
});

// Obtener ventas POS
router.get('/sales', authenticateAdmin, generalRateLimit, async (req, res) => {
  try {
    const { storeId, dateFrom, dateTo, limit = 50 } = req.query;
    const userId = req.user?.id;

    // Verificar que el admin tenga acceso al store
    if (storeId && req.user?.storeId && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a este store' });
    }

    const where = {};
    if (storeId) where.storeId = storeId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    const sales = await prisma.pOSSale.findMany({
      where,
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json(sales);
  } catch (error) {
    console.error('Error fetching POS sales:', error);
    res.status(500).json({ error: 'Error al obtener ventas POS', details: error.message });
  }
});

// Obtener configuración del POS
router.get('/config', authenticateAdmin, generalRateLimit, async (req, res) => {
  try {
    const { storeId } = req.query;
    
    if (!storeId) {
      return res.status(400).json({ error: 'storeId es obligatorio' });
    }

    let config = await prisma.pOSConfig.findUnique({
      where: { storeId }
    });

    // Si no existe, crear configuración por defecto
    if (!config) {
      config = await prisma.pOSConfig.create({
        data: {
          storeId,
          scanSoundEnabled: true,
          cameraScannerEnabled: false,
          defaultPaymentMethod: 'cash',
          autoPrintEnabled: false,
          nightModeEnabled: false
        }
      });
    }

    res.json(config);
  } catch (error) {
    console.error('Error fetching POS config:', error);
    res.status(500).json({ error: 'Error al obtener configuración POS', details: error.message });
  }
});

// Actualizar configuración del POS
router.put('/config', authenticateAdmin, generalRateLimit, async (req, res) => {
  try {
    const { storeId, scanSoundEnabled, cameraScannerEnabled, defaultPaymentMethod, autoPrintEnabled, nightModeEnabled } = req.body;
    
    if (!storeId) {
      return res.status(400).json({ error: 'storeId es obligatorio' });
    }

    const config = await prisma.pOSConfig.upsert({
      where: { storeId },
      update: {
        scanSoundEnabled: scanSoundEnabled !== undefined ? scanSoundEnabled : undefined,
        cameraScannerEnabled: cameraScannerEnabled !== undefined ? cameraScannerEnabled : undefined,
        defaultPaymentMethod: defaultPaymentMethod || undefined,
        autoPrintEnabled: autoPrintEnabled !== undefined ? autoPrintEnabled : undefined,
        nightModeEnabled: nightModeEnabled !== undefined ? nightModeEnabled : undefined
      },
      create: {
        storeId,
        scanSoundEnabled: scanSoundEnabled !== undefined ? scanSoundEnabled : true,
        cameraScannerEnabled: cameraScannerEnabled !== undefined ? cameraScannerEnabled : false,
        defaultPaymentMethod: defaultPaymentMethod || 'cash',
        autoPrintEnabled: autoPrintEnabled !== undefined ? autoPrintEnabled : false,
        nightModeEnabled: nightModeEnabled !== undefined ? nightModeEnabled : false
      }
    });

    res.json(config);
  } catch (error) {
    console.error('Error updating POS config:', error);
    res.status(500).json({ error: 'Error al actualizar configuración POS', details: error.message });
  }
});

export default router;

