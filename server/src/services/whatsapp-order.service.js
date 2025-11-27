/**
 * Sistema de Confirmación de Pedido por WhatsApp
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class WhatsAppOrderService {
  DELIVERY_FEE = 4000;

  /**
   * Generar link de WhatsApp para confirmar pedido
   */
  async generateOrderWhatsAppLink(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        store: true,
        customer: true,
      },
    });

    if (!order) throw new Error('Pedido no encontrado');

    const message = this.buildOrderMessage(order);
    const phone = this.formatPhone(order.store.whatsappNumber || order.store.phone);

    return {
      url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      phone,
      message,
    };
  }

  /**
   * Construir mensaje de pedido
   */
  buildOrderMessage(order) {
    const lines = [];

    lines.push(`🛒 *NUEVO PEDIDO #${order.orderNumber}*`);
    lines.push('');
    
    // Info del cliente
    lines.push(`👤 *Cliente:* ${order.customer?.name || 'Cliente'}`);
    if (order.customer?.phone) {
      lines.push(`📱 *Tel:* ${order.customer.phone}`);
    }
    lines.push('');

    // Tipo de pedido
    if (order.type === 'delivery') {
      lines.push(`🚗 *DELIVERY*`);
      lines.push(`📍 ${order.deliveryAddress}`);
      if (order.deliveryInstructions) {
        lines.push(`📝 ${order.deliveryInstructions}`);
      }
    } else {
      lines.push(`🏃 *RETIRO EN LOCAL*`);
    }
    lines.push('');

    // Items
    lines.push('📦 *PRODUCTOS:*');
    lines.push('─────────────');
    
    order.items.forEach(item => {
      let line = `${item.quantity}x ${item.product?.name || item.productName}`;
      
      if (item.modifiers) {
        const mods = typeof item.modifiers === 'string' 
          ? JSON.parse(item.modifiers) 
          : item.modifiers;
        if (mods.length > 0) {
          line += ` (${mods.map(m => m.name).join(', ')})`;
        }
      }
      
      line += ` - $${item.subtotal.toLocaleString()}`;
      lines.push(line);

      if (item.notes) {
        lines.push(`   📝 ${item.notes}`);
      }
    });

    lines.push('─────────────');
    lines.push('');

    // Totales
    const subtotal = order.items.reduce((sum, i) => sum + i.subtotal, 0);
    lines.push(`📊 *Subtotal:* $${subtotal.toLocaleString()}`);
    
    if (order.type === 'delivery') {
      lines.push(`🚗 *Envío:* $${this.DELIVERY_FEE.toLocaleString()}`);
    }

    if (order.discount > 0) {
      lines.push(`🏷️ *Descuento:* -$${order.discount.toLocaleString()}`);
    }

    if (order.tipAmount > 0) {
      lines.push(`💝 *Propina:* $${order.tipAmount.toLocaleString()}`);
    }

    lines.push('');
    lines.push(`💰 *TOTAL: $${order.total.toLocaleString()}*`);
    lines.push('');

    // Método de pago
    const paymentMethods = {
      cash: '💵 Efectivo',
      card: '💳 Tarjeta',
      transfer: '🏦 Transferencia',
      mercadopago: '📱 Mercado Pago',
    };
    lines.push(`💳 *Pago:* ${paymentMethods[order.paymentMethod] || order.paymentMethod}`);

    if (order.paymentMethod === 'cash' && order.cashAmount) {
      lines.push(`   Paga con: $${order.cashAmount.toLocaleString()}`);
      lines.push(`   Vuelto: $${(order.cashAmount - order.total).toLocaleString()}`);
    }

    // Notas generales
    if (order.notes) {
      lines.push('');
      lines.push(`📝 *Notas:* ${order.notes}`);
    }

    lines.push('');
    lines.push('─────────────');
    lines.push('_Enviado desde la app_');

    return lines.join('\n');
  }

  /**
   * Generar link para que cliente envíe pedido
   */
  async generateCustomerOrderLink(storeId, cartItems, customerInfo, orderDetails) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new Error('Tienda no encontrada');

    const message = this.buildCustomerOrderMessage(store, cartItems, customerInfo, orderDetails);
    const phone = this.formatPhone(store.whatsappNumber || store.phone);

    return {
      url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      phone,
      message,
    };
  }

  buildCustomerOrderMessage(store, cartItems, customerInfo, orderDetails) {
    const lines = [];

    lines.push(`🛒 *Hola! Quiero hacer un pedido*`);
    lines.push('');

    // Info del cliente
    lines.push(`👤 *Nombre:* ${customerInfo.name}`);
    lines.push(`📱 *Tel:* ${customerInfo.phone}`);
    lines.push('');

    // Tipo de pedido
    if (orderDetails.type === 'delivery') {
      lines.push(`🚗 *DELIVERY*`);
      lines.push(`📍 ${orderDetails.address}`);
      if (orderDetails.instructions) {
        lines.push(`📝 ${orderDetails.instructions}`);
      }
    } else {
      lines.push(`🏃 *RETIRO EN LOCAL*`);
    }
    lines.push('');

    // Items
    lines.push('📦 *Mi pedido:*');
    
    let subtotal = 0;
    cartItems.forEach(item => {
      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;

      let line = `• ${item.quantity}x ${item.name} - $${itemTotal.toLocaleString()}`;
      lines.push(line);

      if (item.notes) {
        lines.push(`  _${item.notes}_`);
      }
    });

    lines.push('');
    lines.push(`💰 *Subtotal:* $${subtotal.toLocaleString()}`);
    
    if (orderDetails.type === 'delivery') {
      lines.push(`🚗 *Envío:* $${this.DELIVERY_FEE.toLocaleString()}`);
      lines.push(`💰 *TOTAL:* $${(subtotal + this.DELIVERY_FEE).toLocaleString()}`);
    } else {
      lines.push(`💰 *TOTAL:* $${subtotal.toLocaleString()}`);
    }

    lines.push('');

    // Método de pago
    const paymentMethods = {
      cash: '💵 Efectivo',
      card: '💳 Tarjeta',
      transfer: '🏦 Transferencia',
    };
    lines.push(`💳 *Pago con:* ${paymentMethods[orderDetails.paymentMethod] || orderDetails.paymentMethod}`);

    if (orderDetails.paymentMethod === 'cash' && orderDetails.cashAmount) {
      lines.push(`   Voy a pagar con $${orderDetails.cashAmount.toLocaleString()}`);
    }

    return lines.join('\n');
  }

  formatPhone(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (!cleaned.startsWith('54')) {
      cleaned = '54' + cleaned;
    }
    return cleaned;
  }

  /**
   * Parsear pedido recibido por WhatsApp
   */
  parseIncomingOrder(message) {
    // Intentar extraer información del mensaje
    const result = {
      items: [],
      customerName: null,
      customerPhone: null,
      address: null,
      paymentMethod: null,
      notes: null,
    };

    // Buscar nombre
    const nameMatch = message.match(/nombre[:\s]+(.+)/i);
    if (nameMatch) result.customerName = nameMatch[1].trim();

    // Buscar teléfono
    const phoneMatch = message.match(/tel[éefono]*[:\s]+(\d[\d\s-]+)/i);
    if (phoneMatch) result.customerPhone = phoneMatch[1].replace(/\s|-/g, '');

    // Buscar dirección
    const addressMatch = message.match(/(?:dirección|direccion|📍)[:\s]+(.+)/i);
    if (addressMatch) result.address = addressMatch[1].trim();

    // Buscar items (formato: Nx producto)
    const itemMatches = message.matchAll(/(\d+)\s*x\s+([^$\n-]+)/gi);
    for (const match of itemMatches) {
      result.items.push({
        quantity: parseInt(match[1]),
        name: match[2].trim(),
      });
    }

    return result;
  }

  /**
   * Mensaje de confirmación para el cliente
   */
  buildConfirmationMessage(order) {
    const lines = [];

    lines.push(`✅ *¡Pedido #${order.orderNumber} confirmado!*`);
    lines.push('');
    lines.push(`Gracias ${order.customer?.name?.split(' ')[0] || 'Cliente'}! 🙌`);
    lines.push('');
    lines.push(`Tu pedido está siendo preparado.`);
    lines.push('');

    if (order.type === 'delivery') {
      lines.push(`🚗 Te lo enviamos a:`);
      lines.push(`📍 ${order.deliveryAddress}`);
      lines.push('');
      lines.push(`⏱️ Tiempo estimado: 30-45 min`);
    } else {
      lines.push(`🏃 Retirá en:`);
      lines.push(`📍 ${order.store?.address}`);
      lines.push('');
      lines.push(`⏱️ Estará listo en: 20-30 min`);
    }

    lines.push('');
    lines.push(`💰 Total: $${order.total.toLocaleString()}`);
    lines.push('');
    lines.push(`Te avisamos cuando esté listo! 👍`);

    return lines.join('\n');
  }

  /**
   * Mensaje de pedido en camino
   */
  buildOnTheWayMessage(order, driverName = null) {
    const lines = [];

    lines.push(`🚗 *¡Tu pedido está en camino!*`);
    lines.push('');
    lines.push(`Pedido #${order.orderNumber}`);
    
    if (driverName) {
      lines.push(`🛵 Repartidor: ${driverName}`);
    }

    lines.push('');
    lines.push(`⏱️ Llegada estimada: 15-20 min`);
    lines.push('');
    lines.push(`📍 ${order.deliveryAddress}`);

    return lines.join('\n');
  }

  /**
   * Mensaje de pedido entregado
   */
  buildDeliveredMessage(order) {
    const lines = [];

    lines.push(`✨ *¡Pedido entregado!*`);
    lines.push('');
    lines.push(`Esperamos que disfrutes tu pedido #${order.orderNumber} 🍽️`);
    lines.push('');
    lines.push(`¿Cómo estuvo todo? Tu opinión nos importa:`);
    lines.push(`⭐ ${process.env.APP_URL}/rate/${order.id}`);
    lines.push('');
    lines.push(`¡Gracias por elegirnos! 💜`);

    return lines.join('\n');
  }
}

export const whatsappOrderService = new WhatsAppOrderService();
export default whatsappOrderService;

