/**
 * Sistema de Automatización de Marketing
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class MarketingAutomationService {
  TRIGGERS = {
    FIRST_ORDER: 'first_order',
    ABANDONED_CART: 'abandoned_cart',
    INACTIVE_CUSTOMER: 'inactive_customer',
    BIRTHDAY: 'birthday',
    ORDER_MILESTONE: 'order_milestone',
    SPEND_MILESTONE: 'spend_milestone',
    REVIEW_SUBMITTED: 'review_submitted',
    REFERRAL_SUCCESS: 'referral_success',
    LOYALTY_TIER_UP: 'loyalty_tier_up',
  };

  /**
   * Crear campaña automatizada
   */
  async createCampaign(storeId, campaignData) {
    const {
      name,
      trigger,
      triggerConditions,
      action,
      actionData,
      delay,
      isActive,
    } = campaignData;

    const campaign = await prisma.marketingCampaign.create({
      data: {
        storeId,
        name,
        trigger,
        triggerConditions: JSON.stringify(triggerConditions),
        action, // 'send_whatsapp', 'send_email', 'create_coupon', 'add_points'
        actionData: JSON.stringify(actionData),
        delay: delay || 0, // minutos de delay
        isActive: isActive ?? true,
      },
    });

    logger.info({ campaignId: campaign.id, name, trigger }, 'Marketing campaign created');
    return campaign;
  }

  /**
   * Procesar trigger
   */
  async processTrigger(storeId, trigger, customerId, metadata = {}) {
    const campaigns = await prisma.marketingCampaign.findMany({
      where: { storeId, trigger, isActive: true },
    });

    for (const campaign of campaigns) {
      const conditions = JSON.parse(campaign.triggerConditions || '{}');
      
      if (this.evaluateConditions(conditions, metadata)) {
        if (campaign.delay > 0) {
          await this.scheduleAction(campaign.id, customerId, metadata);
        } else {
          await this.executeAction(campaign, customerId, metadata);
        }
      }
    }
  }

  evaluateConditions(conditions, metadata) {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    for (const [key, value] of Object.entries(conditions)) {
      if (typeof value === 'object' && value.operator) {
        const metaValue = metadata[key];
        switch (value.operator) {
          case 'gte': if (metaValue < value.value) return false; break;
          case 'lte': if (metaValue > value.value) return false; break;
          case 'eq': if (metaValue !== value.value) return false; break;
          case 'in': if (!value.value.includes(metaValue)) return false; break;
        }
      } else {
        if (metadata[key] !== value) return false;
      }
    }
    return true;
  }

  async scheduleAction(campaignId, customerId, metadata) {
    const campaign = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return;

    const executeAt = new Date(Date.now() + campaign.delay * 60 * 1000);

    await prisma.scheduledAction.create({
      data: {
        campaignId,
        customerId,
        metadata: JSON.stringify(metadata),
        executeAt,
        status: 'pending',
      },
    });

    logger.info({ campaignId, customerId, executeAt }, 'Action scheduled');
  }

  /**
   * Ejecutar acción de campaña
   */
  async executeAction(campaign, customerId, metadata) {
    const actionData = JSON.parse(campaign.actionData || '{}');

    try {
      switch (campaign.action) {
        case 'send_whatsapp':
          await this.sendWhatsAppMessage(customerId, actionData.template, metadata);
          break;
        case 'send_email':
          await this.sendEmail(customerId, actionData.subject, actionData.template, metadata);
          break;
        case 'create_coupon':
          await this.createPersonalCoupon(customerId, campaign.storeId, actionData);
          break;
        case 'add_points':
          await this.addLoyaltyPoints(customerId, actionData.points, actionData.reason);
          break;
      }

      await prisma.campaignExecution.create({
        data: {
          campaignId: campaign.id,
          customerId,
          action: campaign.action,
          status: 'success',
        },
      });

      logger.info({ campaignId: campaign.id, customerId, action: campaign.action }, 'Campaign action executed');
    } catch (error) {
      logger.error({ campaignId: campaign.id, error: error.message }, 'Campaign action failed');
      
      await prisma.campaignExecution.create({
        data: {
          campaignId: campaign.id,
          customerId,
          action: campaign.action,
          status: 'failed',
          error: error.message,
        },
      });
    }
  }

  async sendWhatsAppMessage(customerId, template, variables) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer?.phone) return;

    // Reemplazar variables en template
    let message = template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(`{{${key}}}`, value);
    }

    // Aquí integrar con servicio de WhatsApp
    logger.info({ customerId, message: message.substring(0, 50) }, 'WhatsApp message sent');
  }

  async sendEmail(customerId, subject, template, variables) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer?.email) return;

    // Aquí integrar con servicio de email
    logger.info({ customerId, subject }, 'Email sent');
  }

  async createPersonalCoupon(customerId, storeId, couponConfig) {
    const code = `AUTO${Date.now().toString(36).toUpperCase()}`;

    await prisma.coupon.create({
      data: {
        storeId,
        code,
        type: couponConfig.type || 'percentage',
        value: couponConfig.value || 10,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + (couponConfig.validDays || 7) * 24 * 60 * 60 * 1000),
        usageLimit: 1,
        customerId, // Cupón personal
        isActive: true,
      },
    });

    return code;
  }

  async addLoyaltyPoints(customerId, points, reason) {
    await prisma.customerLoyalty.update({
      where: { customerId },
      data: { totalPoints: { increment: points } },
    });

    await prisma.pointsHistory.create({
      data: { customerId, points, reason },
    });
  }

  /**
   * Procesar acciones programadas
   */
  async processScheduledActions() {
    const pendingActions = await prisma.scheduledAction.findMany({
      where: {
        status: 'pending',
        executeAt: { lte: new Date() },
      },
      include: { campaign: true },
    });

    for (const action of pendingActions) {
      await prisma.scheduledAction.update({
        where: { id: action.id },
        data: { status: 'processing' },
      });

      try {
        await this.executeAction(
          action.campaign,
          action.customerId,
          JSON.parse(action.metadata || '{}')
        );

        await prisma.scheduledAction.update({
          where: { id: action.id },
          data: { status: 'completed' },
        });
      } catch (error) {
        await prisma.scheduledAction.update({
          where: { id: action.id },
          data: { status: 'failed', error: error.message },
        });
      }
    }
  }

  /**
   * Detectar carritos abandonados
   */
  async detectAbandonedCarts(storeId) {
    const threshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hora

    const abandonedCarts = await prisma.cart.findMany({
      where: {
        storeId,
        updatedAt: { lt: threshold },
        status: 'active',
        items: { some: {} },
      },
      include: { customer: true },
    });

    for (const cart of abandonedCarts) {
      if (cart.customerId) {
        await this.processTrigger(storeId, this.TRIGGERS.ABANDONED_CART, cart.customerId, {
          cartTotal: cart.total,
          itemCount: cart.items?.length || 0,
        });

        await prisma.cart.update({
          where: { id: cart.id },
          data: { status: 'abandoned' },
        });
      }
    }

    return abandonedCarts.length;
  }

  /**
   * Detectar clientes inactivos
   */
  async detectInactiveCustomers(storeId, inactiveDays = 30) {
    const threshold = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

    const inactiveCustomers = await prisma.customer.findMany({
      where: {
        orders: {
          some: { storeId },
          none: { createdAt: { gte: threshold } },
        },
      },
      include: {
        orders: {
          where: { storeId },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    for (const customer of inactiveCustomers) {
      await this.processTrigger(storeId, this.TRIGGERS.INACTIVE_CUSTOMER, customer.id, {
        lastOrderDays: inactiveDays,
        totalOrders: customer.orders.length,
      });
    }

    return inactiveCustomers.length;
  }

  /**
   * Estadísticas de campañas
   */
  async getCampaignStats(campaignId) {
    const executions = await prisma.campaignExecution.findMany({
      where: { campaignId },
    });

    return {
      total: executions.length,
      success: executions.filter(e => e.status === 'success').length,
      failed: executions.filter(e => e.status === 'failed').length,
      successRate: executions.length > 0
        ? Math.round(executions.filter(e => e.status === 'success').length / executions.length * 100)
        : 0,
    };
  }
}

export const marketingAutomationService = new MarketingAutomationService();
export default marketingAutomationService;

