/**
 * Sistema de Gestión de Flotas de Delivery
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class FleetManagementService {
  DRIVER_STATUS = {
    AVAILABLE: 'available',
    BUSY: 'busy',
    OFFLINE: 'offline',
    ON_BREAK: 'on_break',
  };

  /**
   * Registrar repartidor
   */
  async registerDriver(storeId, driverData) {
    const {
      name,
      phone,
      email,
      vehicleType,
      vehiclePlate,
      licenseNumber,
      photo,
    } = driverData;

    const driver = await prisma.deliveryDriver.create({
      data: {
        storeId,
        name,
        phone,
        email,
        vehicleType, // 'motorcycle', 'bicycle', 'car', 'walking'
        vehiclePlate,
        licenseNumber,
        photo,
        status: this.DRIVER_STATUS.OFFLINE,
        isActive: true,
      },
    });

    logger.info({ driverId: driver.id, name }, 'Driver registered');
    return driver;
  }

  /**
   * Actualizar ubicación del repartidor
   */
  async updateDriverLocation(driverId, lat, lng) {
    await prisma.deliveryDriver.update({
      where: { id: driverId },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastLocationUpdate: new Date(),
      },
    });

    // Guardar historial de ubicaciones
    await prisma.driverLocationHistory.create({
      data: { driverId, lat, lng },
    });

    return { success: true };
  }

  /**
   * Cambiar estado del repartidor
   */
  async updateDriverStatus(driverId, status) {
    if (!Object.values(this.DRIVER_STATUS).includes(status)) {
      throw new Error('Estado inválido');
    }

    await prisma.deliveryDriver.update({
      where: { id: driverId },
      data: { status },
    });

    logger.info({ driverId, status }, 'Driver status updated');
    return { success: true };
  }

  /**
   * Asignar pedido a repartidor
   */
  async assignOrder(orderId, driverId = null) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true },
    });

    if (!order) throw new Error('Pedido no encontrado');

    let driver;

    if (driverId) {
      driver = await prisma.deliveryDriver.findUnique({ where: { id: driverId } });
    } else {
      // Asignación automática: buscar repartidor más cercano disponible
      driver = await this.findBestDriver(order.storeId, order.store.lat, order.store.lng);
    }

    if (!driver) {
      throw new Error('No hay repartidores disponibles');
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryPersonId: driver.id,
        assignedAt: new Date(),
      },
    });

    await prisma.deliveryDriver.update({
      where: { id: driver.id },
      data: { status: this.DRIVER_STATUS.BUSY },
    });

    logger.info({ orderId, driverId: driver.id }, 'Order assigned to driver');
    return { driver, order };
  }

  /**
   * Encontrar mejor repartidor
   */
  async findBestDriver(storeId, storeLat, storeLng) {
    const drivers = await prisma.deliveryDriver.findMany({
      where: {
        storeId,
        status: this.DRIVER_STATUS.AVAILABLE,
        isActive: true,
        currentLat: { not: null },
      },
    });

    if (drivers.length === 0) return null;

    // Ordenar por distancia a la tienda
    const withDistance = drivers.map(driver => ({
      ...driver,
      distance: this.calculateDistance(storeLat, storeLng, driver.currentLat, driver.currentLng),
    }));

    withDistance.sort((a, b) => a.distance - b.distance);
    return withDistance[0];
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

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Completar entrega
   */
  async completeDelivery(orderId, driverId, signature = null, photo = null) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'delivered',
        deliveredAt: new Date(),
        deliverySignature: signature,
        deliveryPhoto: photo,
      },
    });

    await prisma.deliveryDriver.update({
      where: { id: driverId },
      data: { status: this.DRIVER_STATUS.AVAILABLE },
    });

    logger.info({ orderId, driverId }, 'Delivery completed');
    return { success: true };
  }

  /**
   * Obtener pedidos activos de repartidor
   */
  async getDriverActiveOrders(driverId) {
    return prisma.order.findMany({
      where: {
        deliveryPersonId: driverId,
        status: { in: ['confirmed', 'preparing', 'ready', 'on_the_way'] },
      },
      include: {
        items: true,
        store: { select: { name: true, address: true, lat: true, lng: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Dashboard de flota
   */
  async getFleetDashboard(storeId) {
    const drivers = await prisma.deliveryDriver.findMany({
      where: { storeId, isActive: true },
    });

    const activeOrders = await prisma.order.count({
      where: {
        storeId,
        status: { in: ['on_the_way'] },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayDeliveries = await prisma.order.count({
      where: {
        storeId,
        status: 'delivered',
        deliveredAt: { gte: today },
      },
    });

    return {
      totalDrivers: drivers.length,
      available: drivers.filter(d => d.status === this.DRIVER_STATUS.AVAILABLE).length,
      busy: drivers.filter(d => d.status === this.DRIVER_STATUS.BUSY).length,
      offline: drivers.filter(d => d.status === this.DRIVER_STATUS.OFFLINE).length,
      activeOrders,
      todayDeliveries,
      drivers: drivers.map(d => ({
        id: d.id,
        name: d.name,
        status: d.status,
        vehicleType: d.vehicleType,
        lastUpdate: d.lastLocationUpdate,
        location: d.currentLat ? { lat: d.currentLat, lng: d.currentLng } : null,
      })),
    };
  }

  /**
   * Estadísticas de repartidor
   */
  async getDriverStats(driverId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const deliveries = await prisma.order.findMany({
      where: {
        deliveryPersonId: driverId,
        status: 'delivered',
        deliveredAt: { gte: startDate },
      },
    });

    const tips = await prisma.tipPayment.aggregate({
      where: {
        employeeId: driverId,
        date: { gte: startDate },
      },
      _sum: { amount: true },
    });

    // Calcular tiempo promedio de entrega
    const avgDeliveryTime = deliveries.length > 0
      ? deliveries.reduce((sum, d) => {
          const time = d.deliveredAt - d.assignedAt;
          return sum + (time / 60000); // minutos
        }, 0) / deliveries.length
      : 0;

    return {
      totalDeliveries: deliveries.length,
      totalTips: tips._sum.amount || 0,
      avgDeliveryTime: Math.round(avgDeliveryTime),
      deliveriesPerDay: Math.round(deliveries.length / days * 10) / 10,
    };
  }

  /**
   * Optimizar ruta
   */
  async optimizeRoute(driverId) {
    const orders = await this.getDriverActiveOrders(driverId);
    
    if (orders.length <= 1) return orders;

    // Algoritmo simple de nearest neighbor
    const driver = await prisma.deliveryDriver.findUnique({ where: { id: driverId } });
    if (!driver?.currentLat) return orders;

    const optimized = [];
    const remaining = [...orders];
    let currentLat = driver.currentLat;
    let currentLng = driver.currentLng;

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;

      remaining.forEach((order, idx) => {
        const dist = this.calculateDistance(currentLat, currentLng, order.deliveryLat, order.deliveryLng);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = idx;
        }
      });

      const nearest = remaining.splice(nearestIdx, 1)[0];
      optimized.push(nearest);
      currentLat = nearest.deliveryLat;
      currentLng = nearest.deliveryLng;
    }

    return optimized;
  }
}

export const fleetManagementService = new FleetManagementService();
export default fleetManagementService;

