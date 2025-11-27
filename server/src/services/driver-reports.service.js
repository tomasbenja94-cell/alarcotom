import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DriverReportsService {
  /**
   * Estadísticas de repartidor
   */
  async getDriverStats(driverId, startDate, endDate) {
    const deliveries = await prisma.order.findMany({
      where: {
        driverId,
        status: 'DELIVERED',
        deliveredAt: { gte: startDate, lte: endDate }
      }
    });

    const totalDeliveries = deliveries.length;
    const totalEarnings = totalDeliveries * 4000; // Tarifa fija

    // Calcular tiempo promedio de entrega
    const deliveryTimes = deliveries
      .filter(d => d.pickedUpAt && d.deliveredAt)
      .map(d => (new Date(d.deliveredAt) - new Date(d.pickedUpAt)) / 60000);

    const avgDeliveryTime = deliveryTimes.length > 0
      ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length
      : 0;

    // Calificaciones
    const ratings = await prisma.review.findMany({
      where: {
        order: { driverId },
        createdAt: { gte: startDate, lte: endDate }
      }
    });

    const avgRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.deliveryRating, 0) / ratings.length
      : 0;

    return {
      driverId,
      period: { startDate, endDate },
      totalDeliveries,
      totalEarnings,
      avgDeliveryTime: Math.round(avgDeliveryTime),
      avgRating: avgRating.toFixed(1),
      totalRatings: ratings.length,
      deliveriesPerDay: this.groupByDay(deliveries)
    };
  }

  /**
   * Ranking de repartidores
   */
  async getDriverRanking(storeId, period = 'week') {
    const startDate = new Date();
    if (period === 'week') startDate.setDate(startDate.getDate() - 7);
    else if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);

    const drivers = await prisma.user.findMany({
      where: { role: 'DRIVER', storeId }
    });

    const rankings = await Promise.all(
      drivers.map(async driver => {
        const stats = await this.getDriverStats(driver.id, startDate, new Date());
        return {
          driverId: driver.id,
          name: driver.name,
          ...stats
        };
      })
    );

    return rankings.sort((a, b) => b.totalDeliveries - a.totalDeliveries);
  }

  /**
   * Reporte diario de repartidor
   */
  async getDailyReport(driverId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const deliveries = await prisma.order.findMany({
      where: {
        driverId,
        deliveredAt: { gte: startOfDay, lte: endOfDay }
      },
      include: { customer: true, address: true },
      orderBy: { deliveredAt: 'asc' }
    });

    return {
      date,
      driverId,
      deliveries: deliveries.map(d => ({
        orderNumber: d.orderNumber,
        customer: d.customer?.name,
        address: d.address?.street || d.deliveryAddress,
        pickedUpAt: d.pickedUpAt,
        deliveredAt: d.deliveredAt,
        duration: d.pickedUpAt && d.deliveredAt 
          ? Math.round((new Date(d.deliveredAt) - new Date(d.pickedUpAt)) / 60000)
          : null
      })),
      totalDeliveries: deliveries.length,
      totalEarnings: deliveries.length * 4000
    };
  }

  /**
   * Distancia recorrida (estimada)
   */
  async getDistanceTraveled(driverId, startDate, endDate) {
    const locations = await prisma.driverLocation.findMany({
      where: {
        driverId,
        timestamp: { gte: startDate, lte: endDate }
      },
      orderBy: { timestamp: 'asc' }
    });

    let totalDistance = 0;
    for (let i = 1; i < locations.length; i++) {
      totalDistance += this.calculateDistance(
        locations[i - 1].lat, locations[i - 1].lng,
        locations[i].lat, locations[i].lng
      );
    }

    return { totalKm: (totalDistance / 1000).toFixed(2) };
  }

  /**
   * Calcular distancia entre dos puntos (Haversine)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radio de la Tierra en metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  groupByDay(deliveries) {
    const byDay = {};
    deliveries.forEach(d => {
      const day = new Date(d.deliveredAt).toISOString().split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
    });
    return byDay;
  }
}

export const driverReportsService = new DriverReportsService();
export default driverReportsService;

