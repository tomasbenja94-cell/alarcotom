/**
 * Sistema de Integración con Apps de Delivery
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DeliveryIntegrationsService {
  PLATFORMS = {
    RAPPI: 'rappi',
    PEDIDOSYA: 'pedidosya',
    UBEREATS: 'ubereats',
    DOORDASH: 'doordash',
    GLOVO: 'glovo',
  };

  /**
   * Configurar integración
   */
  async setupIntegration(storeId, platform, credentials) {
    const { apiKey, apiSecret, storeExternalId, webhookSecret } = credentials;

    const integration = await prisma.deliveryIntegration.upsert({
      where: { storeId_platform: { storeId, platform } },
      update: {
        apiKey,
        apiSecret,
        storeExternalId,
        webhookSecret,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        storeId,
        platform,
        apiKey,
        apiSecret,
        storeExternalId,
        webhookSecret,
        isActive: true,
      },
    });

    // Sincronizar menú
    await this.syncMenu(storeId, platform);

    logger.info({ storeId, platform }, 'Delivery integration configured');
    return integration;
  }

  /**
   * Sincronizar menú con plataforma
   */
  async syncMenu(storeId, platform) {
    const integration = await this.getIntegration(storeId, platform);
    if (!integration) throw new Error('Integración no configurada');

    const menu = await prisma.product.findMany({
      where: { storeId, isAvailable: true },
      include: { category: true, productOptionCategories: { include: { options: true } } },
    });

    const formattedMenu = this.formatMenuForPlatform(menu, platform);

    // Enviar a la plataforma (simulado)
    const result = await this.sendToPlatform(platform, integration, 'menu/sync', formattedMenu);

    await prisma.deliveryIntegration.update({
      where: { id: integration.id },
      data: { lastMenuSync: new Date() },
    });

    logger.info({ storeId, platform, products: menu.length }, 'Menu synced');
    return result;
  }

  formatMenuForPlatform(menu, platform) {
    // Cada plataforma tiene su propio formato
    const formatters = {
      [this.PLATFORMS.RAPPI]: (products) => ({
        items: products.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          image_url: p.image,
          category: p.category?.name,
          modifiers: p.productOptionCategories?.map(cat => ({
            name: cat.name,
            required: cat.isRequired,
            options: cat.options.map(opt => ({
              name: opt.name,
              price: opt.priceModifier,
            })),
          })),
        })),
      }),
      [this.PLATFORMS.PEDIDOSYA]: (products) => ({
        products: products.map(p => ({
          externalId: p.id,
          name: p.name,
          description: p.description,
          unitPrice: p.price,
          imageUrl: p.image,
          section: p.category?.name,
        })),
      }),
      [this.PLATFORMS.UBEREATS]: (products) => ({
        menu_items: products.map(p => ({
          external_id: p.id,
          title: p.name,
          description: p.description,
          price: { amount: p.price * 100, currency: 'ARS' },
          image_url: p.image,
        })),
      }),
    };

    const formatter = formatters[platform] || formatters[this.PLATFORMS.RAPPI];
    return formatter(menu);
  }

  async sendToPlatform(platform, integration, endpoint, data) {
    // Simulación de envío a API
    logger.info({ platform, endpoint }, 'Sending to platform API');
    return { success: true, platform, endpoint };
  }

  /**
   * Recibir pedido de plataforma
   */
  async receiveOrder(platform, webhookData) {
    const parsedOrder = this.parseOrderFromPlatform(platform, webhookData);

    const integration = await prisma.deliveryIntegration.findFirst({
      where: { storeExternalId: parsedOrder.storeExternalId, platform },
    });

    if (!integration) throw new Error('Integración no encontrada');

    // Crear pedido en nuestro sistema
    const order = await prisma.order.create({
      data: {
        storeId: integration.storeId,
        orderNumber: `${platform.toUpperCase()}-${parsedOrder.externalOrderId}`,
        externalPlatform: platform,
        externalOrderId: parsedOrder.externalOrderId,
        customerName: parsedOrder.customerName,
        customerPhone: parsedOrder.customerPhone,
        deliveryAddress: parsedOrder.deliveryAddress,
        subtotal: parsedOrder.subtotal,
        deliveryFee: parsedOrder.deliveryFee,
        total: parsedOrder.total,
        paymentMethod: parsedOrder.paymentMethod,
        status: 'pending',
        notes: parsedOrder.notes,
        items: {
          create: parsedOrder.items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
            options: item.options || [],
          })),
        },
      },
    });

    logger.info({ orderId: order.id, platform, externalId: parsedOrder.externalOrderId }, 'External order received');
    return order;
  }

  parseOrderFromPlatform(platform, data) {
    const parsers = {
      [this.PLATFORMS.RAPPI]: (d) => ({
        externalOrderId: d.order_id,
        storeExternalId: d.store_id,
        customerName: d.client?.name,
        customerPhone: d.client?.phone,
        deliveryAddress: d.delivery?.address,
        subtotal: d.totals?.subtotal,
        deliveryFee: d.totals?.delivery_fee,
        total: d.totals?.total,
        paymentMethod: d.payment?.method,
        notes: d.instructions,
        items: d.items?.map(i => ({
          productId: i.product_id,
          productName: i.name,
          quantity: i.quantity,
          unitPrice: i.unit_price,
          options: i.modifiers,
        })),
      }),
      [this.PLATFORMS.PEDIDOSYA]: (d) => ({
        externalOrderId: d.id,
        storeExternalId: d.restaurant?.id,
        customerName: d.user?.name,
        customerPhone: d.user?.phone,
        deliveryAddress: d.address?.street,
        subtotal: d.payment?.subtotal,
        deliveryFee: d.payment?.deliveryFee,
        total: d.payment?.total,
        paymentMethod: d.payment?.paymentMethod,
        notes: d.comments,
        items: d.details?.map(i => ({
          productId: i.product?.id,
          productName: i.product?.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      }),
    };

    const parser = parsers[platform];
    if (!parser) throw new Error(`Parser no disponible para ${platform}`);
    return parser(data);
  }

  /**
   * Actualizar estado en plataforma
   */
  async updateOrderStatus(orderId, status) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order?.externalPlatform) return null;

    const integration = await this.getIntegration(order.storeId, order.externalPlatform);
    if (!integration) return null;

    const statusMapping = {
      confirmed: 'ACCEPTED',
      preparing: 'PREPARING',
      ready: 'READY_FOR_PICKUP',
      on_the_way: 'IN_DELIVERY',
      delivered: 'DELIVERED',
      cancelled: 'CANCELLED',
    };

    const externalStatus = statusMapping[status];
    if (!externalStatus) return null;

    await this.sendToPlatform(order.externalPlatform, integration, 'orders/status', {
      order_id: order.externalOrderId,
      status: externalStatus,
    });

    logger.info({ orderId, platform: order.externalPlatform, status: externalStatus }, 'Status updated on platform');
    return { success: true };
  }

  /**
   * Pausar/reanudar tienda en plataforma
   */
  async toggleStoreStatus(storeId, platform, isOpen) {
    const integration = await this.getIntegration(storeId, platform);
    if (!integration) throw new Error('Integración no configurada');

    await this.sendToPlatform(platform, integration, 'store/status', {
      store_id: integration.storeExternalId,
      is_open: isOpen,
    });

    logger.info({ storeId, platform, isOpen }, 'Store status toggled on platform');
    return { success: true };
  }

  /**
   * Obtener integración
   */
  async getIntegration(storeId, platform) {
    return prisma.deliveryIntegration.findFirst({
      where: { storeId, platform, isActive: true },
    });
  }

  /**
   * Listar integraciones de tienda
   */
  async getStoreIntegrations(storeId) {
    return prisma.deliveryIntegration.findMany({
      where: { storeId },
    });
  }

  /**
   * Estadísticas por plataforma
   */
  async getPlatformStats(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        externalPlatform: { not: null },
        createdAt: { gte: startDate },
      },
    });

    const byPlatform = {};
    orders.forEach(o => {
      if (!byPlatform[o.externalPlatform]) {
        byPlatform[o.externalPlatform] = { orders: 0, revenue: 0, cancelled: 0 };
      }
      byPlatform[o.externalPlatform].orders++;
      byPlatform[o.externalPlatform].revenue += o.total;
      if (o.status === 'cancelled') byPlatform[o.externalPlatform].cancelled++;
    });

    return Object.entries(byPlatform).map(([platform, stats]) => ({
      platform,
      ...stats,
      avgTicket: stats.orders > 0 ? Math.round(stats.revenue / stats.orders) : 0,
      cancelRate: stats.orders > 0 ? Math.round((stats.cancelled / stats.orders) * 100) : 0,
    }));
  }

  /**
   * Desactivar integración
   */
  async disableIntegration(storeId, platform) {
    await prisma.deliveryIntegration.update({
      where: { storeId_platform: { storeId, platform } },
      data: { isActive: false },
    });

    logger.info({ storeId, platform }, 'Integration disabled');
    return { success: true };
  }
}

export const deliveryIntegrationsService = new DeliveryIntegrationsService();
export default deliveryIntegrationsService;

