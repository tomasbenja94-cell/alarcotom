/**
 * Sistema de Exportación Masiva de Datos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DataExportService {
  /**
   * Exportar pedidos
   */
  async exportOrders(storeId, filters = {}) {
    const { startDate, endDate, status } = filters;

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        ...(startDate && { createdAt: { gte: new Date(startDate) } }),
        ...(endDate && { createdAt: { lte: new Date(endDate) } }),
        ...(status && { status }),
      },
      include: {
        items: { include: { product: { select: { name: true } } } },
        customer: { select: { name: true, phone: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map(order => ({
      'Número': order.orderNumber,
      'Fecha': order.createdAt.toISOString(),
      'Cliente': order.customer?.name || order.customerName,
      'Teléfono': order.customer?.phone || order.customerPhone,
      'Email': order.customer?.email || '',
      'Productos': order.items.map(i => `${i.quantity}x ${i.product?.name || i.productName}`).join(', '),
      'Subtotal': order.subtotal,
      'Envío': order.deliveryFee,
      'Propina': order.tip || 0,
      'Total': order.total,
      'Estado': order.status,
      'Método de Pago': order.paymentMethod,
      'Dirección': order.deliveryAddress || '',
      'Notas': order.notes || '',
    }));
  }

  /**
   * Exportar productos
   */
  async exportProducts(storeId) {
    const products = await prisma.product.findMany({
      where: { storeId },
      include: { category: { select: { name: true } } },
    });

    return products.map(p => ({
      'ID': p.id,
      'Nombre': p.name,
      'Descripción': p.description || '',
      'Categoría': p.category?.name || '',
      'Precio': p.price,
      'Disponible': p.isAvailable ? 'Sí' : 'No',
      'Alérgenos': (p.allergens || []).join(', '),
      'Creado': p.createdAt.toISOString(),
    }));
  }

  /**
   * Exportar clientes
   */
  async exportCustomers(storeId) {
    const customers = await prisma.customer.findMany({
      where: {
        orders: { some: { storeId } },
      },
      include: {
        _count: { select: { orders: true } },
        loyalty: true,
      },
    });

    return customers.map(c => ({
      'ID': c.id,
      'Nombre': c.name,
      'Teléfono': c.phone,
      'Email': c.email || '',
      'Total Pedidos': c._count.orders,
      'Puntos': c.loyalty?.totalPoints || 0,
      'Nivel': c.loyalty?.tier || 'bronze',
      'Registrado': c.createdAt.toISOString(),
    }));
  }

  /**
   * Exportar ventas por período
   */
  async exportSalesReport(storeId, startDate, endDate) {
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'delivered',
        createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      include: { items: true },
    });

    // Agrupar por día
    const salesByDay = {};
    orders.forEach(order => {
      const day = order.createdAt.toISOString().split('T')[0];
      if (!salesByDay[day]) {
        salesByDay[day] = { orders: 0, revenue: 0, items: 0 };
      }
      salesByDay[day].orders++;
      salesByDay[day].revenue += order.total;
      salesByDay[day].items += order.items.reduce((sum, i) => sum + i.quantity, 0);
    });

    return Object.entries(salesByDay).map(([date, data]) => ({
      'Fecha': date,
      'Pedidos': data.orders,
      'Ingresos': data.revenue,
      'Productos Vendidos': data.items,
      'Ticket Promedio': Math.round(data.revenue / data.orders),
    }));
  }

  /**
   * Exportar inventario
   */
  async exportInventory(storeId) {
    const products = await prisma.product.findMany({
      where: { storeId },
      include: { category: true },
    });

    return products.map(p => ({
      'Producto': p.name,
      'Categoría': p.category?.name || '',
      'Stock Actual': p.stock || 0,
      'Stock Mínimo': p.minStock || 0,
      'Estado': (p.stock || 0) <= (p.minStock || 0) ? '⚠️ Bajo' : '✅ OK',
      'Precio': p.price,
      'Costo': p.cost || 0,
      'Margen': p.price > 0 ? Math.round(((p.price - (p.cost || 0)) / p.price) * 100) : 0,
    }));
  }

  /**
   * Convertir a CSV
   */
  toCSV(data) {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(h => {
        const val = row[h];
        // Escapar comillas y envolver en comillas si contiene comas
        const str = String(val ?? '').replace(/"/g, '""');
        return str.includes(',') || str.includes('"') ? `"${str}"` : str;
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Generar exportación completa
   */
  async generateFullExport(storeId) {
    const [orders, products, customers] = await Promise.all([
      this.exportOrders(storeId),
      this.exportProducts(storeId),
      this.exportCustomers(storeId),
    ]);

    return {
      orders: this.toCSV(orders),
      products: this.toCSV(products),
      customers: this.toCSV(customers),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Programar exportación automática
   */
  async scheduleExport(storeId, config) {
    const { type, frequency, email } = config;

    await prisma.scheduledExport.create({
      data: {
        storeId,
        exportType: type,
        frequency, // 'daily', 'weekly', 'monthly'
        recipientEmail: email,
        isActive: true,
      },
    });

    logger.info({ storeId, type, frequency }, 'Export scheduled');
    return { success: true };
  }
}

export const dataExportService = new DataExportService();
export default dataExportService;

