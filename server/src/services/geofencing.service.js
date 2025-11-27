/**
 * Sistema de Geofencing para Delivery
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class GeofencingService {
  /**
   * Verificar si un punto está dentro de un polígono
   */
  pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Calcular distancia entre dos puntos (Haversine)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Verificar cobertura de delivery
   */
  async checkDeliveryCoverage(storeId, lat, lng) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { lat: true, lng: true, deliveryRadius: true },
    });

    if (!store) throw new Error('Tienda no encontrada');

    // Verificar zonas de delivery
    const zones = await prisma.deliveryZone.findMany({
      where: { storeId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    for (const zone of zones) {
      const polygon = JSON.parse(zone.polygon);
      if (this.pointInPolygon([lng, lat], polygon)) {
        return {
          covered: true,
          zone: zone.name,
          deliveryFee: zone.deliveryFee,
          minOrder: zone.minOrder,
          estimatedTime: zone.estimatedTime,
        };
      }
    }

    // Fallback: verificar radio simple
    if (store.lat && store.lng && store.deliveryRadius) {
      const distance = this.calculateDistance(store.lat, store.lng, lat, lng);
      if (distance <= store.deliveryRadius) {
        return {
          covered: true,
          zone: 'default',
          deliveryFee: this.calculateFeeByDistance(distance),
          distance: Math.round(distance * 10) / 10,
          estimatedTime: Math.round(distance * 5 + 15), // ~5 min/km + 15 min prep
        };
      }
    }

    return {
      covered: false,
      message: 'Lo sentimos, no llegamos a tu ubicación',
      nearestZone: await this.findNearestZone(storeId, lat, lng),
    };
  }

  /**
   * Calcular costo de envío por distancia
   */
  calculateFeeByDistance(distance) {
    if (distance <= 1) return 100;
    if (distance <= 3) return 200;
    if (distance <= 5) return 350;
    if (distance <= 8) return 500;
    return 700;
  }

  /**
   * Encontrar zona más cercana
   */
  async findNearestZone(storeId, lat, lng) {
    const zones = await prisma.deliveryZone.findMany({
      where: { storeId, isActive: true },
    });

    let nearest = null;
    let minDistance = Infinity;

    for (const zone of zones) {
      const polygon = JSON.parse(zone.polygon);
      // Calcular distancia al centroide del polígono
      const centroid = this.calculateCentroid(polygon);
      const distance = this.calculateDistance(lat, lng, centroid[1], centroid[0]);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearest = { name: zone.name, distance: Math.round(distance * 10) / 10 };
      }
    }

    return nearest;
  }

  /**
   * Calcular centroide de un polígono
   */
  calculateCentroid(polygon) {
    let x = 0, y = 0;
    polygon.forEach(([px, py]) => {
      x += px;
      y += py;
    });
    return [x / polygon.length, y / polygon.length];
  }

  /**
   * Crear zona de delivery
   */
  async createDeliveryZone(storeId, zoneData) {
    const { name, polygon, deliveryFee, minOrder, estimatedTime, priority } = zoneData;

    const zone = await prisma.deliveryZone.create({
      data: {
        storeId,
        name,
        polygon: JSON.stringify(polygon),
        deliveryFee,
        minOrder: minOrder || 0,
        estimatedTime: estimatedTime || 30,
        priority: priority || 0,
        isActive: true,
      },
    });

    logger.info({ zoneId: zone.id, name }, 'Delivery zone created');
    return zone;
  }

  /**
   * Obtener todas las zonas de una tienda
   */
  async getStoreZones(storeId) {
    const zones = await prisma.deliveryZone.findMany({
      where: { storeId },
      orderBy: { priority: 'asc' },
    });

    return zones.map(z => ({
      ...z,
      polygon: JSON.parse(z.polygon),
    }));
  }

  /**
   * Tracking de repartidor
   */
  async updateDeliveryLocation(deliveryPersonId, lat, lng) {
    await prisma.deliveryPerson.update({
      where: { id: deliveryPersonId },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastLocationUpdate: new Date(),
      },
    });

    // Verificar si entró/salió de alguna zona
    const activeOrder = await prisma.order.findFirst({
      where: { deliveryPersonId, status: 'on_the_way' },
    });

    if (activeOrder) {
      const distance = this.calculateDistance(
        lat, lng,
        activeOrder.deliveryLat,
        activeOrder.deliveryLng
      );

      // Notificar si está cerca (< 500m)
      if (distance < 0.5) {
        logger.info({ orderId: activeOrder.id }, 'Delivery person arriving soon');
        // Emitir evento para notificación push
      }
    }

    return { success: true };
  }

  /**
   * Estimar tiempo de llegada
   */
  async estimateArrival(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { deliveryPerson: true },
    });

    if (!order?.deliveryPerson?.currentLat) {
      return { eta: null, message: 'Ubicación del repartidor no disponible' };
    }

    const distance = this.calculateDistance(
      order.deliveryPerson.currentLat,
      order.deliveryPerson.currentLng,
      order.deliveryLat,
      order.deliveryLng
    );

    // Estimar ~3 min/km en ciudad
    const etaMinutes = Math.round(distance * 3);

    return {
      distance: Math.round(distance * 10) / 10,
      etaMinutes,
      eta: new Date(Date.now() + etaMinutes * 60 * 1000),
    };
  }
}

export const geofencingService = new GeofencingService();
export default geofencingService;

