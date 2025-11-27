import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class DriverCustomerChatService {
  /**
   * Iniciar chat entre repartidor y cliente para un pedido
   */
  async startDeliveryChat(orderId) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { customer: true, driver: true }
      });

      if (!order || !order.driverId) {
        throw new Error('Pedido sin repartidor asignado');
      }

      const chat = await prisma.deliveryChat.create({
        data: {
          orderId,
          customerId: order.customerId,
          driverId: order.driverId,
          status: 'ACTIVE',
          startedAt: new Date()
        }
      });

      logger.info({ chatId: chat.id, orderId }, 'Chat delivery iniciado');
      return chat;
    } catch (error) {
      logger.error({ error, orderId }, 'Error iniciando chat delivery');
      throw error;
    }
  }

  /**
   * Enviar mensaje
   */
  async sendMessage(chatId, senderId, senderType, content) {
    try {
      // senderType: 'DRIVER' o 'CUSTOMER'
      const message = await prisma.deliveryChatMessage.create({
        data: {
          chatId,
          senderId,
          senderType,
          content,
          sentAt: new Date()
        }
      });

      // Actualizar última actividad
      await prisma.deliveryChat.update({
        where: { id: chatId },
        data: { lastMessageAt: new Date() }
      });

      return message;
    } catch (error) {
      logger.error({ error, chatId }, 'Error enviando mensaje');
      throw error;
    }
  }

  /**
   * Obtener chat activo de un pedido
   */
  async getActiveChat(orderId) {
    return prisma.deliveryChat.findFirst({
      where: { orderId, status: 'ACTIVE' },
      include: {
        messages: { orderBy: { sentAt: 'asc' } },
        customer: { select: { name: true, phone: true } },
        driver: { select: { name: true, phone: true } }
      }
    });
  }

  /**
   * Obtener mensajes del chat
   */
  async getMessages(chatId) {
    return prisma.deliveryChatMessage.findMany({
      where: { chatId },
      orderBy: { sentAt: 'asc' }
    });
  }

  /**
   * Marcar mensajes como leídos
   */
  async markAsRead(chatId, readerId) {
    await prisma.deliveryChatMessage.updateMany({
      where: {
        chatId,
        senderId: { not: readerId },
        readAt: null
      },
      data: { readAt: new Date() }
    });
  }

  /**
   * Cerrar chat (cuando se entrega el pedido)
   */
  async closeChat(orderId) {
    const chat = await prisma.deliveryChat.findFirst({
      where: { orderId, status: 'ACTIVE' }
    });

    if (chat) {
      await prisma.deliveryChat.update({
        where: { id: chat.id },
        data: { status: 'CLOSED', closedAt: new Date() }
      });
    }
  }

  /**
   * Mensajes rápidos predefinidos para el repartidor
   */
  getQuickMessages() {
    return [
      { id: 1, text: 'Estoy en camino 🚗' },
      { id: 2, text: 'Llego en 5 minutos' },
      { id: 3, text: 'Estoy afuera, ¿puede salir?' },
      { id: 4, text: 'No encuentro la dirección, ¿puede darme más indicaciones?' },
      { id: 5, text: '¿Hay algún punto de referencia?' },
      { id: 6, text: 'Llegué, lo espero en la entrada' },
      { id: 7, text: 'Hay mucho tráfico, me demoro un poco más' },
      { id: 8, text: '¿Puede llamarme por favor?' }
    ];
  }

  /**
   * Mensajes rápidos para el cliente
   */
  getCustomerQuickMessages() {
    return [
      { id: 1, text: 'Ok, te espero' },
      { id: 2, text: 'Ya salgo' },
      { id: 3, text: 'Es la casa con portón negro' },
      { id: 4, text: 'Estoy en el edificio, subo al lobby' },
      { id: 5, text: '¿Cuánto falta?' },
      { id: 6, text: 'Gracias!' }
    ];
  }
}

export const driverCustomerChatService = new DriverCustomerChatService();
export default driverCustomerChatService;

