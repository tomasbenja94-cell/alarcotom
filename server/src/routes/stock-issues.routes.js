import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const router = express.Router();

const prisma = new PrismaClient();

// Generar token único
const generateToken = () => crypto.randomBytes(32).toString('hex');

// Middleware de autenticación (simplificado)
const authenticateAdmin = (req, res, next) => {
  // TODO: Implementar autenticación real
  next();
};

// ============================================
// ENDPOINTS PARA EL PANEL DEL LOCAL
// ============================================

// POST /api/stock-issues - Marcar productos sin stock en un pedido
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { orderId, missingItemIds } = req.body;

    if (!orderId || !missingItemIds || !Array.isArray(missingItemIds) || missingItemIds.length === 0) {
      return res.status(400).json({ error: 'orderId y missingItemIds son requeridos' });
    }

    // Obtener el pedido con sus items
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, store: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    // Verificar que los items existen en el pedido
    const missingItems = order.items.filter(item => missingItemIds.includes(item.id));
    if (missingItems.length === 0) {
      return res.status(400).json({ error: 'No se encontraron items válidos' });
    }

    // Crear el token único
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

    // Crear el registro de stock issue
    const stockIssue = await prisma.stockIssue.create({
      data: {
        orderId,
        token,
        status: 'pending',
        missingItems: JSON.stringify(missingItems.map(item => ({
          itemId: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal
        }))),
        expiresAt
      }
    });

    // Actualizar el estado del pedido
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'stock_issue' }
    });

    // Marcar los items como sin stock
    await prisma.orderItem.updateMany({
      where: { id: { in: missingItemIds } },
      data: { stockStatus: 'out_of_stock' }
    });

    // Actualizar historial de productos sin stock
    for (const item of missingItems) {
      if (item.productId) {
        await prisma.productStockHistory.upsert({
          where: { productId: item.productId },
          create: {
            productId: item.productId,
            storeId: order.storeId,
            outOfStockCount: 1,
            lastMarkedAt: new Date()
          },
          update: {
            outOfStockCount: { increment: 1 },
            lastMarkedAt: new Date()
          }
        });

        // Si se marcó sin stock 3+ veces, ocultar automáticamente
        const history = await prisma.productStockHistory.findUnique({
          where: { productId: item.productId }
        });
        
        if (history && history.outOfStockCount >= 3 && !history.autoHidden) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { isAvailable: false }
          });
          await prisma.productStockHistory.update({
            where: { productId: item.productId },
            data: { autoHidden: true }
          });
        }
      }
    }

    // Generar link para el cliente
    const clientLink = `${process.env.FRONTEND_URL || 'https://elbuenmenu.site'}/stock-issue/${token}`;

    // TODO: Enviar WhatsApp al cliente
    // await sendWhatsAppStockNotification(order.customerPhone, order.orderNumber, missingItems, clientLink);

    res.json({
      success: true,
      stockIssue: {
        id: stockIssue.id,
        token: stockIssue.token,
        expiresAt: stockIssue.expiresAt,
        clientLink
      },
      message: 'Productos marcados sin stock. Se notificará al cliente.'
    });

  } catch (error) {
    console.error('Error creating stock issue:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// GET /api/stock-issues/order/:orderId - Obtener issues de un pedido
router.get('/order/:orderId', authenticateAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const issues = await prisma.stockIssue.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(issues.map(issue => ({
      ...issue,
      missingItems: JSON.parse(issue.missingItems || '[]'),
      customerChoices: issue.customerChoices ? JSON.parse(issue.customerChoices) : null
    })));

  } catch (error) {
    console.error('Error fetching stock issues:', error);
    res.status(500).json({ error: 'Error al obtener issues' });
  }
});

// ============================================
// ENDPOINTS PARA EL CLIENTE
// ============================================

