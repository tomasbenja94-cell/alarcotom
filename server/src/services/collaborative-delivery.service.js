/**
 * Sistema de Delivery Colaborativo
 * Permite compartir repartidores entre tiendas cercanas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class CollaborativeDeliveryService {
  /**
   * Registrar tienda en red colaborativa
   */
  async joinNetwork(storeId, config) {
    const { shareDrivers, acceptSharedDrivers, maxDistance, commissionPercent } = config;

    const membership = await prisma.deliveryNetwork.upsert({
      where: { storeId },
      update: {
        shareDrivers: shareDrivers ?? true,
        acceptSharedDrivers: acceptSharedDrivers ?? true,
        maxDistance: maxDistance || 5, // km
        commissionPercent: commissionPercent || 10,
        isActive: true,
      },
      create: {
        storeId,
        shareDrivers: shareDrivers ?? true,
        acceptSharedDrivers: acceptSharedDrivers ?? true,
        maxDistance: maxDistance || 5,
        commissionPercent: commissionPercent || 10,
        isActive: true,
      },
    });

    logger.info({ storeId }, 'Store joined delivery network');
    return membership;
  }

  /**
   * Buscar repartidor disponible en la red
   */
  async findAvailableDriver(storeId, deliveryLocation) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    const networkConfig = await prisma.deliveryNetwork.findUnique({ where: { storeId } });

    if (!networkConfig?.acceptSharedDrivers) {
      return null;
    }

    // Buscar tiendas cercanas que compartan repartidores
    const nearbyStores = await prisma.store.findMany({
      where: {
        id: { not: storeId },
        deliveryNetwork: {
          isActive: true,
          shareDrivers: true,
        },
      },
      include: { deliveryNetwork: true },
    });

    // Filtrar por distancia
    const eligibleStores = nearbyStores.filter(s => {
      const distance = this.calculateDistance(store.lat, store.lng, s.lat, s.lng);
      return distance <= (s.deliveryNetwork?.maxDistance || 5);
    });

    // Buscar repartidores disponibles en esas tiendas
    for (const eligibleStore of eligibleStores) {
      const driver = await prisma.deliveryDriver.findFirst({
        where: {
          storeId: eligibleStore.id,
          status: 'available',
          isActive: true,
        },
      });

      if (driver) {
        return {
          driver,
          sourceStore: eligibleStore,
          commission: eligibleStore.deliveryNetwork.commissionPercent,
        };
      }
    }

    return null;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRad(deg) { return deg * (Math.PI / 180); }

  /**
   * Asignar repartidor compartido
   */
  async assignSharedDriver(orderId, driverId, sourceStoreId, commissionPercent) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          deliveryPersonId: driverId,
          isSharedDelivery: true,
          sharedFromStoreId: sourceStoreId,
          assignedAt: new Date(),
        },
      }),
      prisma.sharedDelivery.create({
        data: {
          orderId,
          requestingStoreId: order.storeId,
          providingStoreId: sourceStoreId,
          driverId,
          commissionPercent,
          commissionAmount: Math.round(order.deliveryFee * (commissionPercent / 100)),
          status: 'assigned',
        },
      }),
      prisma.deliveryDriver.update({
        where: { id: driverId },
        data: { status: 'busy' },
      }),
    ]);

    logger.info({ orderId, driverId, sourceStoreId }, 'Shared driver assigned');
    return { success: true };
  }

  /**
   * Completar entrega compartida
   */
  async completeSharedDelivery(orderId) {
    const sharedDelivery = await prisma.sharedDelivery.findFirst({
      where: { orderId },
    });

    if (!sharedDelivery) return null;

    await prisma.$transaction([
      prisma.sharedDelivery.update({
        where: { id: sharedDelivery.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      }),
      // Registrar comisión a pagar
      prisma.networkCommission.create({
        data: {
          sharedDeliveryId: sharedDelivery.id,
          fromStoreId: sharedDelivery.requestingStoreId,
          toStoreId: sharedDelivery.providingStoreId,
          amount: sharedDelivery.commissionAmount,
          status: 'pending',
        },
      }),
    ]);

    return { success: true, commission: sharedDelivery.commissionAmount };
  }

  /**
   * Obtener estadísticas de red
   */
  async getNetworkStats(storeId) {
    const [provided, received, pendingCommissions] = await Promise.all([
      prisma.sharedDelivery.count({
        where: { providingStoreId: storeId, status: 'completed' },
      }),
      prisma.sharedDelivery.count({
        where: { requestingStoreId: storeId, status: 'completed' },
      }),
      prisma.networkCommission.aggregate({
        where: { toStoreId: storeId, status: 'pending' },
        _sum: { amount: true },
      }),
    ]);

    const earnedCommissions = await prisma.networkCommission.aggregate({
      where: { toStoreId: storeId, status: 'paid' },
      _sum: { amount: true },
    });

    return {
      deliveriesProvided: provided,
      deliveriesReceived: received,
      pendingCommissions: pendingCommissions._sum.amount || 0,
      earnedCommissions: earnedCommissions._sum.amount || 0,
    };
  }

  /**
   * Liquidar comisiones
   */
  async settleCommissions(storeId) {
    const pendingCommissions = await prisma.networkCommission.findMany({
      where: { fromStoreId: storeId, status: 'pending' },
    });

    const totalAmount = pendingCommissions.reduce((sum, c) => sum + c.amount, 0);

    if (totalAmount === 0) return { settled: 0 };

    await prisma.networkCommission.updateMany({
      where: { id: { in: pendingCommissions.map(c => c.id) } },
      data: { status: 'paid', paidAt: new Date() },
    });

    logger.info({ storeId, amount: totalAmount }, 'Commissions settled');
    return { settled: pendingCommissions.length, totalAmount };
  }

  /**
   * Ver tiendas cercanas en la red
   */
  async getNearbyNetworkStores(storeId) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });

    const networkStores = await prisma.store.findMany({
      where: {
        id: { not: storeId },
        deliveryNetwork: { isActive: true },
      },
      include: {
        deliveryNetwork: true,
        _count: { select: { deliveryDrivers: { where: { status: 'available' } } } },
      },
    });

    return networkStores.map(s => ({
      id: s.id,
      name: s.name,
      distance: Math.round(this.calculateDistance(store.lat, store.lng, s.lat, s.lng) * 10) / 10,
      sharesDrivers: s.deliveryNetwork.shareDrivers,
      acceptsShared: s.deliveryNetwork.acceptSharedDrivers,
      availableDrivers: s._count.deliveryDrivers,
      commission: s.deliveryNetwork.commissionPercent,
    })).sort((a, b) => a.distance - b.distance);
  }

  /**
   * Solicitar repartidor a tienda específica
   */
  async requestDriver(requestingStoreId, providingStoreId, orderId) {
    const request = await prisma.driverRequest.create({
      data: {
        requestingStoreId,
        providingStoreId,
        orderId,
        status: 'pending',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
      },
    });

    // Notificar a la tienda proveedora
    logger.info({ requestId: request.id }, 'Driver request created');
    return request;
  }

  /**
   * Responder a solicitud de repartidor
   */
  async respondToRequest(requestId, accept, driverId = null) {
    const request = await prisma.driverRequest.findUnique({ where: { id: requestId } });

    if (!request || request.status !== 'pending') {
      throw new Error('Solicitud no válida');
    }

    if (accept && driverId) {
      await this.assignSharedDriver(
        request.orderId,
        driverId,
        request.providingStoreId,
        10 // Comisión por defecto
      );
    }

    await prisma.driverRequest.update({
      where: { id: requestId },
      data: {
        status: accept ? 'accepted' : 'rejected',
        respondedAt: new Date(),
        assignedDriverId: driverId,
      },
    });

    return { success: true };
  }
}

export const collaborativeDeliveryService = new CollaborativeDeliveryService();
export default collaborativeDeliveryService;

