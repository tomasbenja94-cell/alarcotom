/**
 * Sistema de Exportación de Datos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class ExportService {
  /**
   * Exportar pedidos a formato CSV/Excel
   */
  async exportOrders(storeId, filters = {}) {
    const { startDate, endDate, status, type } = filters;

    const where = { storeId };
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    
    if (status) where.status = status;
    if (type) where.type = type;

    const orders = await prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true, email: true } },
        items: { include: { product: { select: { name: true } } } },
        deliveryPerson: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transformar a formato tabular
    const rows = orders.map(order => ({
      'Número de Pedido': order.orderNumber,
      'Fecha': order.createdAt.toLocaleDateString('es-AR'),
      'Hora': order.createdAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      'Cliente': order.customer?.name || 'N/A',
      'Teléfono': order.customer?.phone || 'N/A',
      'Tipo': order.type === 'delivery' ? 'Delivery' : 'Retiro',
      'Dirección': order.deliveryAddress || 'N/A',
      'Items': order.items.map(i => `${i.quantity}x ${i.product?.name || i.productName}`).join('; '),
      'Subtotal': order.subtotal,
      'Envío': order.deliveryFee || 0,
      'Descuento': order.discount || 0,
      'Propina': order.tipAmount || 0,
      'Total': order.total,
      'Método de Pago': this.translatePaymentMethod(order.paymentMethod),
      'Estado': this.translateStatus(order.status),
      'Repartidor': order.deliveryPerson?.name || 'N/A',
      'Notas': order.notes || '',
    }));

    return {
      data: rows,
      csv: this.toCSV(rows),
      filename: `pedidos_${new Date().toISOString().split('T')[0]}.csv`,
    };
  }

  translatePaymentMethod(method) {
    const map = {
      cash: 'Efectivo',
      card: 'Tarjeta',
      transfer: 'Transferencia',
      mercadopago: 'Mercado Pago',
    };
    return map[method] || method;
  }

  translateStatus(status) {
    const map = {
      pending: 'Pendiente',
      confirmed: 'Confirmado',
      preparing: 'Preparando',
      ready: 'Listo',
      on_the_way: 'En camino',
      delivered: 'Entregado',
      cancelled: 'Cancelado',
    };
    return map[status] || status;
  }

  toCSV(rows) {
    if (rows.length === 0) return '';

    const headers = Object.keys(rows[0]);
    const csvRows = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => {
          let val = row[h];
          if (val === null || val === undefined) val = '';
          val = String(val).replace(/"/g, '""');
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            val = `"${val}"`;
          }
          return val;
        }).join(',')
      ),
    ];

    return csvRows.join('\n');
  }

  /**
   * Exportar productos
   */
  async exportProducts(storeId) {
    const products = await prisma.product.findMany({
      where: { storeId },
      include: { category: true },
      orderBy: { category: { name: 'asc' } },
    });

    const rows = products.map(p => ({
      'ID': p.id,
      'Nombre': p.name,
      'Descripción': p.description || '',
      'Categoría': p.category?.name || 'Sin categoría',
      'Precio': p.price,
      'Precio con Descuento': p.discountPrice || '',
      'Disponible': p.isAvailable ? 'Sí' : 'No',
      'Destacado': p.isFeatured ? 'Sí' : 'No',
      'Pedidos Totales': p.orderCount || 0,
    }));

    return {
      data: rows,
      csv: this.toCSV(rows),
      filename: `productos_${new Date().toISOString().split('T')[0]}.csv`,
    };
  }

  /**
   * Exportar clientes
   */
  async exportCustomers(storeId) {
    const customers = await prisma.customer.findMany({
      where: { orders: { some: { storeId } } },
      include: {
        _count: { select: { orders: true } },
        orders: {
          where: { storeId, status: 'delivered' },
          select: { total: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const rows = customers.map(c => ({
      'Nombre': c.name || 'N/A',
      'Teléfono': c.phone || 'N/A',
      'Email': c.email || 'N/A',
      'Total de Pedidos': c._count.orders,
      'Último Pedido': c.orders[0]?.total || 0,
      'Puntos de Lealtad': c.loyaltyPoints || 0,
      'Nivel': c.loyaltyTier || 'bronze',
      'Fecha de Registro': c.createdAt.toLocaleDateString('es-AR'),
    }));

    return {
      data: rows,
      csv: this.toCSV(rows),
      filename: `clientes_${new Date().toISOString().split('T')[0]}.csv`,
    };
  }

  /**
   * Exportar reporte de ventas
   */
  async exportSalesReport(storeId, startDate, endDate) {
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'delivered',
        createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      include: { items: { include: { product: true } } },
    });

    // Agrupar por día
    const dailySales = {};
    orders.forEach(order => {
      const date = order.createdAt.toISOString().split('T')[0];
      if (!dailySales[date]) {
        dailySales[date] = { orders: 0, revenue: 0, items: 0, delivery: 0, pickup: 0 };
      }
      dailySales[date].orders++;
      dailySales[date].revenue += order.total;
      dailySales[date].items += order.items.reduce((sum, i) => sum + i.quantity, 0);
      if (order.type === 'delivery') dailySales[date].delivery++;
      else dailySales[date].pickup++;
    });

    const rows = Object.entries(dailySales)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        'Fecha': date,
        'Pedidos': data.orders,
        'Ingresos': data.revenue,
        'Items Vendidos': data.items,
        'Delivery': data.delivery,
        'Retiro': data.pickup,
        'Ticket Promedio': Math.round(data.revenue / data.orders),
      }));

    // Totales
    const totals = {
      'Fecha': 'TOTAL',
      'Pedidos': rows.reduce((s, r) => s + r['Pedidos'], 0),
      'Ingresos': rows.reduce((s, r) => s + r['Ingresos'], 0),
      'Items Vendidos': rows.reduce((s, r) => s + r['Items Vendidos'], 0),
      'Delivery': rows.reduce((s, r) => s + r['Delivery'], 0),
      'Retiro': rows.reduce((s, r) => s + r['Retiro'], 0),
      'Ticket Promedio': Math.round(rows.reduce((s, r) => s + r['Ingresos'], 0) / rows.reduce((s, r) => s + r['Pedidos'], 0)),
    };

    rows.push(totals);

    return {
      data: rows,
      csv: this.toCSV(rows),
      filename: `ventas_${startDate}_${endDate}.csv`,
    };
  }

  /**
   * Exportar productos más vendidos
   */
  async exportTopProducts(storeId, startDate, endDate, limit = 50) {
    const sales = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          storeId,
          status: 'delivered',
          createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
        },
      },
      _sum: { quantity: true, subtotal: true },
      _count: true,
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    const products = await prisma.product.findMany({
      where: { id: { in: sales.map(s => s.productId) } },
      include: { category: true },
    });

    const rows = sales.map((s, i) => {
      const product = products.find(p => p.id === s.productId);
      return {
        'Ranking': i + 1,
        'Producto': product?.name || 'N/A',
        'Categoría': product?.category?.name || 'N/A',
        'Unidades Vendidas': s._sum.quantity,
        'Ingresos': s._sum.subtotal,
        'Pedidos': s._count,
      };
    });

    return {
      data: rows,
      csv: this.toCSV(rows),
      filename: `top_productos_${startDate}_${endDate}.csv`,
    };
  }

  /**
   * Generar reporte completo
   */
  async generateFullReport(storeId, startDate, endDate) {
    const [orders, sales, products, customers] = await Promise.all([
      this.exportOrders(storeId, { startDate, endDate }),
      this.exportSalesReport(storeId, startDate, endDate),
      this.exportTopProducts(storeId, startDate, endDate),
      this.exportCustomers(storeId),
    ]);

    return {
      orders,
      sales,
      products,
      customers,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const exportService = new ExportService();
export default exportService;