// GET /api/stock-issues/resolve/:token - Obtener datos del issue para el cliente
router.get('/resolve/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const stockIssue = await prisma.stockIssue.findUnique({
      where: { token },
      include: {
        order: {
          include: {
            items: true,
            store: {
              include: {
                products: {
                  where: { isAvailable: true },
                  include: { category: true }
                }
              }
            }
          }
        }
      }
    });

    if (!stockIssue) {
      return res.status(404).json({ error: 'Link inválido o expirado' });
    }

    // Verificar si ya expiró
    const now = new Date();
    const timeRemaining = Math.max(0, Math.floor((stockIssue.expiresAt.getTime() - now.getTime()) / 1000));

    if (stockIssue.status !== 'pending') {
      return res.json({
        expired: true,
        status: stockIssue.status,
        message: stockIssue.status === 'timeout' 
          ? 'El tiempo para responder ha expirado. El pedido fue cancelado.'
          : stockIssue.status === 'resolved'
            ? 'Ya respondiste a esta solicitud.'
            : 'Esta solicitud ya no está disponible.'
      });
    }

    if (timeRemaining <= 0) {
      // Marcar como timeout
      await handleTimeout(stockIssue.id);
      return res.json({
        expired: true,
        status: 'timeout',
        message: 'El tiempo para responder ha expirado. El pedido fue cancelado.'
      });
    }

    const missingItems = JSON.parse(stockIssue.missingItems || '[]');

    // Agrupar productos del local por categoría para sugerencias
    const productsByCategory = {};
    if (stockIssue.order.store?.products) {
      for (const product of stockIssue.order.store.products) {
        const catId = product.categoryId || 'otros';
        if (!productsByCategory[catId]) {
          productsByCategory[catId] = {
            categoryName: product.category?.name || 'Otros',
            products: []
          };
        }
        productsByCategory[catId].products.push({
          id: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl
        });
      }
    }

    res.json({
      expired: false,
      timeRemaining,
      order: {
        id: stockIssue.order.id,
        orderNumber: stockIssue.order.orderNumber,
        customerName: stockIssue.order.customerName,
        total: stockIssue.order.total,
        paymentMethod: stockIssue.order.paymentMethod,
        items: stockIssue.order.items.map(item => ({
          id: item.id,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          stockStatus: item.stockStatus
        }))
      },
      missingItems,
      storeName: stockIssue.order.store?.name,
      productsByCategory
    });

  } catch (error) {
    console.error('Error fetching stock issue for client:', error);
    res.status(500).json({ error: 'Error al cargar la información' });
  }
});

// POST /api/stock-issues/resolve/:token - Cliente responde a los faltantes
router.post('/resolve/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { choices } = req.body;
    // choices: [{ itemId, action: 'replace'|'remove'|'cancel_all', replacementProductId?, replacementProductName?, replacementPrice? }]

    const stockIssue = await prisma.stockIssue.findUnique({
      where: { token },
      include: { order: { include: { items: true } } }
    });

    if (!stockIssue) {
      return res.status(404).json({ error: 'Link inválido' });
    }

    if (stockIssue.status !== 'pending') {
      return res.status(400).json({ error: 'Esta solicitud ya fue procesada' });
    }

    // Verificar si expiró
    if (new Date() > stockIssue.expiresAt) {
      await handleTimeout(stockIssue.id);
      return res.status(400).json({ error: 'El tiempo para responder ha expirado' });
    }

    // Verificar si el cliente quiere cancelar todo
    const cancelAll = choices.some(c => c.action === 'cancel_all');

    if (cancelAll) {
      // Cancelar pedido completo
      await prisma.order.update({
        where: { id: stockIssue.orderId },
        data: { status: 'cancelled' }
      });

      const refundRequired = stockIssue.order.paymentMethod !== 'efectivo' && 
                            stockIssue.order.paymentStatus === 'paid';

      await prisma.stockIssue.update({
        where: { id: stockIssue.id },
        data: {
          status: 'resolved',
          customerChoices: JSON.stringify(choices),
          resolvedAt: new Date(),
          refundRequired,
          refundAmount: refundRequired ? stockIssue.order.total : null,
          refundStatus: refundRequired ? 'pending' : null
        }
      });

      return res.json({
        success: true,
        action: 'cancelled',
        message: 'Pedido cancelado. ' + (refundRequired ? 'Se procesará la devolución del dinero.' : ''),
        refundRequired
      });
    }

    // Procesar cada elección
    let newTotal = stockIssue.order.total;
    const missingItems = JSON.parse(stockIssue.missingItems || '[]');

    for (const choice of choices) {
      const missingItem = missingItems.find(m => m.itemId === choice.itemId);
      if (!missingItem) continue;

      if (choice.action === 'remove') {
        // Eliminar item del pedido
        newTotal -= missingItem.subtotal;
        
        await prisma.orderItem.update({
          where: { id: choice.itemId },
          data: { stockStatus: 'removed' }
        });

      } else if (choice.action === 'replace' && choice.replacementProductId) {
        // Reemplazar con otro producto
        const newSubtotal = choice.replacementPrice * missingItem.quantity;
        const priceDiff = newSubtotal - missingItem.subtotal;
        newTotal += priceDiff;

        await prisma.orderItem.update({
          where: { id: choice.itemId },
          data: {
            stockStatus: 'replaced',
            replacedWithId: choice.replacementProductId,
            replacedWithName: choice.replacementProductName,
            replacedWithPrice: choice.replacementPrice
          }
        });
      }
    }

    // Actualizar total del pedido
    await prisma.order.update({
      where: { id: stockIssue.orderId },
      data: {
        total: Math.max(0, newTotal),
        status: 'confirmed' // Volver a estado confirmado
      }
    });

    // Marcar issue como resuelto
    await prisma.stockIssue.update({
      where: { id: stockIssue.id },
      data: {
        status: 'resolved',
        customerChoices: JSON.stringify(choices),
        resolvedAt: new Date()
      }
    });

    res.json({
      success: true,
      action: 'modified',
      newTotal: Math.max(0, newTotal),
      message: 'Pedido actualizado correctamente. Continuamos con la preparación.'
    });

  } catch (error) {
    console.error('Error resolving stock issue:', error);
    res.status(500).json({ error: 'Error al procesar la respuesta' });
  }
});

