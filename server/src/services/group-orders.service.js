/**
 * Sistema de Pedidos Grupales
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

class GroupOrdersService {
  /**
   * Crear pedido grupal
   */
  async createGroupOrder(storeId, hostId, config) {
    const { name, maxParticipants, deadline, deliveryAddress, notes } = config;

    const joinCode = this.generateJoinCode();

    const groupOrder = await prisma.groupOrder.create({
      data: {
        storeId,
        hostId,
        name: name || 'Pedido grupal',
        joinCode,
        maxParticipants: maxParticipants || 10,
        deadline: deadline ? new Date(deadline) : new Date(Date.now() + 2 * 60 * 60 * 1000),
        deliveryAddress,
        notes,
        status: 'collecting',
      },
    });

    // Agregar host como participante
    await this.joinGroupOrder(groupOrder.id, hostId, true);

    logger.info({ groupOrderId: groupOrder.id, hostId }, 'Group order created');
    return { ...groupOrder, shareLink: `${process.env.CLIENT_URL}/group/${joinCode}` };
  }

  generateJoinCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Unirse a pedido grupal
   */
  async joinGroupOrder(groupOrderId, customerId, isHost = false) {
    const groupOrder = await prisma.groupOrder.findUnique({ where: { id: groupOrderId } });

    if (!groupOrder) throw new Error('Pedido grupal no encontrado');
    if (groupOrder.status !== 'collecting') throw new Error('El pedido ya no acepta participantes');
    if (new Date() > groupOrder.deadline) throw new Error('El tiempo para unirse ha expirado');

    const participantCount = await prisma.groupOrderParticipant.count({
      where: { groupOrderId },
    });

    if (participantCount >= groupOrder.maxParticipants) {
      throw new Error('El pedido ha alcanzado el máximo de participantes');
    }

    const existing = await prisma.groupOrderParticipant.findFirst({
      where: { groupOrderId, customerId },
    });

    if (existing) throw new Error('Ya estás en este pedido grupal');

    const participant = await prisma.groupOrderParticipant.create({
      data: {
        groupOrderId,
        customerId,
        isHost,
        status: 'selecting',
      },
    });

    logger.info({ groupOrderId, customerId }, 'Joined group order');
    return participant;
  }

  /**
   * Unirse por código
   */
  async joinByCode(joinCode, customerId) {
    const groupOrder = await prisma.groupOrder.findFirst({
      where: { joinCode: joinCode.toUpperCase() },
    });

    if (!groupOrder) throw new Error('Código inválido');

    return this.joinGroupOrder(groupOrder.id, customerId);
  }

  /**
   * Agregar items al pedido individual
   */
  async addItems(groupOrderId, customerId, items) {
    const participant = await prisma.groupOrderParticipant.findFirst({
      where: { groupOrderId, customerId },
    });

    if (!participant) throw new Error('No eres participante de este pedido');

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    await prisma.groupOrderParticipant.update({
      where: { id: participant.id },
      data: {
        items: JSON.stringify(items),
        subtotal,
        status: 'ready',
      },
    });

    return { success: true, subtotal };
  }

  /**
   * Obtener estado del pedido grupal
   */
  async getGroupOrderStatus(groupOrderId) {
    const groupOrder = await prisma.groupOrder.findUnique({
      where: { id: groupOrderId },
      include: {
        participants: {
          include: {
            customer: { select: { id: true, name: true, avatar: true } },
          },
        },
        store: { select: { name: true, logo: true } },
      },
    });

    if (!groupOrder) throw new Error('Pedido grupal no encontrado');

    const participants = groupOrder.participants.map(p => ({
      id: p.id,
      customerId: p.customerId,
      name: p.customer?.name || 'Anónimo',
      avatar: p.customer?.avatar,
      isHost: p.isHost,
      status: p.status,
      items: p.items ? JSON.parse(p.items) : [],
      subtotal: p.subtotal,
    }));

    const readyCount = participants.filter(p => p.status === 'ready').length;
    const total = participants.reduce((sum, p) => sum + (p.subtotal || 0), 0);

    return {
      ...groupOrder,
      participants,
      summary: {
        participantCount: participants.length,
        readyCount,
        total,
        allReady: readyCount === participants.length && participants.length > 0,
      },
      timeRemaining: Math.max(0, new Date(groupOrder.deadline) - new Date()),
    };
  }

  /**
   * Finalizar pedido grupal (solo host)
   */
  async finalizeGroupOrder(groupOrderId, hostId) {
    const groupOrder = await prisma.groupOrder.findUnique({
      where: { id: groupOrderId },
      include: { participants: true },
    });

    if (!groupOrder) throw new Error('Pedido grupal no encontrado');
    if (groupOrder.hostId !== hostId) throw new Error('Solo el organizador puede finalizar');
    if (groupOrder.status !== 'collecting') throw new Error('El pedido ya fue finalizado');

    // Verificar que haya al menos un participante con items
    const withItems = groupOrder.participants.filter(p => p.subtotal > 0);
    if (withItems.length === 0) throw new Error('No hay items en el pedido');

    // Consolidar todos los items
    const allItems = [];
    let total = 0;

    for (const p of withItems) {
      const items = JSON.parse(p.items || '[]');
      items.forEach(item => {
        item.participantId = p.id;
        item.participantName = p.customer?.name;
        allItems.push(item);
      });
      total += p.subtotal;
    }

    // Crear pedido real
    const order = await prisma.order.create({
      data: {
        storeId: groupOrder.storeId,
        customerId: hostId,
        customerName: 'Pedido Grupal',
        deliveryAddress: groupOrder.deliveryAddress,
        subtotal: total,
        total,
        status: 'pending',
        isGroupOrder: true,
        groupOrderId,
        notes: `Pedido grupal: ${groupOrder.name}\nParticipantes: ${withItems.length}`,
        items: {
          create: allItems.map(item => ({
            productId: item.productId,
            productName: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            subtotal: item.price * item.quantity,
            notes: `Para: ${item.participantName}`,
          })),
        },
      },
    });

    await prisma.groupOrder.update({
      where: { id: groupOrderId },
      data: {
        status: 'ordered',
        orderId: order.id,
        finalizedAt: new Date(),
      },
    });

    logger.info({ groupOrderId, orderId: order.id }, 'Group order finalized');
    return order;
  }

  /**
   * Cancelar pedido grupal
   */
  async cancelGroupOrder(groupOrderId, hostId, reason) {
    const groupOrder = await prisma.groupOrder.findUnique({ where: { id: groupOrderId } });

    if (!groupOrder) throw new Error('Pedido grupal no encontrado');
    if (groupOrder.hostId !== hostId) throw new Error('Solo el organizador puede cancelar');

    await prisma.groupOrder.update({
      where: { id: groupOrderId },
      data: { status: 'cancelled', cancelReason: reason },
    });

    logger.info({ groupOrderId, reason }, 'Group order cancelled');
    return { success: true };
  }

  /**
   * Obtener pedidos grupales activos
   */
  async getActiveGroupOrders(customerId) {
    return prisma.groupOrder.findMany({
      where: {
        status: 'collecting',
        participants: { some: { customerId } },
      },
      include: {
        store: { select: { name: true, logo: true } },
        _count: { select: { participants: true } },
      },
    });
  }
}

export const groupOrdersService = new GroupOrdersService();
export default groupOrdersService;

