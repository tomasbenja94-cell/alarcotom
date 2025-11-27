/**
 * WebSocket Service para notificaciones en tiempo real
 * Soporta múltiples tiendas (storeId)
 */

import { WebSocketServer } from 'ws';
import logger from '../utils/logger.js';

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // storeId -> Set<ws>
    this.adminClients = new Set(); // Superadmins (ven todo)
  }

  /**
   * Inicializar WebSocket server
   */
  init(server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const storeId = url.searchParams.get('storeId');
      const role = url.searchParams.get('role');
      const token = url.searchParams.get('token');

      // TODO: Validar token JWT aquí
      
      if (role === 'super_admin') {
        this.adminClients.add(ws);
        logger.info({ role }, 'SuperAdmin conectado a WebSocket');
      } else if (storeId) {
        if (!this.clients.has(storeId)) {
          this.clients.set(storeId, new Set());
        }
        this.clients.get(storeId).add(ws);
        logger.info({ storeId }, 'Cliente conectado a WebSocket');
      }

      ws.on('close', () => {
        if (role === 'super_admin') {
          this.adminClients.delete(ws);
        } else if (storeId && this.clients.has(storeId)) {
          this.clients.get(storeId).delete(ws);
        }
      });

      ws.on('error', (error) => {
        logger.error({ error: error.message }, 'WebSocket error');
      });

      // Enviar mensaje de bienvenida
      ws.send(JSON.stringify({ type: 'connected', storeId }));
    });

    logger.info('WebSocket server iniciado en /ws');
  }

  /**
   * Enviar mensaje a una tienda específica
   */
  sendToStore(storeId, event, data) {
    const message = JSON.stringify({ type: event, data, storeId, timestamp: new Date().toISOString() });
    
    // Enviar a clientes de la tienda
    if (this.clients.has(storeId)) {
      this.clients.get(storeId).forEach(ws => {
        if (ws.readyState === 1) { // OPEN
          ws.send(message);
        }
      });
    }

    // Enviar también a superadmins
    this.adminClients.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    });
  }

  /**
   * Notificar nuevo pedido
   */
  notifyNewOrder(order) {
    this.sendToStore(order.storeId, 'NEW_ORDER', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: order.total,
      status: order.status
    });
  }

  /**
   * Notificar cambio de estado de pedido
   */
  notifyOrderUpdate(order) {
    this.sendToStore(order.storeId, 'ORDER_UPDATE', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryStatus: order.deliveryStatus
    });
  }

  /**
   * Notificar alerta de stock
   */
  notifyStockAlert(storeId, product) {
    this.sendToStore(storeId, 'STOCK_ALERT', {
      productId: product.id,
      productName: product.name,
      currentStock: product.currentStock
    });
  }

  /**
   * Broadcast a todas las tiendas (para superadmin)
   */
  broadcast(event, data) {
    const message = JSON.stringify({ type: event, data, timestamp: new Date().toISOString() });
    
    this.clients.forEach((clients) => {
      clients.forEach(ws => {
        if (ws.readyState === 1) {
          ws.send(message);
        }
      });
    });

    this.adminClients.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    });
  }
}

// Singleton
export const wsService = new WebSocketService();
export default wsService;

