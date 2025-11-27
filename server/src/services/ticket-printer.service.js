import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class TicketPrinterService {
  /**
   * Generar ticket de pedido para cocina
   */
  async generateKitchenTicket(orderId) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { product: true } },
          customer: true,
          store: true
        }
      });

      if (!order) throw new Error('Pedido no encontrado');

      const ticket = {
        type: 'KITCHEN',
        orderId: order.id,
        orderNumber: order.orderNumber,
        timestamp: new Date().toISOString(),
        orderType: order.type, // DELIVERY o PICKUP
        items: order.items.map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          notes: item.notes || '',
          modifiers: item.modifiers || []
        })),
        customerName: order.customer?.name || 'Cliente',
        notes: order.notes || '',
        priority: order.priority || 'NORMAL'
      };

      logger.info({ orderId, ticketType: 'KITCHEN' }, 'Ticket de cocina generado');
      return ticket;
    } catch (error) {
      logger.error({ error, orderId }, 'Error generando ticket de cocina');
      throw error;
    }
  }

  /**
   * Generar ticket de entrega para repartidor
   */
  async generateDeliveryTicket(orderId) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { product: true } },
          customer: true,
          store: true,
          address: true
        }
      });

      if (!order) throw new Error('Pedido no encontrado');

      const deliveryFee = 4000; // Tarifa fija

      const ticket = {
        type: 'DELIVERY',
        orderId: order.id,
        orderNumber: order.orderNumber,
        timestamp: new Date().toISOString(),
        customer: {
          name: order.customer?.name || 'Cliente',
          phone: order.customer?.phone || ''
        },
        address: {
          street: order.address?.street || order.deliveryAddress,
          reference: order.address?.reference || '',
          instructions: order.deliveryInstructions || ''
        },
        items: order.items.map(item => ({
          name: item.product.name,
          quantity: item.quantity
        })),
        totals: {
          subtotal: order.subtotal,
          deliveryFee: deliveryFee,
          total: order.total
        },
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus
      };

      logger.info({ orderId, ticketType: 'DELIVERY' }, 'Ticket de entrega generado');
      return ticket;
    } catch (error) {
      logger.error({ error, orderId }, 'Error generando ticket de entrega');
      throw error;
    }
  }

  /**
   * Generar ticket/recibo para cliente
   */
  async generateCustomerReceipt(orderId) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { product: true } },
          customer: true,
          store: true
        }
      });

      if (!order) throw new Error('Pedido no encontrado');

      const receipt = {
        type: 'RECEIPT',
        storeName: order.store?.name || 'Tienda',
        storePhone: order.store?.phone || '',
        orderNumber: order.orderNumber,
        date: order.createdAt,
        items: order.items.map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice
        })),
        subtotal: order.subtotal,
        deliveryFee: order.type === 'DELIVERY' ? 4000 : 0,
        discount: order.discount || 0,
        total: order.total,
        paymentMethod: order.paymentMethod,
        customerName: order.customer?.name || 'Cliente'
      };

      return receipt;
    } catch (error) {
      logger.error({ error, orderId }, 'Error generando recibo');
      throw error;
    }
  }

  /**
   * Formatear ticket para impresora térmica (ESC/POS)
   */
  formatForThermalPrinter(ticket, printerWidth = 48) {
    const lines = [];
    const separator = '-'.repeat(printerWidth);
    
    const center = (text) => {
      const padding = Math.max(0, Math.floor((printerWidth - text.length) / 2));
      return ' '.repeat(padding) + text;
    };

    if (ticket.type === 'KITCHEN') {
      lines.push(center('*** COCINA ***'));
      lines.push(center(`PEDIDO #${ticket.orderNumber}`));
      lines.push(center(ticket.orderType === 'DELIVERY' ? 'DELIVERY' : 'RETIRO'));
      lines.push(separator);
      
      ticket.items.forEach(item => {
        lines.push(`${item.quantity}x ${item.name}`);
        if (item.notes) lines.push(`   -> ${item.notes}`);
        if (item.modifiers?.length) {
          item.modifiers.forEach(mod => lines.push(`   + ${mod}`));
        }
      });
      
      if (ticket.notes) {
        lines.push(separator);
        lines.push(`NOTAS: ${ticket.notes}`);
      }
      
      lines.push(separator);
      lines.push(center(new Date(ticket.timestamp).toLocaleTimeString()));
    }

    if (ticket.type === 'DELIVERY') {
      lines.push(center('*** DELIVERY ***'));
      lines.push(center(`PEDIDO #${ticket.orderNumber}`));
      lines.push(separator);
      lines.push(`Cliente: ${ticket.customer.name}`);
      lines.push(`Tel: ${ticket.customer.phone}`);
      lines.push(separator);
      lines.push(`Direccion: ${ticket.address.street}`);
      if (ticket.address.reference) lines.push(`Ref: ${ticket.address.reference}`);
      if (ticket.address.instructions) lines.push(`Inst: ${ticket.address.instructions}`);
      lines.push(separator);
      
      ticket.items.forEach(item => {
        lines.push(`${item.quantity}x ${item.name}`);
      });
      
      lines.push(separator);
      lines.push(`Total: $${ticket.totals.total}`);
      lines.push(`Pago: ${ticket.paymentMethod}`);
    }

    return lines.join('\n');
  }
}

export const ticketPrinterService = new TicketPrinterService();
export default ticketPrinterService;

