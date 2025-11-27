/**
 * Sistema de Suscripciones Mensuales
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class SubscriptionsService {
  PLAN_STATUS = {
    ACTIVE: 'active',
    PAUSED: 'paused',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired',
  };

  /**
   * Crear plan de suscripción
   */
  async createPlan(storeId, planData) {
    const {
      name, description, price, billingCycle, benefits,
      freeDeliveries, discountPercent, prioritySupport,
      exclusiveProducts, maxOrdersPerMonth,
    } = planData;

    const plan = await prisma.subscriptionPlan.create({
      data: {
        storeId,
        name,
        description,
        price,
        billingCycle: billingCycle || 'monthly',
        benefits: benefits || [],
        freeDeliveries: freeDeliveries || 0,
        discountPercent: discountPercent || 0,
        prioritySupport: prioritySupport || false,
        exclusiveProducts: exclusiveProducts || [],
        maxOrdersPerMonth,
        isActive: true,
      },
    });

    logger.info({ planId: plan.id, name }, 'Subscription plan created');
    return plan;
  }

  /**
   * Suscribir cliente a plan
   */
  async subscribe(customerId, planId, paymentMethodId) {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new Error('Plan no disponible');

    const existing = await prisma.customerSubscription.findFirst({
      where: { customerId, status: 'active' },
    });
    if (existing) throw new Error('Ya tienes una suscripción activa');

    const now = new Date();
    const nextBilling = new Date(now);
    nextBilling.setMonth(nextBilling.getMonth() + 1);

    const subscription = await prisma.customerSubscription.create({
      data: {
        customerId,
        planId,
        paymentMethodId,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: nextBilling,
        nextBillingDate: nextBilling,
        freeDeliveriesRemaining: plan.freeDeliveries,
        ordersThisMonth: 0,
      },
    });

    // Procesar primer pago
    await this.processPayment(subscription.id, plan.price);

    logger.info({ subscriptionId: subscription.id, customerId, planId }, 'Customer subscribed');
    return subscription;
  }

  /**
   * Procesar pago de suscripción
   */
  async processPayment(subscriptionId, amount) {
    const subscription = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
      include: { customer: true, plan: true },
    });

    // Integrar con pasarela de pago
    const payment = await prisma.subscriptionPayment.create({
      data: {
        subscriptionId,
        amount,
        status: 'completed',
        paidAt: new Date(),
      },
    });

    logger.info({ subscriptionId, amount }, 'Subscription payment processed');
    return payment;
  }

  /**
   * Cancelar suscripción
   */
  async cancel(subscriptionId, reason = null, immediate = false) {
    const subscription = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) throw new Error('Suscripción no encontrada');

    const updateData = {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: reason,
    };

    if (!immediate) {
      // Mantener activa hasta fin del período
      updateData.status = 'active';
      updateData.cancelAtPeriodEnd = true;
    }

    await prisma.customerSubscription.update({
      where: { id: subscriptionId },
      data: updateData,
    });

    logger.info({ subscriptionId, immediate }, 'Subscription cancelled');
    return { success: true, effectiveDate: immediate ? new Date() : subscription.currentPeriodEnd };
  }

  /**
   * Pausar suscripción
   */
  async pause(subscriptionId, resumeDate = null) {
    await prisma.customerSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'paused',
        pausedAt: new Date(),
        resumeDate: resumeDate ? new Date(resumeDate) : null,
      },
    });

    logger.info({ subscriptionId }, 'Subscription paused');
    return { success: true };
  }

  /**
   * Reanudar suscripción
   */
  async resume(subscriptionId) {
    const subscription = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    const now = new Date();
    const nextBilling = new Date(now);
    nextBilling.setMonth(nextBilling.getMonth() + 1);

    await prisma.customerSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'active',
        pausedAt: null,
        resumeDate: null,
        currentPeriodStart: now,
        currentPeriodEnd: nextBilling,
        nextBillingDate: nextBilling,
        freeDeliveriesRemaining: subscription.plan.freeDeliveries,
      },
    });

    logger.info({ subscriptionId }, 'Subscription resumed');
    return { success: true };
  }

  /**
   * Aplicar beneficios a orden
   */
  async applyBenefits(customerId, order) {
    const subscription = await prisma.customerSubscription.findFirst({
      where: { customerId, status: 'active' },
      include: { plan: true },
    });

    if (!subscription) return { discount: 0, freeDelivery: false };

    const benefits = {
      discount: 0,
      freeDelivery: false,
      appliedBenefits: [],
    };

    // Descuento porcentual
    if (subscription.plan.discountPercent > 0) {
      benefits.discount = Math.round(order.subtotal * (subscription.plan.discountPercent / 100));
      benefits.appliedBenefits.push(`${subscription.plan.discountPercent}% descuento suscriptor`);
    }

    // Envío gratis
    if (subscription.freeDeliveriesRemaining > 0) {
      benefits.freeDelivery = true;
      benefits.appliedBenefits.push('Envío gratis (suscripción)');

      await prisma.customerSubscription.update({
        where: { id: subscription.id },
        data: { freeDeliveriesRemaining: { decrement: 1 } },
      });
    }

    // Incrementar contador de órdenes
    await prisma.customerSubscription.update({
      where: { id: subscription.id },
      data: { ordersThisMonth: { increment: 1 } },
    });

    return benefits;
  }

  /**
   * Renovar suscripciones
   */
  async processRenewals() {
    const dueSubscriptions = await prisma.customerSubscription.findMany({
      where: {
        status: 'active',
        nextBillingDate: { lte: new Date() },
        cancelAtPeriodEnd: false,
      },
      include: { plan: true },
    });

    const results = { renewed: 0, failed: 0 };

    for (const sub of dueSubscriptions) {
      try {
        await this.processPayment(sub.id, sub.plan.price);

        const nextBilling = new Date();
        nextBilling.setMonth(nextBilling.getMonth() + 1);

        await prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            currentPeriodStart: new Date(),
            currentPeriodEnd: nextBilling,
            nextBillingDate: nextBilling,
            freeDeliveriesRemaining: sub.plan.freeDeliveries,
            ordersThisMonth: 0,
          },
        });

        results.renewed++;
      } catch (error) {
        logger.error({ subscriptionId: sub.id, error: error.message }, 'Renewal failed');
        results.failed++;
      }
    }

    // Cancelar las que terminan período
    await prisma.customerSubscription.updateMany({
      where: {
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { lte: new Date() },
      },
      data: { status: 'cancelled' },
    });

    return results;
  }

  /**
   * Obtener suscripción del cliente
   */
  async getCustomerSubscription(customerId) {
    return prisma.customerSubscription.findFirst({
      where: { customerId, status: { in: ['active', 'paused'] } },
      include: { plan: true },
    });
  }

  /**
   * Estadísticas de suscripciones
   */
  async getSubscriptionStats(storeId) {
    const [active, paused, cancelled, revenue] = await Promise.all([
      prisma.customerSubscription.count({
        where: { plan: { storeId }, status: 'active' },
      }),
      prisma.customerSubscription.count({
        where: { plan: { storeId }, status: 'paused' },
      }),
      prisma.customerSubscription.count({
        where: { plan: { storeId }, status: 'cancelled' },
      }),
      prisma.subscriptionPayment.aggregate({
        where: { subscription: { plan: { storeId } }, status: 'completed' },
        _sum: { amount: true },
      }),
    ]);

    return {
      active,
      paused,
      cancelled,
      totalRevenue: revenue._sum.amount || 0,
      mrr: active * (await this.getAvgPlanPrice(storeId)),
    };
  }

  async getAvgPlanPrice(storeId) {
    const result = await prisma.subscriptionPlan.aggregate({
      where: { storeId, isActive: true },
      _avg: { price: true },
    });
    return result._avg.price || 0;
  }
}

export const subscriptionsService = new SubscriptionsService();
export default subscriptionsService;
