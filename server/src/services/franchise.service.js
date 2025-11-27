/**
 * Sistema de Gestión de Franquicias
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class FranchiseService {
  /**
   * Crear franquicia (marca madre)
   */
  async createFranchise(franchiseData) {
    const { name, logo, description, ownerId, royaltyPercent, marketingFee } = franchiseData;

    const franchise = await prisma.franchise.create({
      data: {
        name,
        logo,
        description,
        ownerId,
        royaltyPercent: royaltyPercent || 5,
        marketingFee: marketingFee || 2,
        status: 'active',
      },
    });

    logger.info({ franchiseId: franchise.id, name }, 'Franchise created');
    return franchise;
  }

  /**
   * Agregar tienda a franquicia
   */
  async addStoreToFranchise(franchiseId, storeId, franchiseeId) {
    const franchiseStore = await prisma.franchiseStore.create({
      data: {
        franchiseId,
        storeId,
        franchiseeId,
        joinedAt: new Date(),
        status: 'active',
      },
    });

    // Sincronizar menú de la franquicia
    await this.syncMenuToStore(franchiseId, storeId);

    logger.info({ franchiseId, storeId }, 'Store added to franchise');
    return franchiseStore;
  }

  /**
   * Sincronizar menú maestro a tienda
   */
  async syncMenuToStore(franchiseId, storeId) {
    const masterMenu = await prisma.franchiseProduct.findMany({
      where: { franchiseId },
      include: { category: true },
    });

    for (const masterProduct of masterMenu) {
      // Verificar si ya existe
      const existing = await prisma.product.findFirst({
        where: { storeId, masterProductId: masterProduct.id },
      });

      if (!existing) {
        await prisma.product.create({
          data: {
            storeId,
            masterProductId: masterProduct.id,
            name: masterProduct.name,
            description: masterProduct.description,
            price: masterProduct.suggestedPrice,
            image: masterProduct.image,
            isAvailable: true,
          },
        });
      }
    }

    logger.info({ franchiseId, storeId }, 'Menu synced');
    return { success: true };
  }

  /**
   * Calcular royalties
   */
  async calculateRoyalties(franchiseId, month, year) {
    const franchise = await prisma.franchise.findUnique({ where: { id: franchiseId } });
    if (!franchise) throw new Error('Franquicia no encontrada');

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const stores = await prisma.franchiseStore.findMany({
      where: { franchiseId, status: 'active' },
      include: { store: true },
    });

    const royalties = [];

    for (const fs of stores) {
      const sales = await prisma.order.aggregate({
        where: {
          storeId: fs.storeId,
          status: 'delivered',
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { total: true },
      });

      const totalSales = sales._sum.total || 0;
      const royaltyAmount = Math.round(totalSales * (franchise.royaltyPercent / 100));
      const marketingAmount = Math.round(totalSales * (franchise.marketingFee / 100));

      royalties.push({
        storeId: fs.storeId,
        storeName: fs.store.name,
        totalSales,
        royaltyPercent: franchise.royaltyPercent,
        royaltyAmount,
        marketingFee: franchise.marketingFee,
        marketingAmount,
        totalDue: royaltyAmount + marketingAmount,
      });

      // Registrar en DB
      await prisma.franchiseRoyalty.create({
        data: {
          franchiseId,
          storeId: fs.storeId,
          month,
          year,
          totalSales,
          royaltyAmount,
          marketingAmount,
          status: 'pending',
        },
      });
    }

    return {
      franchise: franchise.name,
      period: `${month}/${year}`,
      stores: royalties,
      totals: {
        sales: royalties.reduce((sum, r) => sum + r.totalSales, 0),
        royalties: royalties.reduce((sum, r) => sum + r.royaltyAmount, 0),
        marketing: royalties.reduce((sum, r) => sum + r.marketingAmount, 0),
      },
    };
  }

  /**
   * Dashboard de franquicia
   */
  async getFranchiseDashboard(franchiseId) {
    const stores = await prisma.franchiseStore.findMany({
      where: { franchiseId, status: 'active' },
      include: { store: true },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const storeStats = await Promise.all(
      stores.map(async (fs) => {
        const [orders, revenue] = await Promise.all([
          prisma.order.count({
            where: { storeId: fs.storeId, createdAt: { gte: thirtyDaysAgo } },
          }),
          prisma.order.aggregate({
            where: { storeId: fs.storeId, status: 'delivered', createdAt: { gte: thirtyDaysAgo } },
            _sum: { total: true },
          }),
        ]);

        return {
          storeId: fs.storeId,
          storeName: fs.store.name,
          city: fs.store.city,
          orders,
          revenue: revenue._sum.total || 0,
        };
      })
    );

    return {
      totalStores: stores.length,
      totalOrders: storeStats.reduce((sum, s) => sum + s.orders, 0),
      totalRevenue: storeStats.reduce((sum, s) => sum + s.revenue, 0),
      avgRevenuePerStore: storeStats.length > 0
        ? Math.round(storeStats.reduce((sum, s) => sum + s.revenue, 0) / storeStats.length)
        : 0,
      stores: storeStats.sort((a, b) => b.revenue - a.revenue),
    };
  }

  /**
   * Crear producto maestro
   */
  async createMasterProduct(franchiseId, productData) {
    const product = await prisma.franchiseProduct.create({
      data: {
        franchiseId,
        ...productData,
      },
    });

    // Sincronizar a todas las tiendas
    const stores = await prisma.franchiseStore.findMany({
      where: { franchiseId, status: 'active' },
    });

    for (const store of stores) {
      await this.syncMenuToStore(franchiseId, store.storeId);
    }

    return product;
  }

  /**
   * Obtener tiendas de franquicia
   */
  async getFranchiseStores(franchiseId) {
    return prisma.franchiseStore.findMany({
      where: { franchiseId },
      include: {
        store: true,
        franchisee: { select: { name: true, email: true } },
      },
    });
  }

  /**
   * Comparar rendimiento de tiendas
   */
  async compareStorePerformance(franchiseId, period = 30) {
    const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

    const stores = await prisma.franchiseStore.findMany({
      where: { franchiseId, status: 'active' },
      include: { store: true },
    });

    const performance = await Promise.all(
      stores.map(async (fs) => {
        const [orders, surveys] = await Promise.all([
          prisma.order.findMany({
            where: { storeId: fs.storeId, status: 'delivered', createdAt: { gte: startDate } },
          }),
          prisma.survey.findMany({
            where: { storeId: fs.storeId, status: 'completed', createdAt: { gte: startDate } },
          }),
        ]);

        return {
          storeName: fs.store.name,
          orders: orders.length,
          revenue: orders.reduce((sum, o) => sum + o.total, 0),
          avgTicket: orders.length > 0
            ? Math.round(orders.reduce((sum, o) => sum + o.total, 0) / orders.length)
            : 0,
          avgRating: surveys.length > 0
            ? Math.round(surveys.reduce((sum, s) => sum + s.overallRating, 0) / surveys.length * 10) / 10
            : 0,
        };
      })
    );

    return performance.sort((a, b) => b.revenue - a.revenue);
  }
}

export const franchiseService = new FranchiseService();
export default franchiseService;

