import express from 'express';
import { PrismaClient } from '@prisma/client';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { generalRateLimit } from '../middlewares/security.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// Procesar pago con tarjeta guardada
router.post('/process', generalRateLimit, async (req, res) => {
  try {
    const { orderId, cardId, cvv, storeId } = req.body;

    if (!orderId || !cardId || !cvv) {
      return res.status(400).json({ error: 'orderId, cardId y cvv son obligatorios' });
    }

    // Obtener pedido
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    // Obtener tarjeta guardada
    const card = await prisma.savedCard.findUnique({
      where: { id: cardId }
    });

    if (!card) {
      return res.status(404).json({ error: 'Tarjeta no encontrada' });
    }

    // Obtener configuración de Mercado Pago del store
    const storeSettings = await prisma.storeSettings.findUnique({
      where: { storeId: order.storeId || storeId }
    });

    if (!storeSettings?.mercadoPagoToken) {
      return res.status(400).json({ error: 'Mercado Pago no configurado para esta tienda' });
    }

    // Crear cliente de Mercado Pago
    const client = new MercadoPagoConfig({
      accessToken: storeSettings.mercadoPagoToken
    });
    const payment = new Payment(client);

    // Crear pago con tarjeta guardada
    const paymentData = {
      transaction_amount: order.total,
      token: card.cardToken,
      description: `Pedido ${order.orderNumber}`,
      installments: 1,
      payment_method_id: card.cardType || 'visa',
      payer: {
        email: order.customerPhone ? `${order.customerPhone}@temp.com` : 'customer@temp.com'
      },
      external_reference: orderId
    };

    const mpPayment = await payment.create({ body: paymentData });

    if (mpPayment.status === 'approved') {
      // Actualizar pedido
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'paid',
          paymentMethod: 'card',
          status: 'confirmed'
        }
      });

      res.json({ success: true, paymentId: mpPayment.id, status: 'approved' });
    } else {
      res.status(400).json({ 
        error: 'Pago rechazado', 
        status: mpPayment.status,
        details: mpPayment.status_detail 
      });
    }
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Error al procesar pago', details: error.message });
  }
});

// Procesar pago con Mercado Pago Wallet
router.post('/process-wallet', generalRateLimit, async (req, res) => {
  try {
    const { orderId, mpPaymentId, storeId } = req.body;

    if (!orderId || !mpPaymentId) {
      return res.status(400).json({ error: 'orderId y mpPaymentId son obligatorios' });
    }

    // Obtener pedido
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    // Obtener configuración de Mercado Pago
    const storeSettings = await prisma.storeSettings.findUnique({
      where: { storeId: order.storeId || storeId }
    });

    if (!storeSettings?.mercadoPagoToken) {
      return res.status(400).json({ error: 'Mercado Pago no configurado' });
    }

    // Verificar estado del pago en Mercado Pago
    const client = new MercadoPagoConfig({
      accessToken: storeSettings.mercadoPagoToken
    });
    const payment = new Payment(client);
    const mpPayment = await payment.get({ id: mpPaymentId });

    if (mpPayment.status === 'approved') {
      // Actualizar pedido
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'paid',
          paymentMethod: 'mercado_pago',
          status: 'confirmed'
        }
      });

      res.json({ success: true, paymentId: mpPayment.id, status: 'approved' });
    } else {
      res.status(400).json({ 
        error: 'Pago no aprobado', 
        status: mpPayment.status 
      });
    }
  } catch (error) {
    console.error('Error processing wallet payment:', error);
    res.status(500).json({ error: 'Error al procesar pago', details: error.message });
  }
});

export default router;

