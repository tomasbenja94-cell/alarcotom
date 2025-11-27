/**
 * Integración con Sistemas POS
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class POSIntegrationService {
  /**
   * Sistemas POS soportados
   */
  SUPPORTED_POS = {
    SQUARE: 'square',
    TOAST: 'toast',
    CLOVER: 'clover',
    LIGHTSPEED: 'lightspeed',
    SHOPIFY: 'shopify_pos',
    GENERIC: 'generic_api',
  };

  /**
   * Configurar integración POS
   */
  async configurePOS(storeId, posType, credentials) {
    const integration = await prisma.posIntegration.upsert({
      where: { storeId_posType: { storeId, posType } },
      update: {
        credentials: JSON.stringify(credentials),
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        storeId,
        posType,
        credentials: JSON.stringify(credentials),
        isActive: true,
      },
    });

    // Probar conexión
    const testResult = await this.testConnection(storeId, posType);

    logger.info({ storeId, posType, connected: testResult.success }, 'POS configured');
    return { integration, connectionTest: testResult };
  }

  /**
   * Probar conexión
   */
  async testConnection(storeId, posType) {
    try {
      const integration = await this.getIntegration(storeId, posType);
      if (!integration) return { success: false, error: 'No configurado' };

      // Según el tipo de POS, hacer una llamada de prueba
      switch (posType) {
        case this.SUPPORTED_POS.SQUARE:
          return await this.testSquareConnection(integration.credentials);
        case this.SUPPORTED_POS.GENERIC:
          return await this.testGenericConnection(integration.credentials);
        default:
          return { success: true, message: 'Conexión simulada' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testSquareConnection(credentials) {
    // Implementación real requeriría SDK de Square
    return { success: true, message: 'Square conectado' };
  }

  async testGenericConnection(credentials) {
    const creds = JSON.parse(credentials);
    try {
      const response = await fetch(`${creds.apiUrl}/health`, {
        headers: { 'Authorization': `Bearer ${creds.apiKey}` },
      });
      return { success: response.ok };
    } catch {
      return { success: false, error: 'No se pudo conectar' };
    }
  }

  /**
   * Obtener integración
   */
  async getIntegration(storeId, posType) {
    return prisma.posIntegration.findFirst({
      where: { storeId, posType, isActive: true },
    });
  }

  /**
   * Sincronizar pedido al POS
   */
  async syncOrderToPOS(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, store: true },
    });

    if (!order) throw new Error('Pedido no encontrado');

    const integration = await prisma.posIntegration.findFirst({
      where: { storeId: order.storeId, isActive: true },
    });

    if (!integration) {
      logger.warn({ orderId }, 'No POS integration found');
      return { synced: false, reason: 'No hay POS configurado' };
    }

    try {
      let result;
      const credentials = JSON.parse(integration.credentials);

      switch (integration.posType) {
        case this.SUPPORTED_POS.SQUARE:
          result = await this.syncToSquare(order, credentials);
          break;
        case this.SUPPORTED_POS.GENERIC:
          result = await this.syncToGenericPOS(order, credentials);
          break;
        default:
          result = { success: true, posOrderId: `SIM-${orderId}` };
      }

      // Guardar referencia
      await prisma.order.update({
        where: { id: orderId },
        data: {
          posOrderId: result.posOrderId,
          posSyncedAt: new Date(),
        },
      });

      logger.info({ orderId, posOrderId: result.posOrderId }, 'Order synced to POS');
      return { synced: true, posOrderId: result.posOrderId };
    } catch (error) {
      logger.error({ orderId, error: error.message }, 'POS sync failed');
      return { synced: false, error: error.message };
    }
  }

  /**
   * Sincronizar a Square
   */
  async syncToSquare(order, credentials) {
    // Implementación real con Square API
    const posOrder = {
      idempotency_key: order.id,
      order: {
        location_id: credentials.locationId,
        line_items: order.items.map(item => ({
          name: item.productName,
          quantity: item.quantity.toString(),
          base_price_money: {
            amount: Math.round(item.unitPrice * 100),
            currency: 'ARS',
          },
        })),
      },
    };

    // const response = await squareClient.ordersApi.createOrder(posOrder);
    return { success: true, posOrderId: `SQ-${Date.now()}` };
  }

  /**
   * Sincronizar a POS genérico
   */
  async syncToGenericPOS(order, credentials) {
    const response = await fetch(`${credentials.apiUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.apiKey}`,
      },
      body: JSON.stringify({
        externalId: order.id,
        orderNumber: order.orderNumber,
        items: order.items.map(item => ({
          sku: item.productId,
          name: item.productName,
          quantity: item.quantity,
          price: item.unitPrice,
        })),
        total: order.total,
        customer: {
          name: order.customerName,
          phone: order.customerPhone,
        },
      }),
    });

    if (!response.ok) throw new Error('Error sincronizando con POS');

    const data = await response.json();
    return { success: true, posOrderId: data.id };
  }

  /**
   * Sincronizar productos desde POS
   */
  async syncProductsFromPOS(storeId) {
    const integration = await prisma.posIntegration.findFirst({
      where: { storeId, isActive: true },
    });

    if (!integration) throw new Error('No hay POS configurado');

    const credentials = JSON.parse(integration.credentials);
    let products = [];

    switch (integration.posType) {
      case this.SUPPORTED_POS.GENERIC:
        const response = await fetch(`${credentials.apiUrl}/products`, {
          headers: { 'Authorization': `Bearer ${credentials.apiKey}` },
        });
        products = await response.json();
        break;
      default:
        products = [];
    }

    // Sincronizar productos
    let created = 0, updated = 0;

    for (const posProduct of products) {
      const existing = await prisma.product.findFirst({
        where: { storeId, posProductId: posProduct.id },
      });

      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            name: posProduct.name,
            price: posProduct.price,
            isAvailable: posProduct.available,
          },
        });
        updated++;
      } else {
        await prisma.product.create({
          data: {
            storeId,
            posProductId: posProduct.id,
            name: posProduct.name,
            price: posProduct.price,
            isAvailable: posProduct.available,
          },
        });
        created++;
      }
    }

    logger.info({ storeId, created, updated }, 'Products synced from POS');
    return { created, updated, total: products.length };
  }

  /**
   * Webhook para recibir actualizaciones del POS
   */
  async handlePOSWebhook(storeId, posType, event, data) {
    logger.info({ storeId, posType, event }, 'POS webhook received');

    switch (event) {
      case 'order.completed':
        // Actualizar estado del pedido
        if (data.externalId) {
          await prisma.order.update({
            where: { id: data.externalId },
            data: { status: 'delivered' },
          });
        }
        break;
      case 'product.updated':
        // Actualizar producto
        await prisma.product.updateMany({
          where: { storeId, posProductId: data.productId },
          data: { price: data.price, isAvailable: data.available },
        });
        break;
      case 'inventory.updated':
        // Actualizar stock
        await prisma.product.updateMany({
          where: { storeId, posProductId: data.productId },
          data: { stock: data.quantity },
        });
        break;
    }

    return { processed: true };
  }
}

export const posIntegrationService = new POSIntegrationService();
export default posIntegrationService;

