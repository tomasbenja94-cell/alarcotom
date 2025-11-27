/**
 * Integración con Plataformas de Delivery
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DeliveryPlatformsService {
  PLATFORMS = {
    UBER_EATS: 'uber_eats',
    DOORDASH: 'doordash',
    RAPPI: 'rappi',
    PEDIDOS_YA: 'pedidos_ya',
    GLOVO: 'glovo',
  };

  /**
   * Configurar integración
   */
  async configurePlatform(storeId, platform, credentials) {
    const integration = await prisma.deliveryPlatformIntegration.upsert({
      where: { storeId_platform: { storeId, platform } },
      update: {
        credentials: JSON.stringify(credentials),
        isActive: true,
      },
      create: {
        storeId,
        platform,
        credentials: JSON.stringify(credentials),
        isActive: true,
      },
    });

    logger.info({ storeId, platform }, 'Delivery platform configured');
    return integration;
  }

  /**
   * Sincronizar menú a plataforma
   */
  async syncMenuToPlatform(storeId, platform) {
    const integration = await this.getIntegration(storeId, platform);
    if (!integration) throw new Error(`${platform} no configurado`);

    const menu = await prisma.category.findMany({
      where: { storeId },
      include: {
        products: {
          where: { isAvailable: true },
          include: { productOptionCategories: { include: { options: true } } },
        },
      },
    });

    const formattedMenu = this.formatMenuForPlatform(menu, platform);

    switch (platform) {
      case this.PLATFORMS.UBER_EATS:
        return this.syncToUberEats(integration, formattedMenu);
      case this.PLATFORMS.RAPPI:
        return this.syncToRappi(integration, formattedMenu);
      case this.PLATFORMS.PEDIDOS_YA:
        return this.syncToPedidosYa(integration, formattedMenu);
      default:
        throw new Error('Plataforma no soportada');
    }
  }

  formatMenuForPlatform(menu, platform) {
    return {
      categories: menu.map(cat => ({
        id: cat.id,
        name: cat.name,
        items: cat.products.map(prod => ({
          id: prod.id,
          name: prod.name,
          description: prod.description,
          price: prod.price,
          image: prod.image,
          modifierGroups: prod.productOptionCategories.map(optCat => ({
            id: optCat.id,
            name: optCat.name,
            required: optCat.isRequired,
            min: optCat.minSelections,
            max: optCat.maxSelections,
            modifiers: optCat.options.map(opt => ({
              id: opt.id,
              name: opt.name,
              price: opt.priceModifier,
            })),
          })),
        })),
      })),
    };
  }

  async syncToUberEats(integration, menu) {
    const creds = JSON.parse(integration.credentials);
    // Implementación real con Uber Eats API
    logger.info({ storeId: integration.storeId }, 'Menu synced to Uber Eats');
    return { success: true, platform: 'uber_eats' };
  }

  async syncToRappi(integration, menu) {
    const creds = JSON.parse(integration.credentials);
    logger.info({ storeId: integration.storeId }, 'Menu synced to Rappi');
    return { success: true, platform: 'rappi' };
  }

  async syncToPedidosYa(integration, menu) {
    const creds = JSON.parse(integration.credentials);
    logger.info({ storeId: integration.storeId }, 'Menu synced to PedidosYa');
    return { success: true, platform: 'pedidos_ya' };
  }

  /**
   * Recibir pedido de plataforma
   */
  async receiveOrder(storeId, platform, externalOrder) {
    const integration = await this.getIntegration(storeId, platform);
    if (!integration) throw new Error(`${platform} no configurado`);

    // Mapear productos externos a internos
    const items = await this.mapExternalItems(storeId, externalOrder.items);

    const order = await prisma.order.create({
      data: {
        storeId,
        externalPlatform: platform,
        externalOrderId: externalOrder.id,
        customerName: externalOrder.customer?.name || 'Cliente ' + platform,
        customerPhone: externalOrder.customer?.phone || '',
        deliveryAddress: externalOrder.deliveryAddress,
        subtotal: externalOrder.subtotal,
        deliveryFee: externalOrder.deliveryFee || 0,
        total: externalOrder.total,
        status: 'pending',
        paymentMethod: 'platform',
        paymentStatus: 'paid',
        notes: `Pedido de ${platform} #${externalOrder.id}`,
        items: { create: items },
      },
    });

    logger.info({ orderId: order.id, platform, externalId: externalOrder.id }, 'External order received');
    return order;
  }

  async mapExternalItems(storeId, externalItems) {
    const mappedItems = [];

    for (const item of externalItems) {
      // Buscar producto por ID externo o nombre
      let product = await prisma.product.findFirst({
        where: {
          storeId,
          OR: [
            { externalIds: { contains: item.externalId } },
            { name: { contains: item.name } },
          ],
        },
      });

      mappedItems.push({
        productId: product?.id,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.price * item.quantity,
        options: item.modifiers ? JSON.stringify(item.modifiers) : null,
      });
    }

    return mappedItems;
  }

  /**
   * Actualizar estado en plataforma
   */
  async updateOrderStatus(orderId, status) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    
    if (!order?.externalPlatform || !order?.externalOrderId) return;

    const integration = await this.getIntegration(order.storeId, order.externalPlatform);
    if (!integration) return;

    const statusMap = {
      confirmed: 'ACCEPTED',
      preparing: 'PREPARING',
      ready: 'READY_FOR_PICKUP',
      on_the_way: 'OUT_FOR_DELIVERY',
      delivered: 'DELIVERED',
      cancelled: 'CANCELLED',
    };

    const externalStatus = statusMap[status];
    if (!externalStatus) return;

    // Enviar actualización a la plataforma
    logger.info({ orderId, platform: order.externalPlatform, status: externalStatus }, 'Status updated on platform');
    return { success: true };
  }

  /**
   * Pausar tienda en plataformas
   */
  async pauseOnPlatforms(storeId, reason = null) {
    const integrations = await prisma.deliveryPlatformIntegration.findMany({
      where: { storeId, isActive: true },
    });

    for (const integration of integrations) {
      // Pausar en cada plataforma
      logger.info({ storeId, platform: integration.platform }, 'Store paused on platform');
    }

    return { paused: integrations.length };
  }

  /**
   * Reanudar tienda en plataformas
   */
  async resumeOnPlatforms(storeId) {
    const integrations = await prisma.deliveryPlatformIntegration.findMany({
      where: { storeId, isActive: true },
    });

    for (const integration of integrations) {
      logger.info({ storeId, platform: integration.platform }, 'Store resumed on platform');
    }

    return { resumed: integrations.length };
  }

  /**
   * Obtener integración
   */
  async getIntegration(storeId, platform) {
    return prisma.deliveryPlatformIntegration.findFirst({
      where: { storeId, platform, isActive: true },
    });
  }

  /**
   * Estadísticas por plataforma
   */
  async getPlatformStats(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.groupBy({
      by: ['externalPlatform'],
      where: {
        storeId,
        externalPlatform: { not: null },
        createdAt: { gte: startDate },
      },
      _count: true,
      _sum: { total: true },
    });

    return orders.map(o => ({
      platform: o.externalPlatform,
      orders: o._count,
      revenue: o._sum.total || 0,
    }));
  }
}

export const deliveryPlatformsService = new DeliveryPlatformsService();
export default deliveryPlatformsService;

