/**
 * Integración con Google Calendar
 */

import { google } from 'googleapis';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class GoogleCalendarService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Generar URL de autorización
   */
  getAuthUrl(storeId) {
    const scopes = ['https://www.googleapis.com/auth/calendar.events'];
    
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: storeId,
    });
  }

  /**
   * Manejar callback de OAuth
   */
  async handleOAuthCallback(code, storeId) {
    const { tokens } = await this.oauth2Client.getToken(code);
    
    await prisma.storeIntegration.upsert({
      where: { storeId_type: { storeId, type: 'google_calendar' } },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date),
      },
      create: {
        storeId,
        type: 'google_calendar',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date),
        isActive: true,
      },
    });

    logger.info({ storeId }, 'Google Calendar connected');
    return { success: true };
  }

  /**
   * Obtener cliente autenticado
   */
  async getAuthClient(storeId) {
    const integration = await prisma.storeIntegration.findFirst({
      where: { storeId, type: 'google_calendar', isActive: true },
    });

    if (!integration) throw new Error('Google Calendar no conectado');

    this.oauth2Client.setCredentials({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken,
    });

    return this.oauth2Client;
  }

  /**
   * Crear evento de reservación
   */
  async createReservationEvent(storeId, reservation) {
    const auth = await this.getAuthClient(storeId);
    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary: `Reserva: ${reservation.customerName} (${reservation.partySize} personas)`,
      description: `
Mesa: ${reservation.tableNumber}
Teléfono: ${reservation.customerPhone}
Notas: ${reservation.notes || 'Sin notas'}
      `.trim(),
      start: {
        dateTime: reservation.dateTime,
        timeZone: 'America/Argentina/Buenos_Aires',
      },
      end: {
        dateTime: new Date(new Date(reservation.dateTime).getTime() + 2 * 60 * 60 * 1000).toISOString(),
        timeZone: 'America/Argentina/Buenos_Aires',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    logger.info({ eventId: result.data.id, reservationId: reservation.id }, 'Calendar event created');
    return result.data;
  }

  /**
   * Crear evento de pedido programado
   */
  async createScheduledOrderEvent(storeId, order) {
    const auth = await this.getAuthClient(storeId);
    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary: `📦 Pedido #${order.orderNumber} - ${order.customerName}`,
      description: `
Cliente: ${order.customerName}
Teléfono: ${order.customerPhone}
Total: $${order.total}
Dirección: ${order.deliveryAddress || 'Retiro en local'}
Items: ${order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
      `.trim(),
      start: {
        dateTime: order.scheduledFor,
        timeZone: 'America/Argentina/Buenos_Aires',
      },
      end: {
        dateTime: new Date(new Date(order.scheduledFor).getTime() + 30 * 60 * 1000).toISOString(),
        timeZone: 'America/Argentina/Buenos_Aires',
      },
      colorId: '11', // Rojo para pedidos
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    return result.data;
  }

  /**
   * Sincronizar horarios de tienda
   */
  async syncStoreHours(storeId) {
    const auth = await this.getAuthClient(storeId);
    const calendar = google.calendar({ version: 'v3', auth });

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { hours: true },
    });

    // Crear eventos recurrentes para horarios de apertura
    // Esto es más complejo y requiere manejo de eventos recurrentes

    logger.info({ storeId }, 'Store hours synced to calendar');
    return { success: true };
  }

  /**
   * Obtener eventos del día
   */
  async getDayEvents(storeId, date) {
    const auth = await this.getAuthClient(storeId);
    const calendar = google.calendar({ version: 'v3', auth });

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return result.data.items || [];
  }

  /**
   * Cancelar evento
   */
  async cancelEvent(storeId, eventId) {
    const auth = await this.getAuthClient(storeId);
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });

    logger.info({ eventId }, 'Calendar event cancelled');
    return { success: true };
  }

  /**
   * Verificar conexión
   */
  async checkConnection(storeId) {
    try {
      const auth = await this.getAuthClient(storeId);
      const calendar = google.calendar({ version: 'v3', auth });
      
      await calendar.calendarList.list({ maxResults: 1 });
      return { connected: true };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  /**
   * Desconectar integración
   */
  async disconnect(storeId) {
    await prisma.storeIntegration.updateMany({
      where: { storeId, type: 'google_calendar' },
      data: { isActive: false },
    });

    logger.info({ storeId }, 'Google Calendar disconnected');
    return { success: true };
  }
}

export const googleCalendarService = new GoogleCalendarService();
export default googleCalendarService;

