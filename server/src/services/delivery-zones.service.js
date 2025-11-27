/**
 * Sistema de Zonas de Cobertura de Delivery
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DeliveryZonesService {
  // Tarifa fija de delivery - siempre $4000
  DELIVERY_FEE = 4000;

  /**
   * Obtener tarifa de delivery (siempre fija)
   */
  getDeliveryFee() {
    return this.DELIVERY_FEE;
  }

  /**
   * Crear zona de delivery
   */
  async createZone(storeId, zoneData) {
    const {
      name, polygon, deliveryFee, minOrder, estimatedMinutes,
      isActive, priority, maxOrders,
    } = zoneData;

    const zone = await prisma.deliveryZone.create({
      data: {
        storeId,
        name,
        polygon: JSON.stringify(polygon), // Array de [lat, lng]
        deliveryFee,
        minOrder: minOrder || 0,
        estimatedMinutes: estimatedMinutes || 30,
        isActive: isActive ?? true,
        priority: priority || 0,
        maxOrdersPerHour: maxOrders,
      },
    });

    logger.info({ zoneId: zone.id, name }, 'Delivery zone created');
    return zone;
  }

  /**
   * Verificar si dirección está en zona de cobertura
   */
  async checkCoverage(storeId, lat, lng) {
    const zones = await prisma.deliveryZone.findMany({
      where: { storeId, isActive: true },
      orderBy: { priority: 'desc' },
    });

    for (const zone of zones) {
      const polygon = JSON.parse(zone.polygon);
      if (this.isPointInPolygon([lat, lng], polygon)) {
        return {
          covered: true,
          zone: {
            id: zone.id,
            name: zone.name,
            deliveryFee: zone.deliveryFee,
            minOrder: zone.minOrder,
            estimatedMinutes: zone.estimatedMinutes,
          },
        };
      }
    }

    return { covered: false, zone: null };
  }

  isPointInPolygon(point, polygon) {
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
   * Calcular costo de delivery - TARIFA FIJA $4000
   */
  async calculateDeliveryFee(storeId, lat, lng) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new Error('Tienda no encontrada');

    // Verificar cobertura
    const coverage = await this.checkCoverage(storeId, lat, lng);
    
    // Calcular distancia para estimar tiempo
    const distance = this.calculateDistance(store.lat, store.lng, lat, lng);
    
    // Verificar distancia máxima
    const config = await prisma.deliveryConfig.findUnique({ where: { storeId } });
    const maxDistance = config?.maxDistance || 15; // 15km por defecto

    if (distance > maxDistance) {
      return { covered: false, message: 'Fuera del área de cobertura' };
    }

    // Estimar tiempo basado en distancia
    const estimatedMinutes = Math.round(15 + (distance * 3));

    return {
      fee: this.DELIVERY_FEE, // Siempre $4000
      distance: Math.round(distance * 10) / 10,
      estimatedMinutes,
      zone: coverage.covered ? coverage.zone.name : null,
      minOrder: config?.minOrder || 0,
    };
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  toRad(deg) { return deg * Math.PI / 180; }

  /**
   * Obtener todas las zonas de una tienda
   */
  async getZones(storeId) {
    const zones = await prisma.deliveryZone.findMany({
      where: { storeId },
      orderBy: { priority: 'desc' },
    });

    return zones.map(z => ({
      ...z,
      polygon: JSON.parse(z.polygon),
    }));
  }

  /**
   * Actualizar zona
   */
  async updateZone(zoneId, updates) {
    if (updates.polygon) {
      updates.polygon = JSON.stringify(updates.polygon);
    }

    return prisma.deliveryZone.update({
      where: { id: zoneId },
      data: updates,
    });
  }

  /**
   * Eliminar zona
   */
  async deleteZone(zoneId) {
    await prisma.deliveryZone.delete({ where: { id: zoneId } });
    return { success: true };
  }

  /**
   * Configurar delivery por distancia
   */
  async setDistanceConfig(storeId, config) {
    const { baseFee, perKmFee, maxDistance, minOrder, freeDeliveryOver } = config;

    return prisma.deliveryConfig.upsert({
      where: { storeId },
      update: { baseFee, perKmFee, maxDistance, minOrder, freeDeliveryOver },
      create: { storeId, baseFee, perKmFee, maxDistance, minOrder, freeDeliveryOver },
    });
  }

  /**
   * Obtener mapa de cobertura para mostrar al cliente
   */
  async getCoverageMap(storeId) {
    const [store, zones, config] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId } }),
      this.getZones(storeId),
      prisma.deliveryConfig.findUnique({ where: { storeId } }),
    ]);

    return {
      storeLocation: { lat: store.lat, lng: store.lng },
      storeName: store.name,
      zones: zones.filter(z => z.isActive).map(z => ({
        name: z.name,
        polygon: z.polygon,
        deliveryFee: z.deliveryFee,
        color: this.getZoneColor(z.deliveryFee),
      })),
      maxDistance: config?.maxDistance || 10,
      baseFee: config?.baseFee || 200,
    };
  }

  getZoneColor(fee) {
    if (fee === 0) return '#22c55e'; // Verde - gratis
    if (fee <= 200) return '#3b82f6'; // Azul
    if (fee <= 400) return '#f59e0b'; // Amarillo
    return '#ef4444'; // Rojo
  }

  /**
   * Estadísticas de zonas
   */
  async getZoneStats(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        type: 'delivery',
        createdAt: { gte: startDate },
        status: 'delivered',
      },
      select: { deliveryZoneId: true, total: true, deliveryFee: true },
    });

    const zones = await this.getZones(storeId);
    const stats = {};

    zones.forEach(z => {
      stats[z.id] = { name: z.name, orders: 0, revenue: 0, deliveryFees: 0 };
    });

    orders.forEach(o => {
      if (o.deliveryZoneId && stats[o.deliveryZoneId]) {
        stats[o.deliveryZoneId].orders++;
        stats[o.deliveryZoneId].revenue += o.total;
        stats[o.deliveryZoneId].deliveryFees += o.deliveryFee || 0;
      }
    });

    return Object.values(stats).sort((a, b) => b.orders - a.orders);
  }

  /**
   * Sugerir nuevas zonas basado en pedidos
   */
  async suggestNewZones(storeId) {
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        type: 'delivery',
        deliveryZoneId: null,
        deliveryLat: { not: null },
      },
      select: { deliveryLat: true, deliveryLng: true },
      take: 500,
    });

    // Agrupar por área (simplificado)
    const clusters = {};
    orders.forEach(o => {
      const key = `${Math.round(o.deliveryLat * 100) / 100},${Math.round(o.deliveryLng * 100) / 100}`;
      clusters[key] = (clusters[key] || 0) + 1;
    });

    return Object.entries(clusters)
      .filter(([, count]) => count >= 5)
      .map(([coords, count]) => {
        const [lat, lng] = coords.split(',').map(Number);
        return { lat, lng, orderCount: count };
      })
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 5);
  }
}

export const deliveryZonesService = new DeliveryZonesService();
export default deliveryZonesService;
