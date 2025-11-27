/**
 * Sistema de Quejas y Reclamos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class ComplaintsService {
  CATEGORIES = {
    FOOD_QUALITY: 'food_quality',
    DELIVERY: 'delivery',
    ORDER_ERROR: 'order_error',
    CUSTOMER_SERVICE: 'customer_service',
    PRICING: 'pricing',
    HYGIENE: 'hygiene',
    PACKAGING: 'packaging',
    OTHER: 'other',
  };

  PRIORITIES = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', URGENT: 'urgent' };
  STATUSES = { OPEN: 'open', IN_PROGRESS: 'in_progress', RESOLVED: 'resolved', CLOSED: 'closed' };

  /**
   * Crear queja
   */
  async createComplaint(storeId, complaintData) {
    const {
      customerId, orderId, category, description,
      attachments, contactPreference,
    } = complaintData;

    const priority = this.calculatePriority(category, customerId);

    const complaint = await prisma.complaint.create({
      data: {
        storeId,
        customerId,
        orderId,
        category,
        description,
        attachments: attachments || [],
        contactPreference: contactPreference || 'whatsapp',
        priority,
        status: 'open',
        ticketNumber: this.generateTicketNumber(),
      },
    });

    // Crear timeline
    await this.addTimelineEntry(complaint.id, 'created', 'Queja registrada', null);

    // Notificar al equipo
    await this.notifyTeam(complaint);

    logger.info({ complaintId: complaint.id, category, priority }, 'Complaint created');
    return complaint;
  }

  generateTicketNumber() {
    return 'TKT-' + Date.now().toString(36).toUpperCase();
  }

  calculatePriority(category, customerId) {
    // Prioridad alta para higiene y clientes VIP
    if (category === this.CATEGORIES.HYGIENE) return this.PRIORITIES.URGENT;
    if (category === this.CATEGORIES.ORDER_ERROR) return this.PRIORITIES.HIGH;
    // TODO: Verificar si es cliente VIP
    return this.PRIORITIES.MEDIUM;
  }

  async notifyTeam(complaint) {
    // Integrar con sistema de notificaciones
    logger.info({ complaintId: complaint.id }, 'Team notified about complaint');
  }

  /**
   * Asignar queja a agente
   */
  async assignToAgent(complaintId, agentId) {
    await prisma.complaint.update({
      where: { id: complaintId },
      data: {
        assignedTo: agentId,
        assignedAt: new Date(),
        status: 'in_progress',
      },
    });

    await this.addTimelineEntry(complaintId, 'assigned', `Asignado a agente`, agentId);
    return { success: true };
  }

  /**
   * Agregar respuesta
   */
  async addResponse(complaintId, agentId, message, isInternal = false) {
    const response = await prisma.complaintResponse.create({
      data: {
        complaintId,
        agentId,
        message,
        isInternal,
      },
    });

    if (!isInternal) {
      await this.addTimelineEntry(complaintId, 'response', 'Respuesta enviada al cliente', agentId);
      // Enviar al cliente
    }

    return response;
  }

  /**
   * Ofrecer compensación
   */
  async offerCompensation(complaintId, agentId, compensationType, compensationValue) {
    const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });

    let compensation;

    switch (compensationType) {
      case 'refund':
        compensation = { type: 'refund', amount: compensationValue };
        break;
      case 'coupon':
        const couponCode = 'COMP' + Date.now().toString(36).toUpperCase();
        await prisma.coupon.create({
          data: {
            storeId: complaint.storeId,
            code: couponCode,
            type: 'fixed',
            value: compensationValue,
            validFrom: new Date(),
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            usageLimit: 1,
            customerId: complaint.customerId,
            isActive: true,
          },
        });
        compensation = { type: 'coupon', code: couponCode, value: compensationValue };
        break;
      case 'free_delivery':
        compensation = { type: 'free_delivery', count: compensationValue };
        break;
      case 'points':
        await prisma.customerLoyalty.upsert({
          where: { customerId: complaint.customerId },
          update: { totalPoints: { increment: compensationValue } },
          create: { customerId: complaint.customerId, totalPoints: compensationValue },
        });
        compensation = { type: 'points', amount: compensationValue };
        break;
    }

    await prisma.complaint.update({
      where: { id: complaintId },
      data: {
        compensation: JSON.stringify(compensation),
        compensationOfferedAt: new Date(),
        compensationOfferedBy: agentId,
      },
    });

    await this.addTimelineEntry(complaintId, 'compensation', `Compensación ofrecida: ${compensationType}`, agentId);

    return compensation;
  }

  /**
   * Resolver queja
   */
  async resolve(complaintId, agentId, resolution) {
    await prisma.complaint.update({
      where: { id: complaintId },
      data: {
        status: 'resolved',
        resolution,
        resolvedAt: new Date(),
        resolvedBy: agentId,
      },
    });

    await this.addTimelineEntry(complaintId, 'resolved', 'Queja resuelta', agentId);

    // Enviar encuesta de satisfacción
    await this.sendSatisfactionSurvey(complaintId);

    return { success: true };
  }

  async sendSatisfactionSurvey(complaintId) {
    // Integrar con sistema de encuestas
    logger.info({ complaintId }, 'Satisfaction survey sent');
  }

  /**
   * Agregar entrada al timeline
   */
  async addTimelineEntry(complaintId, action, description, userId) {
    await prisma.complaintTimeline.create({
      data: {
        complaintId,
        action,
        description,
        userId,
      },
    });
  }

  /**
   * Obtener queja con historial
   */
  async getComplaintDetails(complaintId) {
    return prisma.complaint.findUnique({
      where: { id: complaintId },
      include: {
        customer: { select: { name: true, phone: true, email: true } },
        order: { include: { items: true } },
        responses: { orderBy: { createdAt: 'asc' } },
        timeline: { orderBy: { createdAt: 'asc' } },
        assignedAgent: { select: { name: true } },
      },
    });
  }

  /**
   * Listar quejas
   */
  async listComplaints(storeId, filters = {}) {
    const { status, category, priority, assignedTo, startDate, endDate } = filters;

    return prisma.complaint.findMany({
      where: {
        storeId,
        status: status || undefined,
        category: category || undefined,
        priority: priority || undefined,
        assignedTo: assignedTo || undefined,
        createdAt: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined,
        },
      },
      include: {
        customer: { select: { name: true } },
        assignedAgent: { select: { name: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Estadísticas de quejas
   */
  async getComplaintStats(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const complaints = await prisma.complaint.findMany({
      where: { storeId, createdAt: { gte: startDate } },
    });

    const resolved = complaints.filter(c => c.status === 'resolved');
    const avgResolutionTime = resolved.length > 0
      ? resolved.reduce((sum, c) => sum + (c.resolvedAt - c.createdAt), 0) / resolved.length / (1000 * 60 * 60)
      : 0;

    const byCategory = {};
    complaints.forEach(c => {
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    });

    return {
      total: complaints.length,
      open: complaints.filter(c => c.status === 'open').length,
      inProgress: complaints.filter(c => c.status === 'in_progress').length,
      resolved: resolved.length,
      avgResolutionTimeHours: Math.round(avgResolutionTime * 10) / 10,
      byCategory,
      byPriority: {
        urgent: complaints.filter(c => c.priority === 'urgent').length,
        high: complaints.filter(c => c.priority === 'high').length,
        medium: complaints.filter(c => c.priority === 'medium').length,
        low: complaints.filter(c => c.priority === 'low').length,
      },
    };
  }

  /**
   * Escalar queja
   */
  async escalate(complaintId, reason, escalateTo) {
    await prisma.complaint.update({
      where: { id: complaintId },
      data: {
        priority: 'urgent',
        escalatedAt: new Date(),
        escalationReason: reason,
        assignedTo: escalateTo,
      },
    });

    await this.addTimelineEntry(complaintId, 'escalated', `Escalado: ${reason}`, null);
    return { success: true };
  }
}

export const complaintsService = new ComplaintsService();
export default complaintsService;

