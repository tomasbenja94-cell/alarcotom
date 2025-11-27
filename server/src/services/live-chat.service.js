import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class LiveChatService {
  /**
   * Iniciar conversación de chat
   */
  async startConversation(customerId, orderId = null, subject = 'Consulta general') {
    try {
      const conversation = await prisma.chatConversation.create({
        data: {
          customerId,
          orderId,
          subject,
          status: 'OPEN',
          startedAt: new Date()
        }
      });

      logger.info({ conversationId: conversation.id, customerId }, 'Conversación iniciada');
      return conversation;
    } catch (error) {
      logger.error({ error, customerId }, 'Error iniciando conversación');
      throw error;
    }
  }

  /**
   * Enviar mensaje
   */
  async sendMessage(conversationId, senderId, senderType, content, attachments = []) {
    try {
      const message = await prisma.chatMessage.create({
        data: {
          conversationId,
          senderId,
          senderType, // 'CUSTOMER', 'AGENT', 'SYSTEM'
          content,
          attachments,
          sentAt: new Date()
        }
      });

      // Actualizar última actividad
      await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() }
      });

      return message;
    } catch (error) {
      logger.error({ error, conversationId }, 'Error enviando mensaje');
      throw error;
    }
  }

  /**
   * Asignar agente a conversación
   */
  async assignAgent(conversationId, agentId) {
    try {
      const updated = await prisma.chatConversation.update({
        where: { id: conversationId },
        data: {
          agentId,
          status: 'IN_PROGRESS',
          assignedAt: new Date()
        }
      });

      await this.sendMessage(
        conversationId,
        agentId,
        'SYSTEM',
        'Un agente se ha unido a la conversación'
      );

      return updated;
    } catch (error) {
      logger.error({ error, conversationId }, 'Error asignando agente');
      throw error;
    }
  }

  /**
   * Cerrar conversación
   */
  async closeConversation(conversationId, resolution = null) {
    try {
      const closed = await prisma.chatConversation.update({
        where: { id: conversationId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          resolution
        }
      });

      logger.info({ conversationId }, 'Conversación cerrada');
      return closed;
    } catch (error) {
      logger.error({ error, conversationId }, 'Error cerrando conversación');
      throw error;
    }
  }

  /**
   * Obtener conversaciones pendientes
   */
  async getPendingConversations(storeId) {
    return prisma.chatConversation.findMany({
      where: {
        customer: { storeId },
        status: { in: ['OPEN', 'IN_PROGRESS'] }
      },
      include: {
        customer: true,
        order: true,
        messages: { take: 1, orderBy: { sentAt: 'desc' } }
      },
      orderBy: { startedAt: 'asc' }
    });
  }

  /**
   * Obtener historial de conversación
   */
  async getConversationHistory(conversationId) {
    return prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { sentAt: 'asc' }
    });
  }

  /**
   * Marcar mensajes como leídos
   */
  async markAsRead(conversationId, readerId) {
    await prisma.chatMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: readerId },
        readAt: null
      },
      data: { readAt: new Date() }
    });
  }

  /**
   * Respuestas rápidas predefinidas
   */
  async getQuickReplies(storeId) {
    return prisma.quickReply.findMany({
      where: { storeId, active: true },
      orderBy: { order: 'asc' }
    });
  }
}

export const liveChatService = new LiveChatService();
export default liveChatService;
