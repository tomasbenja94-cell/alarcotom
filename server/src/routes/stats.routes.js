import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// Convertir objeto a snake_case
function objectToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(objectToSnakeCase);
  if (typeof obj !== 'object') return obj;
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = objectToSnakeCase(value);
  }
  return result;
}

// ========== ESTADÍSTICAS DE VENTAS ==========
router.get('/stats/sales', 
  authenticateAdmin,
  authorize('admin', 'super_admin', 'operator'),
  async (req, res, next) => {
    try {
      // Obtener todos los pedidos
      const orders = await prisma.order.findMany({
        include: {
          items: true
        },
        orderBy: { createdAt: 'desc' }
      });
      
      // Filtrar pedidos entregados y completados (excluir cancelados y pendientes sin pago)
      // Prisma devuelve campos en camelCase (paymentStatus, deliveryFee, etc.)
      const completedOrders = orders.filter(o => {
        const status = (o.status || '').toLowerCase();
        const paymentStatus = (o.paymentStatus || '').toLowerCase();
        
        // Excluir cancelados
        if (status === 'cancelled' || status === 'cancelado') return false;
        
        // Incluir pedidos entregados
        if (status === 'delivered' || status === 'entregado') return true;
        
        // Incluir pedidos completados
        if (status === 'completed' || status === 'completado') return true;
        
        // Incluir pedidos con pago completado (aunque estén en proceso)
        if (paymentStatus === 'completed' || paymentStatus === 'completado') return true;
        
        // Incluir pedidos que están en proceso y tienen pago confirmado
        if ((status === 'preparing' || status === 'ready' || status === 'assigned' || status === 'in_transit' || 
             status === 'confirmed') && paymentStatus === 'completed') return true;
        
        return false;
      });
      
      // Estadísticas generales
      const totalRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const totalOrders = completedOrders.length;
      const totalDeliveryFee = completedOrders.reduce((sum, o) => sum + (Number(o.deliveryFee) || 0), 0);
      const totalSubtotal = completedOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
      
      // Estadísticas por método de pago
      const paymentMethods = {};
      completedOrders.forEach(order => {
        const method = order.paymentMethod || 'desconocido';
        if (!paymentMethods[method]) {
          paymentMethods[method] = { count: 0, total: 0 };
        }
        paymentMethods[method].count++;
        paymentMethods[method].total += Number(order.total) || 0;
      });
      
      // Estadísticas por día (últimos 30 días)
      const last30Days = [];
      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const dayOrders = completedOrders.filter(o => {
          const orderDate = new Date(o.createdAt);
          return orderDate >= date && orderDate < nextDate;
        });
        
        const dayRevenue = dayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const dayOrdersCount = dayOrders.length;
        
        last30Days.push({
          date: date.toISOString().split('T')[0],
          revenue: dayRevenue,
          orders: dayOrdersCount
        });
      }
      
      // Estadísticas por hora (últimas 24 horas)
      const last24Hours = [];
      for (let i = 23; i >= 0; i--) {
        const hour = new Date(today);
        hour.setHours(hour.getHours() - i, 0, 0, 0);
        
        const nextHour = new Date(hour);
        nextHour.setHours(nextHour.getHours() + 1);
        
        const hourOrders = completedOrders.filter(o => {
          const orderDate = new Date(o.createdAt);
          return orderDate >= hour && orderDate < nextHour;
        });
        
        const hourRevenue = hourOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const hourOrdersCount = hourOrders.length;
        
        last24Hours.push({
          hour: hour.getHours(),
          revenue: hourRevenue,
          orders: hourOrdersCount
        });
      }
      
      // Productos más vendidos
      const productSales = {};
      completedOrders.forEach(order => {
        order.items.forEach(item => {
          // Prisma devuelve campos en camelCase (productName, no product_name)
          const productName = item.productName || 'Producto desconocido';
          if (!productSales[productName]) {
            productSales[productName] = {
              name: productName,
              quantity: 0,
              revenue: 0
            };
          }
          productSales[productName].quantity += Number(item.quantity) || 0;
          productSales[productName].revenue += Number(item.subtotal) || 0;
        });
      });
      
      const topProducts = Object.values(productSales)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);
      
      // Estadísticas del mes actual
      const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const currentMonthOrders = completedOrders.filter(o => {
        const orderDate = new Date(o.createdAt);
        return orderDate >= currentMonthStart;
      });
      
      const currentMonthRevenue = currentMonthOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const currentMonthOrdersCount = currentMonthOrders.length;
      
      // Estadísticas de la semana actual
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      const weekOrders = completedOrders.filter(o => {
        const orderDate = new Date(o.createdAt);
        return orderDate >= weekStart;
      });
      
      const weekRevenue = weekOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const weekOrdersCount = weekOrders.length;
      
      // Promedio de pedido
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      
      // Estadísticas de delivery vs pickup
      const deliveryOrders = completedOrders.filter(o => (o.deliveryFee || 0) > 0);
      const pickupOrders = completedOrders.filter(o => (o.deliveryFee || 0) === 0);
      
      const stats = {
        total: {
          revenue: totalRevenue,
          orders: totalOrders,
          deliveryFee: totalDeliveryFee,
          subtotal: totalSubtotal,
          averageOrderValue
        },
        currentMonth: {
          revenue: currentMonthRevenue,
          orders: currentMonthOrdersCount
        },
        currentWeek: {
          revenue: weekRevenue,
          orders: weekOrdersCount
        },
        paymentMethods: Object.entries(paymentMethods).map(([method, data]) => ({
          method,
          count: data.count,
          total: data.total,
          percentage: totalRevenue > 0 ? (data.total / totalRevenue) * 100 : 0
        })),
        delivery: {
          deliveryOrders: deliveryOrders.length,
          pickupOrders: pickupOrders.length,
          deliveryRevenue: deliveryOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0),
          pickupRevenue: pickupOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
        },
        last30Days,
        last24Hours,
        topProducts
      };
      
      res.json(objectToSnakeCase(stats));
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      next(error);
    }
  }
);

export default router;

