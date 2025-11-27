/**
 * Servicio de Email Transaccional
 * Envía emails de confirmación, estado de pedido, etc.
 */

import logger from '../utils/logger.js';
import prisma from '../utils/prisma.js';

class EmailService {
  constructor() {
    this.provider = process.env.EMAIL_PROVIDER || 'console'; // console, smtp, resend, sendgrid
    this.from = process.env.EMAIL_FROM || 'noreply@tuapp.com';
  }

  /**
   * Enviar email
   */
  async send(to, subject, html, options = {}) {
    const { storeId, templateId } = options;

    // Obtener branding de la tienda si aplica
    let storeBranding = null;
    if (storeId) {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        include: { settings: true },
      });
      storeBranding = {
        name: store?.name,
        logo: store?.imageUrl,
        primaryColor: '#14B8A6',
      };
    }

    // Envolver en plantilla base
    const fullHtml = this.wrapInTemplate(html, storeBranding);

    try {
      if (this.provider === 'console') {
        // Solo loguear en desarrollo
        logger.info({ to, subject }, 'Email sent (console mode)');
        console.log('📧 Email:', { to, subject, preview: html.substring(0, 200) });
        return { success: true, provider: 'console' };
      }

      if (this.provider === 'resend') {
        return await this.sendWithResend(to, subject, fullHtml);
      }

      if (this.provider === 'sendgrid') {
        return await this.sendWithSendGrid(to, subject, fullHtml);
      }

      // SMTP genérico
      return await this.sendWithSMTP(to, subject, fullHtml);
    } catch (error) {
      logger.error({ to, subject, error: error.message }, 'Email send failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar con Resend
   */
  async sendWithResend(to, subject, html) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: this.from,
        to,
        subject,
        html,
      }),
    });

    const data = await response.json();
    return { success: response.ok, id: data.id };
  }

  /**
   * Enviar con SendGrid
   */
  async sendWithSendGrid(to, subject, html) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: this.from },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });

    return { success: response.ok };
  }

  /**
   * Plantilla base de email
   */
  wrapInTemplate(content, branding = null) {
    const primaryColor = branding?.primaryColor || '#14B8A6';
    const storeName = branding?.name || 'Tu Tienda';
    const logo = branding?.logo || '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f4f4f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: ${primaryColor}; padding: 24px; text-align: center; }
    .header img { max-height: 50px; }
    .header h1 { color: white; margin: 10px 0 0; font-size: 24px; }
    .content { padding: 32px 24px; }
    .footer { background: #f4f4f5; padding: 24px; text-align: center; font-size: 12px; color: #71717a; }
    .button { display: inline-block; background: ${primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .order-box { background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-confirmed { background: #dbeafe; color: #1e40af; }
    .status-preparing { background: #fed7aa; color: #c2410c; }
    .status-delivered { background: #d1fae5; color: #065f46; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logo ? `<img src="${logo}" alt="${storeName}">` : ''}
      <h1>${storeName}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>${storeName}</p>
      <p>Este email fue enviado automáticamente. Por favor no responder.</p>
    </div>
  </div>
</body>
</html>`;
  }

  // ============ EMAILS TRANSACCIONALES ============

  /**
   * Email de confirmación de pedido
   */
  async sendOrderConfirmation(order, store) {
    const itemsHtml = order.items.map(item => `
      <tr>
        <td style="padding: 8px 0;">${item.quantity}x ${item.productName}</td>
        <td style="padding: 8px 0; text-align: right;">$${item.subtotal.toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `
      <h2>¡Gracias por tu pedido! 🎉</h2>
      <p>Hola ${order.customerName},</p>
      <p>Tu pedido <strong>#${order.orderNumber}</strong> ha sido recibido y está siendo procesado.</p>
      
      <div class="order-box">
        <h3 style="margin-top: 0;">Detalle del pedido</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${itemsHtml}
          <tr style="border-top: 1px solid #e5e7eb;">
            <td style="padding: 8px 0;"><strong>Subtotal</strong></td>
            <td style="padding: 8px 0; text-align: right;">$${order.subtotal.toFixed(2)}</td>
          </tr>
          ${order.deliveryFee > 0 ? `
          <tr>
            <td style="padding: 8px 0;">Envío</td>
            <td style="padding: 8px 0; text-align: right;">$${order.deliveryFee.toFixed(2)}</td>
          </tr>
          ` : ''}
          <tr style="border-top: 2px solid #000;">
            <td style="padding: 8px 0;"><strong>Total</strong></td>
            <td style="padding: 8px 0; text-align: right;"><strong>$${order.total.toFixed(2)}</strong></td>
          </tr>
        </table>
      </div>
      
      <p><strong>Dirección de entrega:</strong><br>${order.customerAddress || 'Retiro en local'}</p>
      <p><strong>Método de pago:</strong> ${order.paymentMethod || 'No especificado'}</p>
      
      <p style="text-align: center; margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL}/tracking/${order.trackingToken}" class="button">
          Seguir mi pedido
        </a>
      </p>
    `;

    return this.send(order.customerEmail, `Pedido #${order.orderNumber} confirmado`, html, {
      storeId: order.storeId,
    });
  }

  /**
   * Email de pedido en camino
   */
  async sendOrderOnTheWay(order, store, driverName = null) {
    const html = `
      <h2>¡Tu pedido está en camino! 🚗</h2>
      <p>Hola ${order.customerName},</p>
      <p>Tu pedido <strong>#${order.orderNumber}</strong> ya salió del local y está en camino a tu dirección.</p>
      
      ${driverName ? `<p><strong>Repartidor:</strong> ${driverName}</p>` : ''}
      
      <div class="order-box">
        <p><strong>Dirección de entrega:</strong><br>${order.customerAddress}</p>
        <p><strong>Tiempo estimado:</strong> 15-25 minutos</p>
      </div>
      
      <p style="text-align: center; margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL}/tracking/${order.trackingToken}" class="button">
          Ver ubicación en tiempo real
        </a>
      </p>
    `;

    return this.send(order.customerEmail, `Tu pedido #${order.orderNumber} está en camino`, html, {
      storeId: order.storeId,
    });
  }

  /**
   * Email de pedido entregado
   */
  async sendOrderDelivered(order, store) {
    const html = `
      <h2>¡Pedido entregado! ✅</h2>
      <p>Hola ${order.customerName},</p>
      <p>Tu pedido <strong>#${order.orderNumber}</strong> ha sido entregado exitosamente.</p>
      
      <p>Esperamos que disfrutes tu pedido. ¡Gracias por elegirnos!</p>
      
      <div class="order-box">
        <p><strong>Total pagado:</strong> $${order.total.toFixed(2)}</p>
      </div>
      
      <p style="text-align: center; margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL}/review/${order.id}" class="button">
          Calificar pedido ⭐
        </a>
      </p>
      
      <p style="text-align: center; color: #71717a; font-size: 14px;">
        Tu opinión nos ayuda a mejorar
      </p>
    `;

    return this.send(order.customerEmail, `Pedido #${order.orderNumber} entregado`, html, {
      storeId: order.storeId,
    });
  }

  /**
   * Email de pedido cancelado
   */
  async sendOrderCancelled(order, store, reason = null) {
    const html = `
      <h2>Pedido cancelado ❌</h2>
      <p>Hola ${order.customerName},</p>
      <p>Lamentamos informarte que tu pedido <strong>#${order.orderNumber}</strong> ha sido cancelado.</p>
      
      ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}
      
      <div class="order-box">
        <p>Si realizaste un pago, el reembolso se procesará en los próximos días hábiles.</p>
      </div>
      
      <p>Disculpa las molestias. ¡Esperamos verte pronto!</p>
      
      <p style="text-align: center; margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL}/menu" class="button">
          Hacer nuevo pedido
        </a>
      </p>
    `;

    return this.send(order.customerEmail, `Pedido #${order.orderNumber} cancelado`, html, {
      storeId: order.storeId,
    });
  }

  /**
   * Email de puntos ganados
   */
  async sendPointsEarned(user, points, reason, store) {
    const html = `
      <h2>¡Ganaste ${points} puntos! 🎁</h2>
      <p>Hola ${user.name || 'Cliente'},</p>
      <p>Has ganado <strong>${points} puntos</strong> por ${reason}.</p>
      
      <div class="order-box">
        <p style="text-align: center; font-size: 32px; margin: 0;">🏆</p>
        <p style="text-align: center; font-size: 24px; font-weight: bold; margin: 8px 0;">${user.points + points} puntos</p>
        <p style="text-align: center; color: #71717a; margin: 0;">Tu saldo actual</p>
      </div>
      
      <p style="text-align: center;">
        <span class="status-badge status-${user.level}">${user.level.toUpperCase()}</span>
      </p>
      
      <p style="text-align: center; margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL}/rewards" class="button">
          Ver mis recompensas
        </a>
      </p>
    `;

    return this.send(user.email, `¡Ganaste ${points} puntos!`, html, {
      storeId: store?.id,
    });
  }

  /**
   * Email de bienvenida
   */
  async sendWelcome(user, store) {
    const html = `
      <h2>¡Bienvenido! 👋</h2>
      <p>Hola ${user.name || 'Cliente'},</p>
      <p>Gracias por registrarte en ${store?.name || 'nuestra app'}.</p>
      
      <div class="order-box">
        <h3 style="margin-top: 0;">🎁 Tu regalo de bienvenida</h3>
        <p>Usa el código <strong>BIENVENIDO10</strong> para obtener un 10% de descuento en tu primer pedido.</p>
      </div>
      
      <p style="text-align: center; margin-top: 24px;">
        <a href="${process.env.FRONTEND_URL}/menu" class="button">
          Hacer mi primer pedido
        </a>
      </p>
    `;

    return this.send(user.email, `¡Bienvenido a ${store?.name || 'nuestra app'}!`, html, {
      storeId: store?.id,
    });
  }
}

export const emailService = new EmailService();
export default emailService;