// Función para manejar timeout
async function handleTimeout(stockIssueId) {
  try {
    const stockIssue = await prisma.stockIssue.findUnique({
      where: { id: stockIssueId },
      include: { order: true }
    });

    if (!stockIssue || stockIssue.status !== 'pending') return;

    const refundRequired = stockIssue.order.paymentMethod !== 'efectivo' && 
                          stockIssue.order.paymentStatus === 'paid';

    // Actualizar stock issue
    await prisma.stockIssue.update({
      where: { id: stockIssueId },
      data: {
        status: 'timeout',
        resolvedAt: new Date(),
        refundRequired,
        refundAmount: refundRequired ? stockIssue.order.total : null,
        refundStatus: refundRequired ? 'pending' : null
      }
    });

    // Cancelar pedido
    await prisma.order.update({
      where: { id: stockIssue.orderId },
      data: { status: 'stock_timeout' }
    });

    // TODO: Enviar notificaciones
    // await sendWhatsAppTimeoutNotification(stockIssue.order.customerPhone, stockIssue.order.orderNumber);
    // await notifyStoreTimeout(stockIssue.order.storeId, stockIssue.order.orderNumber);

  } catch (error) {
    console.error('Error handling timeout:', error);
  }
}

// Cron job para verificar timeouts (llamar cada minuto)
router.post('/check-timeouts', async (req, res) => {
  try {
    const expiredIssues = await prisma.stockIssue.findMany({
      where: {
        status: 'pending',
        expiresAt: { lt: new Date() }
      }
    });

    for (const issue of expiredIssues) {
      await handleTimeout(issue.id);
    }

    res.json({ processed: expiredIssues.length });

  } catch (error) {
    console.error('Error checking timeouts:', error);
    res.status(500).json({ error: 'Error al verificar timeouts' });
  }
});

// GET /api/stock-issues/product-history/:productId - Historial de un producto
router.get('/product-history/:productId', authenticateAdmin, async (req, res) => {
  try {
    const { productId } = req.params;
    
    const history = await prisma.productStockHistory.findUnique({
      where: { productId }
    });

    res.json(history || { outOfStockCount: 0, autoHidden: false });

  } catch (error) {
    console.error('Error fetching product history:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// POST /api/stock-issues/reactivate-product/:productId - Reactivar producto oculto
router.post('/reactivate-product/:productId', authenticateAdmin, async (req, res) => {
  try {
    const { productId } = req.params;

    await prisma.product.update({
      where: { id: productId },
      data: { isAvailable: true }
    });

    await prisma.productStockHistory.update({
      where: { productId },
      data: { 
        outOfStockCount: 0,
        autoHidden: false 
      }
    });

    res.json({ success: true, message: 'Producto reactivado' });

  } catch (error) {
    console.error('Error reactivating product:', error);
    res.status(500).json({ error: 'Error al reactivar producto' });
  }
});

export default router;

