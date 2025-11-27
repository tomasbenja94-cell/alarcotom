/**
 * Sistema de Gestión de Proveedores
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class SuppliersService {
  /**
   * Registrar proveedor
   */
  async createSupplier(storeId, supplierData) {
    const {
      name, contactName, email, phone, address,
      taxId, paymentTerms, deliveryDays, minOrder, notes,
    } = supplierData;

    const supplier = await prisma.supplier.create({
      data: {
        storeId,
        name,
        contactName,
        email,
        phone,
        address,
        taxId,
        paymentTerms: paymentTerms || 30,
        deliveryDays: deliveryDays || [],
        minOrder,
        notes,
        rating: 5,
        isActive: true,
      },
    });

    logger.info({ supplierId: supplier.id, name }, 'Supplier created');
    return supplier;
  }

  /**
   * Crear orden de compra
   */
  async createPurchaseOrder(storeId, supplierId, items) {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new Error('Proveedor no encontrado');

    const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        storeId,
        supplierId,
        orderNumber,
        items: JSON.stringify(items),
        subtotal,
        tax: Math.round(subtotal * 0.21),
        total: Math.round(subtotal * 1.21),
        status: 'pending',
        expectedDelivery: this.calculateExpectedDelivery(supplier.deliveryDays),
      },
    });

    logger.info({ purchaseOrderId: purchaseOrder.id, orderNumber }, 'Purchase order created');
    return purchaseOrder;
  }

  calculateExpectedDelivery(deliveryDays) {
    if (!deliveryDays?.length) return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    
    const today = new Date().getDay();
    const daysUntilDelivery = deliveryDays
      .map(d => (d - today + 7) % 7 || 7)
      .sort((a, b) => a - b)[0];
    
    return new Date(Date.now() + daysUntilDelivery * 24 * 60 * 60 * 1000);
  }

  /**
   * Recibir pedido
   */
  async receivePurchaseOrder(purchaseOrderId, receivedItems) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
    if (!po) throw new Error('Orden no encontrada');

    const items = JSON.parse(po.items);
    let allReceived = true;

    items.forEach(item => {
      const received = receivedItems.find(r => r.productId === item.productId);
      item.receivedQuantity = received?.quantity || 0;
      item.receivedAt = received ? new Date() : null;
      if (item.receivedQuantity < item.quantity) allReceived = false;
    });

    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        items: JSON.stringify(items),
        status: allReceived ? 'received' : 'partial',
        receivedAt: new Date(),
      },
    });

    // Actualizar inventario
    for (const item of receivedItems) {
      await prisma.inventory.upsert({
        where: { productId_storeId: { productId: item.productId, storeId: po.storeId } },
        update: { quantity: { increment: item.quantity } },
        create: { productId: item.productId, storeId: po.storeId, quantity: item.quantity },
      });
    }

    logger.info({ purchaseOrderId }, 'Purchase order received');
    return { success: true, status: allReceived ? 'received' : 'partial' };
  }

  /**
   * Evaluar proveedor
   */
  async rateSupplier(supplierId, orderId, ratings) {
    const { quality, delivery, price, communication } = ratings;

    await prisma.supplierRating.create({
      data: {
        supplierId,
        purchaseOrderId: orderId,
        quality,
        delivery,
        price,
        communication,
        overall: (quality + delivery + price + communication) / 4,
      },
    });

    // Actualizar rating promedio
    const allRatings = await prisma.supplierRating.findMany({ where: { supplierId } });
    const avgRating = allRatings.reduce((sum, r) => sum + r.overall, 0) / allRatings.length;

    await prisma.supplier.update({
      where: { id: supplierId },
      data: { rating: Math.round(avgRating * 10) / 10 },
    });

    return { success: true, newRating: avgRating };
  }

  /**
   * Obtener proveedores con estadísticas
   */
  async getSuppliers(storeId) {
    const suppliers = await prisma.supplier.findMany({
      where: { storeId, isActive: true },
      include: {
        purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 5 },
        _count: { select: { purchaseOrders: true } },
      },
    });

    return suppliers.map(s => ({
      ...s,
      totalOrders: s._count.purchaseOrders,
      lastOrder: s.purchaseOrders[0]?.createdAt,
    }));
  }

  /**
   * Análisis de costos por proveedor
   */
  async analyzeCosts(storeId, productId) {
    const orders = await prisma.purchaseOrder.findMany({
      where: { storeId, status: { in: ['received', 'partial'] } },
      include: { supplier: true },
    });

    const priceHistory = [];

    orders.forEach(order => {
      const items = JSON.parse(order.items);
      const item = items.find(i => i.productId === productId);
      if (item) {
        priceHistory.push({
          supplierId: order.supplierId,
          supplierName: order.supplier.name,
          unitCost: item.unitCost,
          date: order.createdAt,
        });
      }
    });

    const bySupplier = {};
    priceHistory.forEach(p => {
      if (!bySupplier[p.supplierId]) {
        bySupplier[p.supplierId] = { name: p.supplierName, prices: [] };
      }
      bySupplier[p.supplierId].prices.push(p.unitCost);
    });

    return Object.entries(bySupplier).map(([id, data]) => ({
      supplierId: id,
      supplierName: data.name,
      avgPrice: Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length),
      minPrice: Math.min(...data.prices),
      maxPrice: Math.max(...data.prices),
      orderCount: data.prices.length,
    })).sort((a, b) => a.avgPrice - b.avgPrice);
  }

  /**
   * Generar recomendación de compra
   */
  async generatePurchaseRecommendation(storeId) {
    const lowStockItems = await prisma.inventory.findMany({
      where: {
        storeId,
        quantity: { lte: prisma.inventory.fields.reorderPoint },
      },
      include: { product: true },
    });

    const recommendations = [];

    for (const item of lowStockItems) {
      const bestSupplier = await this.findBestSupplier(storeId, item.productId);
      
      recommendations.push({
        productId: item.productId,
        productName: item.product.name,
        currentStock: item.quantity,
        reorderPoint: item.reorderPoint,
        suggestedQuantity: item.reorderQuantity || 10,
        bestSupplier,
      });
    }

    return recommendations;
  }

  async findBestSupplier(storeId, productId) {
    const analysis = await this.analyzeCosts(storeId, productId);
    if (analysis.length === 0) return null;

    // Combinar precio y rating
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: analysis.map(a => a.supplierId) } },
    });

    const scored = analysis.map(a => {
      const supplier = suppliers.find(s => s.id === a.supplierId);
      const priceScore = 100 - (a.avgPrice / analysis[0].avgPrice * 50);
      const ratingScore = (supplier?.rating || 3) * 10;
      return { ...a, rating: supplier?.rating, score: priceScore + ratingScore };
    });

    return scored.sort((a, b) => b.score - a.score)[0];
  }
}

export const suppliersService = new SuppliersService();
export default suppliersService;

