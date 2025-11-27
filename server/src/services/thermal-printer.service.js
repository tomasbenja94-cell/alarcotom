import logger from '../utils/logger.js';

/**
 * Servicio de integración con impresoras térmicas ESC/POS
 * Compatible con: Epson, Star, Bixolon, etc.
 */
class ThermalPrinterService {
  constructor() {
    this.printers = new Map();
    this.ESC = '\x1b';
    this.GS = '\x1d';
  }

  /**
   * Registrar impresora
   */
  registerPrinter(printerId, config) {
    this.printers.set(printerId, {
      ...config,
      status: 'READY'
    });
    logger.info({ printerId }, 'Impresora registrada');
  }

  /**
   * Comandos ESC/POS básicos
   */
  get commands() {
    return {
      INIT: this.ESC + '@',
      ALIGN_LEFT: this.ESC + 'a' + '\x00',
      ALIGN_CENTER: this.ESC + 'a' + '\x01',
      ALIGN_RIGHT: this.ESC + 'a' + '\x02',
      BOLD_ON: this.ESC + 'E' + '\x01',
      BOLD_OFF: this.ESC + 'E' + '\x00',
      DOUBLE_HEIGHT: this.GS + '!' + '\x10',
      DOUBLE_WIDTH: this.GS + '!' + '\x20',
      NORMAL_SIZE: this.GS + '!' + '\x00',
      CUT: this.GS + 'V' + '\x00',
      PARTIAL_CUT: this.GS + 'V' + '\x01',
      FEED_LINE: '\n',
      OPEN_DRAWER: this.ESC + 'p' + '\x00' + '\x19' + '\xfa'
    };
  }

  /**
   * Construir ticket de cocina
   */
  buildKitchenTicket(order) {
    const { commands } = this;
    let data = '';

    data += commands.INIT;
    data += commands.ALIGN_CENTER;
    data += commands.DOUBLE_HEIGHT;
    data += commands.BOLD_ON;
    data += '*** COCINA ***\n';
    data += commands.NORMAL_SIZE;
    data += `PEDIDO #${order.orderNumber}\n`;
    data += order.type === 'DELIVERY' ? 'DELIVERY\n' : 'RETIRO\n';
    data += commands.BOLD_OFF;
    data += '--------------------------------\n';
    
    data += commands.ALIGN_LEFT;
    data += commands.BOLD_ON;
    
    order.items.forEach(item => {
      data += commands.DOUBLE_WIDTH;
      data += `${item.quantity}x ${item.name}\n`;
      data += commands.NORMAL_SIZE;
      if (item.notes) {
        data += `   -> ${item.notes}\n`;
      }
      if (item.modifiers?.length) {
        item.modifiers.forEach(mod => {
          data += `   + ${mod}\n`;
        });
      }
    });

    data += commands.BOLD_OFF;
    data += '--------------------------------\n';
    
    if (order.notes) {
      data += `NOTAS: ${order.notes}\n`;
      data += '--------------------------------\n';
    }

    data += commands.ALIGN_CENTER;
    data += new Date().toLocaleTimeString() + '\n';
    data += '\n\n\n';
    data += commands.CUT;

    return data;
  }

  /**
   * Construir ticket de delivery
   */
  buildDeliveryTicket(order) {
    const { commands } = this;
    let data = '';

    data += commands.INIT;
    data += commands.ALIGN_CENTER;
    data += commands.BOLD_ON;
    data += commands.DOUBLE_HEIGHT;
    data += '*** DELIVERY ***\n';
    data += commands.NORMAL_SIZE;
    data += `PEDIDO #${order.orderNumber}\n`;
    data += commands.BOLD_OFF;
    data += '================================\n';

    data += commands.ALIGN_LEFT;
    data += `Cliente: ${order.customer.name}\n`;
    data += `Tel: ${order.customer.phone}\n`;
    data += '--------------------------------\n';
    data += commands.BOLD_ON;
    data += `Direccion:\n`;
    data += commands.BOLD_OFF;
    data += `${order.address.street}\n`;
    if (order.address.reference) {
      data += `Ref: ${order.address.reference}\n`;
    }
    data += '--------------------------------\n';

    order.items.forEach(item => {
      data += `${item.quantity}x ${item.name}\n`;
    });

    data += '================================\n';
    data += commands.BOLD_ON;
    data += commands.ALIGN_RIGHT;
    data += `TOTAL: $${order.total}\n`;
    data += commands.BOLD_OFF;
    data += commands.ALIGN_LEFT;
    data += `Pago: ${order.paymentMethod}\n`;
    data += '\n\n\n';
    data += commands.CUT;

    return data;
  }

  /**
   * Construir recibo de cliente
   */
  buildCustomerReceipt(order, store) {
    const { commands } = this;
    let data = '';

    data += commands.INIT;
    data += commands.ALIGN_CENTER;
    data += commands.BOLD_ON;
    data += commands.DOUBLE_HEIGHT;
    data += `${store.name}\n`;
    data += commands.NORMAL_SIZE;
    data += commands.BOLD_OFF;
    data += `${store.address}\n`;
    data += `Tel: ${store.phone}\n`;
    data += '================================\n';
    data += `Pedido #${order.orderNumber}\n`;
    data += new Date(order.createdAt).toLocaleString() + '\n';
    data += '--------------------------------\n';

    data += commands.ALIGN_LEFT;
    order.items.forEach(item => {
      const itemTotal = item.quantity * item.unitPrice;
      data += `${item.quantity}x ${item.name}\n`;
      data += `   $${item.unitPrice} x ${item.quantity} = $${itemTotal}\n`;
    });

    data += '--------------------------------\n';
    data += commands.ALIGN_RIGHT;
    data += `Subtotal: $${order.subtotal}\n`;
    
    if (order.type === 'DELIVERY') {
      data += `Envio: $4000\n`;
    }
    
    if (order.discount > 0) {
      data += `Descuento: -$${order.discount}\n`;
    }

    data += commands.BOLD_ON;
    data += commands.DOUBLE_HEIGHT;
    data += `TOTAL: $${order.total}\n`;
    data += commands.NORMAL_SIZE;
    data += commands.BOLD_OFF;

    data += commands.ALIGN_CENTER;
    data += '\n';
    data += 'Gracias por su compra!\n';
    data += '\n\n\n';
    data += commands.CUT;

    return data;
  }

  /**
   * Enviar a impresora (placeholder - requiere driver específico)
   */
  async print(printerId, data) {
    const printer = this.printers.get(printerId);
    if (!printer) {
      throw new Error('Impresora no encontrada');
    }

    // Aquí iría la integración con el driver de la impresora
    // Opciones: node-escpos, node-thermal-printer, USB directo, red TCP/IP
    
    logger.info({ printerId, dataLength: data.length }, 'Imprimiendo ticket');
    
    // Simulación
    return { success: true, printerId };
  }

  /**
   * Abrir cajón de dinero
   */
  async openCashDrawer(printerId) {
    const data = this.commands.OPEN_DRAWER;
    return this.print(printerId, data);
  }

  /**
   * Test de impresora
   */
  async testPrint(printerId) {
    const { commands } = this;
    let data = '';
    data += commands.INIT;
    data += commands.ALIGN_CENTER;
    data += 'TEST DE IMPRESORA\n';
    data += '================================\n';
    data += 'Impresora funcionando correctamente\n';
    data += new Date().toLocaleString() + '\n';
    data += '\n\n\n';
    data += commands.CUT;
    
    return this.print(printerId, data);
  }
}

export const thermalPrinterService = new ThermalPrinterService();
export default thermalPrinterService;
