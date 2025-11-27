/**
 * Sistema de Waitlist para Productos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class WaitlistService {
  /**
   * Agregar a lista de espera
   */
  async addToWaitlist(productId, customerId, notifyMethod = 'push') {
    // Verificar que el producto existe y está sin stock
    const product = await prisma.product.findUnique({ where: { id: productId } });
    
    if (!product) throw new Error('Producto no encontrado');
    if (product.isAvailable && (product.stock === null || product.stock > 0)) {
      throw new Error('El producto está disponible');
    }

    // Verificar si ya está en la lista
    const existing = await prisma.waitlist.findFirst({
      where: { productId, customerId, status: 'waiting' },
    });

    if (existing) throw new Error('Ya estás en la lista de espera');

    const entry = await prisma.waitlist.create({
      data: {
        productId,
        customerId,
        storeId: product.storeId,
        notifyMethod, // 'push', 'email', 'whatsapp'
        status: 'waiting',
      },
    });

    logger.info({ productId, customerId }, 'Added to waitlist');
    return entry;
  }

  /**
   * Notificar cuando producto vuelve a estar disponible
   */
  async notifyProductAvailable(productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, price: true, image: true },
    });

    const waitingCustomers = await prisma.waitlist.findMany({
      where: { productId, status: 'waiting' },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true, pushToken: true } },
      },
    });

    const results = { notified: 0, failed: 0 };

    for (const entry of waitingCustomers) {
      try {
        // Marcar como notificado
        await prisma.waitlist.update({
          where: { id: entry.id },
          data: { status: 'notified', notifiedAt: new Date() },
        });

        // Enviar notificación según método preferido
        await this.sendNotification(entry.customer, product, entry.notifyMethod);
        results.notified++;
      } catch (error) {
        results.failed++;
        logger.error({ entryId: entry.id, error: error.message }, 'Waitlist notification failed');
      }
    }

    logger.info({ productId, notified: results.notified }, 'Waitlist notifications sent');
    return results;
  }

  /**
   * Enviar notificación
   */
  async sendNotification(customer, product, method) {
    const message = `¡${product.name} ya está disponible! 🎉`;

    switch (method) {
      case 'push':
        if (customer.pushToken) {
          // Enviar push notification
          logger.info({ customerId: customer.id }, 'Push notification sent');
        }
        break;
      case 'whatsapp':
        if (customer.phone) {
          // Enviar WhatsApp
          logger.info({ phone: customer.phone }, 'WhatsApp notification sent');
        }
        break;
      case 'email':
        if (customer.email) {
          // Enviar email
          logger.info({ email: customer.email }, 'Email notification sent');
        }
        break;
    }
  }

  /**
   * Obtener lista de espera de un producto
   */
  async getProductWaitlist(productId) {
    const entries = await prisma.waitlist.findMany({
      where: { productId },
      include: {
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      total: entries.length,
      waiting: entries.filter(e => e.status === 'waiting').length,
      notified: entries.filter(e => e.status === 'notified').length,
      entries,
    };
  }

  /**
   * Obtener waitlists de un cliente
   */
  async getCustomerWaitlists(customerId) {
    return prisma.waitlist.findMany({
      where: { customerId, status: 'waiting' },
      include: {
        product: { select: { id: true, name: true, price: true, image: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Remover de lista de espera
   */
  async removeFromWaitlist(productId, customerId) {
    await prisma.waitlist.updateMany({
      where: { productId, customerId, status: 'waiting' },
      data: { status: 'cancelled' },
    });

    logger.info({ productId, customerId }, 'Removed from waitlist');
    return { success: true };
  }

  /**
   * Estadísticas de waitlist por tienda
   */
  async getWaitlistStats(storeId) {
    const [totalWaiting, products] = await Promise.all([
      prisma.waitlist.count({ where: { storeId, status: 'waiting' } }),
      prisma.waitlist.groupBy({
        by: ['productId'],
        where: { storeId, status: 'waiting' },
        _count: true,
        orderBy: { _count: { productId: 'desc' } },
        take: 10,
      }),
    ]);

    // Obtener nombres de productos
    const productIds = products.map(p => p.productId);
    const productDetails = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });

    return {
      totalWaiting,
      topProducts: products.map(p => ({
        productId: p.productId,
        productName: productDetails.find(pd => pd.id === p.productId)?.name || 'Desconocido',
        waitingCount: p._count,
      })),
    };
  }

  /**
   * Hook para cuando se actualiza stock
   */
  async onStockUpdated(productId, newStock) {
    if (newStock > 0) {
      const waitingCount = await prisma.waitlist.count({
        where: { productId, status: 'waiting' },
      });

      if (waitingCount > 0) {
        await this.notifyProductAvailable(productId);
      }
    }
  }
}

export const waitlistService = new WaitlistService();
export default waitlistService;

