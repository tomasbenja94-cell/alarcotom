/**
 * Sistema de Tracking GPS de Repartidores en Tiempo Real
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DriverTrackingService {
  // Tarifa fija de delivery
  DELIVERY_FEE = 4000;

  /**
   * Actualizar ubicación del repartidor
   */
  async updateLocation(driverId, lat, lng, orderId = null) {
    const timestamp = new Date();

    // Guardar punto en historial
    await prisma.driverLocationHistory.create({
      data: {
        driverId,
        orderId,
        lat,
        lng,
        timestamp,
      },
    });

    // Actualizar ubicación actual
    await prisma.deliveryDriver.update({
      where: { id: driverId },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastLocationUpdate: timestamp,
      },
    });

    // Si hay orden activa, actualizar ETA
    if (orderId) {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (order?.deliveryLat && order?.deliveryLng) {
        const distance = this.calculateDistance(lat, lng, order.deliveryLat, order.deliveryLng);
        const etaMinutes = Math.max(1, Math.round(distance * 3)); // 3 min/km

        await prisma.order.update({
          where: { id: orderId },
          data: { currentEta: etaMinutes },
        });
      }
    }

    return { success: true, timestamp };
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Obtener ubicación actual del repartidor
   */
  async getDriverLocation(driverId) {
    const driver = await prisma.deliveryDriver.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        name: true,
        phone: true,
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
        status: true,
      },
    });

    if (!driver) return null;

    return {
      ...driver,
      isOnline: driver.lastLocationUpdate &&
        (Date.now() - driver.lastLocationUpdate.getTime()) < 5 * 60 * 1000,
    };
  }

  /**
   * Obtener recorrido completo de una orden
   */
  async getOrderRoute(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: { select: { lat: true, lng: true, name: true, address: true } },
        deliveryPerson: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!order) throw new Error('Orden no encontrada');

    // Obtener historial de ubicaciones
    const locationHistory = await prisma.driverLocationHistory.findMany({
      where: { orderId },
      orderBy: { timestamp: 'asc' },
    });

    // Puntos clave
    const storeLocation = { lat: order.store.lat, lng: order.store.lng };
    const deliveryLocation = { lat: order.deliveryLat, lng: order.deliveryLng };

    // Construir ruta
    const route = locationHistory.map(loc => ({
      lat: loc.lat,
      lng: loc.lng,
      timestamp: loc.timestamp,
    }));

    // Calcular distancia total recorrida
    let totalDistance = 0;
    for (let i = 1; i < route.length; i++) {
      totalDistance += this.calculateDistance(
        route[i - 1].lat, route[i - 1].lng,
        route[i].lat, route[i].lng
      );
    }

    // Calcular tiempo de entrega
    let deliveryTime = null;
    if (order.pickedUpAt && order.deliveredAt) {
      deliveryTime = Math.round((order.deliveredAt - order.pickedUpAt) / 60000);
    }

    return {
      orderId,
      orderNumber: order.orderNumber,
      status: order.status,
      driver: order.deliveryPerson,
      store: {
        ...storeLocation,
        name: order.store.name,
        address: order.store.address,
      },
      destination: {
        ...deliveryLocation,
        address: order.deliveryAddress,
      },
      route,
      currentLocation: route.length > 0 ? route[route.length - 1] : null,
      stats: {
        totalDistance: Math.round(totalDistance * 10) / 10,
        deliveryTime,
        pointsRecorded: route.length,
      },
      eta: order.currentEta,
      deliveryFee: this.DELIVERY_FEE,
    };
  }

  /**
   * Tracking en tiempo real para cliente
   */
  async getOrderTrackingData(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: { select: { lat: true, lng: true, name: true, address: true, phone: true } },
        deliveryPerson: { select: { id: true, name: true, phone: true, currentLat: true, currentLng: true } },
      },
    });

    if (!order) throw new Error('Orden no encontrada');

    // Últimos puntos del recorrido (para dibujar línea)
    const recentRoute = await prisma.driverLocationHistory.findMany({
      where: { orderId },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    const timeline = this.buildTimeline(order);

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        deliveryFee: this.DELIVERY_FEE,
        createdAt: order.createdAt,
      },
      store: {
        name: order.store.name,
        address: order.store.address,
        phone: order.store.phone,
        location: { lat: order.store.lat, lng: order.store.lng },
      },
      destination: {
        address: order.deliveryAddress,
        location: { lat: order.deliveryLat, lng: order.deliveryLng },
      },
      driver: order.deliveryPerson ? {
        name: order.deliveryPerson.name,
        phone: order.deliveryPerson.phone,
        location: order.deliveryPerson.currentLat ? {
          lat: order.deliveryPerson.currentLat,
          lng: order.deliveryPerson.currentLng,
        } : null,
      } : null,
      route: recentRoute.reverse().map(p => ({ lat: p.lat, lng: p.lng })),
      eta: order.currentEta,
      timeline,
    };
  }

  buildTimeline(order) {
    const steps = [
      { key: 'confirmed', label: 'Pedido confirmado', icon: '✅', time: order.confirmedAt },
      { key: 'preparing', label: 'Preparando', icon: '👨‍🍳', time: order.preparingAt },
      { key: 'ready', label: 'Listo para envío', icon: '📦', time: order.readyAt },
      { key: 'picked_up', label: 'Recogido por repartidor', icon: '🛵', time: order.pickedUpAt },
      { key: 'on_the_way', label: 'En camino', icon: '🚗', time: order.onTheWayAt },
      { key: 'delivered', label: 'Entregado', icon: '🎉', time: order.deliveredAt },
    ];

    const statusOrder = ['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered'];
    const currentIndex = statusOrder.indexOf(order.status);

    return steps.map((step, i) => ({
      ...step,
      completed: step.time !== null,
      current: statusOrder[i + 1] === order.status,
      time: step.time ? new Date(step.time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : null,
    }));
  }

  /**
   * Iniciar tracking de orden
   */
  async startOrderTracking(orderId, driverId) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryPersonId: driverId,
        pickedUpAt: new Date(),
        status: 'on_the_way',
        onTheWayAt: new Date(),
      },
    });

    // Obtener ubicación inicial del repartidor
    const driver = await prisma.deliveryDriver.findUnique({ where: { id: driverId } });
    if (driver?.currentLat) {
      await this.updateLocation(driverId, driver.currentLat, driver.currentLng, orderId);
    }

    logger.info({ orderId, driverId }, 'Order tracking started');
    return { success: true };
  }

  /**
   * Completar entrega
   */
  async completeDelivery(orderId, driverId, lat, lng) {
    // Guardar última ubicación
    await this.updateLocation(driverId, lat, lng, orderId);

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'delivered',
        deliveredAt: new Date(),
        deliveryCompletedLat: lat,
        deliveryCompletedLng: lng,
      },
    });

    // Liberar repartidor
    await prisma.deliveryDriver.update({
      where: { id: driverId },
      data: { status: 'available', currentOrderId: null },
    });

    logger.info({ orderId, driverId }, 'Delivery completed');
    return { success: true };
  }

  /**
   * Obtener repartidores activos
   */
  async getActiveDrivers(storeId) {
    const drivers = await prisma.deliveryDriver.findMany({
      where: {
        storeId,
        status: { in: ['available', 'busy'] },
        lastLocationUpdate: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      include: {
        currentOrder: { select: { orderNumber: true, deliveryAddress: true } },
      },
    });

    return drivers.map(d => ({
      id: d.id,
      name: d.name,
      status: d.status,
      location: d.currentLat ? { lat: d.currentLat, lng: d.currentLng } : null,
      currentOrder: d.currentOrder,
      lastUpdate: d.lastLocationUpdate,
    }));
  }

  /**
   * Historial de entregas del repartidor
   */
  async getDriverDeliveryHistory(driverId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const deliveries = await prisma.order.findMany({
      where: {
        deliveryPersonId: driverId,
        deliveredAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        store: { select: { name: true } },
      },
      orderBy: { deliveredAt: 'asc' },
    });

    // Obtener rutas
    const deliveriesWithRoutes = await Promise.all(
      deliveries.map(async (order) => {
        const route = await prisma.driverLocationHistory.findMany({
          where: { orderId: order.id },
          orderBy: { timestamp: 'asc' },
        });

        let distance = 0;
        for (let i = 1; i < route.length; i++) {
          distance += this.calculateDistance(
            route[i - 1].lat, route[i - 1].lng,
            route[i].lat, route[i].lng
          );
        }

        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          storeName: order.store.name,
          deliveryAddress: order.deliveryAddress,
          pickedUpAt: order.pickedUpAt,
          deliveredAt: order.deliveredAt,
          deliveryTime: order.pickedUpAt && order.deliveredAt
            ? Math.round((order.deliveredAt - order.pickedUpAt) / 60000)
            : null,
          distance: Math.round(distance * 10) / 10,
          earnings: this.DELIVERY_FEE,
        };
      })
    );

    return {
      date,
      totalDeliveries: deliveries.length,
      totalEarnings: deliveries.length * this.DELIVERY_FEE,
      totalDistance: deliveriesWithRoutes.reduce((sum, d) => sum + d.distance, 0),
      deliveries: deliveriesWithRoutes,
    };
  }

  /**
   * Obtener tarifa de delivery (siempre fija)
   */
  getDeliveryFee() {
    return this.DELIVERY_FEE;
  }
}

export const driverTrackingService = new DriverTrackingService();
export default driverTrackingService;

