/**
 * Servicio de MercadoPago
 * Checkout Pro, pagos y webhooks
 */

import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class MercadoPagoService {
  constructor() {
    this.clients = new Map(); // storeId -> MercadoPagoConfig
  }

  /**
   * Obtener cliente de MercadoPago para una tienda
   */
  async getClient(storeId) {
    // Verificar cache
    if (this.clients.has(storeId)) {
      return this.clients.get(storeId);
    }

    // Obtener configuración de la tienda
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
    });

    if (!settings?.mercadoPagoToken) {
      throw new Error('MercadoPago no configurado para esta tienda');
    }

    // Crear cliente
    const client = new MercadoPagoConfig({
      accessToken: settings.mercadoPagoToken,
    });

    this.clients.set(storeId, client);
    return client;
  }

  /**
   * Crear preferencia de pago (Checkout Pro)
   */
  async createPreference(storeId, orderData) {
    const {
      orderId,
      orderNumber,
      items,
      customerName,
      customerEmail,
      customerPhone,
      total,
      deliveryFee,
    } = orderData;

    const client = await this.getClient(storeId);
    const preference = new Preference(client);

    // Obtener info de la tienda
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    // URLs de retorno
    const baseUrl = process.env.FRONTEND_URL || 'https://tuapp.com';

    const preferenceData = {
      items: items.map(item => ({
        id: item.productId,
        title: item.productName,
        quantity: item.quantity,
        unit_price: Number(item.unitPrice),
        currency_id: 'ARS',
      })),
      // Agregar envío si aplica
      ...(deliveryFee > 0 && {
        shipments: {
          cost: Number(deliveryFee),
          mode: 'not_specified',
        },
      }),
      payer: {
        name: customerName,
        email: customerEmail || undefined,
        phone: customerPhone ? { number: customerPhone } : undefined,
      },
      back_urls: {
        success: `${baseUrl}/order/${orderId}/success`,
        failure: `${baseUrl}/order/${orderId}/failure`,
        pending: `${baseUrl}/order/${orderId}/pending`,
      },
      auto_return: 'approved',
      external_reference: orderId,
      notification_url: `${process.env.API_URL}/api/webhooks/mercadopago/${storeId}`,
      statement_descriptor: store?.name || 'Pedido Online',
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 horas
    };

    try {
      const response = await preference.create({ body: preferenceData });

      logger.info({
        storeId,
        orderId,
        preferenceId: response.id,
      }, 'MercadoPago preference created');

      return {
        preferenceId: response.id,
        initPoint: response.init_point,
        sandboxInitPoint: response.sandbox_init_point,
      };
    } catch (error) {
      logger.error({
        storeId,
        orderId,
        error: error.message,
      }, 'Error creating MercadoPago preference');
      throw error;
    }
  }

  /**
   * Procesar webhook de MercadoPago
   */
  async processWebhook(storeId, data) {
    const { type, data: webhookData } = data;

    logger.info({
      storeId,
      type,
      id: webhookData?.id,
    }, 'MercadoPago webhook received');

    if (type === 'payment') {
      return await this.processPaymentWebhook(storeId, webhookData.id);
    }

    return { processed: false, reason: 'Unknown webhook type' };
  }

  /**
   * Procesar webhook de pago
   */
  async processPaymentWebhook(storeId, paymentId) {
    const client = await this.getClient(storeId);
    const payment = new Payment(client);

    try {
      const paymentInfo = await payment.get({ id: paymentId });

      const orderId = paymentInfo.external_reference;
      const status = paymentInfo.status;

      logger.info({
        storeId,
        paymentId,
        orderId,
        status,
        amount: paymentInfo.transaction_amount,
      }, 'Payment info retrieved');

      // Actualizar pedido según estado
      if (status === 'approved') {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: 'paid',
            status: 'confirmed',
          },
        });

        // Registrar pago
        await prisma.pendingTransfer.create({
          data: {
            orderId,
            storeId,
            amount: paymentInfo.transaction_amount,
            status: 'verified',
            transferReference: `MP-${paymentId}`,
            verifiedAt: new Date(),
          },
        });

        return { processed: true, status: 'approved', orderId };
      }

      if (status === 'rejected' || status === 'cancelled') {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: 'failed',
          },
        });

        return { processed: true, status, orderId };
      }

      if (status === 'pending' || status === 'in_process') {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: 'pending',
          },
        });

        return { processed: true, status, orderId };
      }

      return { processed: false, status };
    } catch (error) {
      logger.error({
        storeId,
        paymentId,
        error: error.message,
      }, 'Error processing payment webhook');
      throw error;
    }
  }

  /**
   * Obtener información de un pago
   */
  async getPayment(storeId, paymentId) {
    const client = await this.getClient(storeId);
    const payment = new Payment(client);
    return await payment.get({ id: paymentId });
  }

  /**
   * Crear reembolso
   */
  async createRefund(storeId, paymentId, amount = null) {
    const client = await this.getClient(storeId);
    
    const refundData = {
      payment_id: paymentId,
    };

    if (amount) {
      refundData.amount = amount;
    }

    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${client.accessToken}`,
          },
          body: JSON.stringify(refundData),
        }
      );

      const result = await response.json();

      logger.info({
        storeId,
        paymentId,
        refundId: result.id,
        amount: result.amount,
      }, 'Refund created');

      return result;
    } catch (error) {
      logger.error({
        storeId,
        paymentId,
        error: error.message,
      }, 'Error creating refund');
      throw error;
    }
  }

  /**
   * Verificar configuración de una tienda
   */
  async verifyStoreConfig(storeId) {
    try {
      const client = await this.getClient(storeId);
      
      // Intentar una operación simple para verificar el token
      const preference = new Preference(client);
      
      return {
        configured: true,
        valid: true,
      };
    } catch (error) {
      return {
        configured: false,
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Limpiar cache de cliente
   */
  clearClientCache(storeId) {
    this.clients.delete(storeId);
  }
}

export const mercadoPagoService = new MercadoPagoService();
export default mercadoPagoService;

