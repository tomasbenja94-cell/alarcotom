import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class MultiStoreService {
  /**
   * Crear nueva sucursal
   */
  async createStore(parentId, storeData) {
    try {
      const store = await prisma.store.create({
        data: {
          ...storeData,
          parentId,
          createdAt: new Date()
        }
      });

      logger.info({ storeId: store.id, name: store.name }, 'Sucursal creada');
      return store;
    } catch (error) {
      logger.error({ error }, 'Error creando sucursal');
      throw error;
    }
  }

  /**
   * Obtener todas las sucursales
   */
  async getStores(parentId = null) {
    return prisma.store.findMany({
      where: parentId ? { parentId } : {},
      include: {
        _count: { select: { orders: true, products: true } }
      }
    });
  }

  /**
   * Obtener resumen de todas las sucursales
   */
  async getStoresSummary(parentId) {
    const stores = await this.getStores(parentId);
    
    const summaries = await Promise.all(
      stores.map(async store => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayOrders = await prisma.order.count({
          where: {
            storeId: store.id,
            createdAt: { gte: todayStart }
          }
        });

        const todaySales = await prisma.order.aggregate({
          where: {
            storeId: store.id,
            createdAt: { gte: todayStart },
            status: { in: ['COMPLETED', 'DELIVERED'] }
          },
          _sum: { total: true }
        });

        return {
          id: store.id,
          name: store.name,
          address: store.address,
          status: store.status,
          todayOrders,
          todaySales: todaySales._sum.total || 0
        };
      })
    );

    return summaries;
  }

  /**
   * Sincronizar productos entre sucursales
   */
  async syncProducts(sourceStoreId, targetStoreIds, productIds = null) {
    try {
      const products = await prisma.product.findMany({
        where: {
          storeId: sourceStoreId,
          ...(productIds && { id: { in: productIds } })
        }
      });

      for (const targetId of targetStoreIds) {
        for (const product of products) {
          await prisma.product.upsert({
            where: {
              storeId_sku: { storeId: targetId, sku: product.sku }
            },
            create: {
              ...product,
              id: undefined,
              storeId: targetId
            },
            update: {
              name: product.name,
              description: product.description,
              price: product.price,
              image: product.image
            }
          });
        }
      }

      logger.info({ sourceStoreId, targetStoreIds }, 'Productos sincronizados');
      return { synced: products.length, stores: targetStoreIds.length };
    } catch (error) {
      logger.error({ error }, 'Error sincronizando productos');
      throw error;
    }
  }

  /**
   * Transferir stock entre sucursales
   */
  async transferStock(fromStoreId, toStoreId, ingredientId, quantity, userId) {
    try {
      // Descontar de origen
      await prisma.inventory.updateMany({
        where: { storeId: fromStoreId, ingredientId },
        data: { quantity: { decrement: quantity } }
      });

      // Agregar a destino
      await prisma.inventory.upsert({
        where: { storeId_ingredientId: { storeId: toStoreId, ingredientId } },
        create: { storeId: toStoreId, ingredientId, quantity },
        update: { quantity: { increment: quantity } }
      });

      // Registrar transferencia
      const transfer = await prisma.stockTransfer.create({
        data: {
          fromStoreId,
          toStoreId,
          ingredientId,
          quantity,
          createdBy: userId,
          createdAt: new Date()
        }
      });

      logger.info({ transferId: transfer.id }, 'Stock transferido');
      return transfer;
    } catch (error) {
      logger.error({ error }, 'Error transfiriendo stock');
      throw error;
    }
  }

  /**
   * Reporte consolidado de ventas
   */
  async getConsolidatedReport(storeIds, startDate, endDate) {
    const reports = await Promise.all(
      storeIds.map(async storeId => {
        const orders = await prisma.order.findMany({
          where: {
            storeId,
            createdAt: { gte: startDate, lte: endDate },
            status: { in: ['COMPLETED', 'DELIVERED'] }
          }
        });

        return {
          storeId,
          totalOrders: orders.length,
          totalSales: orders.reduce((sum, o) => sum + o.total, 0),
          avgTicket: orders.length > 0 
            ? orders.reduce((sum, o) => sum + o.total, 0) / orders.length 
            : 0
        };
      })
    );

    return {
      stores: reports,
      totals: {
        orders: reports.reduce((sum, r) => sum + r.totalOrders, 0),
        sales: reports.reduce((sum, r) => sum + r.totalSales, 0)
      }
    };
  }
}

export const multiStoreService = new MultiStoreService();
export default multiStoreService;

