/**
 * Generador de QR Dinámicos
 */

import QRCode from 'qrcode';
import logger from '../utils/logger.js';

class QRGeneratorService {
  /**
   * Generar QR para mesa
   */
  async generateTableQR(storeId, tableId, tableNumber, options = {}) {
    const { format = 'dataURL', size = 300, color = '#000000', logo = null } = options;

    const baseUrl = process.env.FRONTEND_URL || 'https://tuapp.com';
    const url = `${baseUrl}/menu/${storeId}?table=${tableNumber}&tid=${tableId}`;

    const qrOptions = {
      errorCorrectionLevel: 'H',
      type: format === 'dataURL' ? 'image/png' : 'svg',
      width: size,
      margin: 2,
      color: {
        dark: color,
        light: '#FFFFFF',
      },
    };

    try {
      let qrData;
      
      if (format === 'dataURL') {
        qrData = await QRCode.toDataURL(url, qrOptions);
      } else if (format === 'svg') {
        qrData = await QRCode.toString(url, { ...qrOptions, type: 'svg' });
      } else if (format === 'buffer') {
        qrData = await QRCode.toBuffer(url, qrOptions);
      }

      return {
        url,
        qr: qrData,
        format,
        tableNumber,
        tableId,
      };
    } catch (error) {
      logger.error({ error: error.message, tableId }, 'QR generation failed');
      throw error;
    }
  }

  /**
   * Generar QR para menú general
   */
  async generateMenuQR(storeId, options = {}) {
    const { format = 'dataURL', size = 300 } = options;
    const baseUrl = process.env.FRONTEND_URL || 'https://tuapp.com';
    const url = `${baseUrl}/menu/${storeId}`;

    const qrData = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      width: size,
      margin: 2,
    });

    return { url, qr: qrData, format };
  }

  /**
   * Generar QR para pedido (tracking)
   */
  async generateOrderTrackingQR(orderId, trackingToken, options = {}) {
    const { format = 'dataURL', size = 200 } = options;
    const baseUrl = process.env.FRONTEND_URL || 'https://tuapp.com';
    const url = `${baseUrl}/tracking/${trackingToken}`;

    const qrData = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      width: size,
      margin: 1,
    });

    return { url, qr: qrData, orderId };
  }

  /**
   * Generar QR para WhatsApp
   */
  async generateWhatsAppQR(phoneNumber, message = '', options = {}) {
    const { format = 'dataURL', size = 300 } = options;
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${phoneNumber.replace('+', '')}${message ? `?text=${encodedMessage}` : ''}`;

    const qrData = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      width: size,
      margin: 2,
      color: { dark: '#25D366', light: '#FFFFFF' },
    });

    return { url, qr: qrData };
  }

  /**
   * Generar QR para pago (MercadoPago)
   */
  async generatePaymentQR(paymentUrl, options = {}) {
    const { format = 'dataURL', size = 250 } = options;

    const qrData = await QRCode.toDataURL(paymentUrl, {
      errorCorrectionLevel: 'H',
      width: size,
      margin: 2,
      color: { dark: '#009EE3', light: '#FFFFFF' },
    });

    return { url: paymentUrl, qr: qrData };
  }

  /**
   * Generar batch de QRs para todas las mesas
   */
  async generateAllTableQRs(storeId, tables, options = {}) {
    const results = [];

    for (const table of tables) {
      const qr = await this.generateTableQR(storeId, table.id, table.number, options);
      results.push({
        ...qr,
        tableName: table.name,
        zone: table.zone,
      });
    }

    return results;
  }

  /**
   * Generar PDF con QRs de mesas para imprimir
   */
  async generateTableQRsPDF(storeId, tables, storeInfo = {}) {
    // Generar todos los QRs
    const qrs = await this.generateAllTableQRs(storeId, tables, { size: 400 });

    // Crear HTML para PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    .page { page-break-after: always; text-align: center; padding: 40px; }
    .page:last-child { page-break-after: avoid; }
    .qr-container { margin: 20px auto; }
    .qr-container img { width: 300px; height: 300px; }
    .store-name { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .table-name { font-size: 32px; font-weight: bold; margin: 20px 0; }
    .instructions { font-size: 14px; color: #666; margin-top: 20px; }
    .wifi-info { margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 10px; }
  </style>
</head>
<body>
  ${qrs.map(qr => `
    <div class="page">
      <div class="store-name">${storeInfo.name || 'Restaurante'}</div>
      <div class="table-name">${qr.tableName}</div>
      <div class="qr-container">
        <img src="${qr.qr}" alt="QR Mesa ${qr.tableNumber}" />
      </div>
      <div class="instructions">
        Escanea el código QR para ver el menú y hacer tu pedido
      </div>
      ${storeInfo.wifiName ? `
        <div class="wifi-info">
          <strong>WiFi:</strong> ${storeInfo.wifiName}<br>
          <strong>Contraseña:</strong> ${storeInfo.wifiPassword || 'Consultar al mozo'}
        </div>
      ` : ''}
    </div>
  `).join('')}
</body>
</html>`;

    return { html, qrCount: qrs.length };
  }

  /**
   * Generar QR con logo personalizado
   */
  async generateBrandedQR(url, logoUrl, options = {}) {
    const { size = 300, logoSize = 60 } = options;

    // Generar QR base
    const qrData = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H', // Alto para soportar logo
      width: size,
      margin: 2,
    });

    // El logo se agregaría en el frontend con canvas
    // Retornamos los datos necesarios
    return {
      qr: qrData,
      logo: logoUrl,
      logoSize,
      url,
    };
  }
}

export const qrGeneratorService = new QRGeneratorService();
export default qrGeneratorService;

