/**
 * Sistema de Catering y Eventos
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class CateringService {
  EVENT_TYPES = ['corporate', 'wedding', 'birthday', 'meeting', 'party', 'other'];

  /**
   * Crear solicitud de catering
   */
  async createRequest(storeId, requestData) {
    const {
      customerName, customerEmail, customerPhone, companyName,
      eventType, eventDate, eventTime, guestCount, venue,
      budget, dietaryRequirements, notes, selectedPackage,
    } = requestData;

    const request = await prisma.cateringRequest.create({
      data: {
        storeId,
        requestNumber: this.generateRequestNumber(),
        customerName,
        customerEmail,
        customerPhone,
        companyName,
        eventType,
        eventDate: new Date(eventDate),
        eventTime,
        guestCount,
        venue,
        budget,
        dietaryRequirements: dietaryRequirements || [],
        notes,
        selectedPackage,
        status: 'pending',
      },
    });

    logger.info({ requestId: request.id, eventType, guestCount }, 'Catering request created');
    return request;
  }

  generateRequestNumber() {
    return 'CAT-' + Date.now().toString(36).toUpperCase();
  }

  /**
   * Crear paquete de catering
   */
  async createPackage(storeId, packageData) {
    const {
      name, description, pricePerPerson, minGuests, maxGuests,
      items, includes, setupTime, staffIncluded,
    } = packageData;

    const pkg = await prisma.cateringPackage.create({
      data: {
        storeId,
        name,
        description,
        pricePerPerson,
        minGuests: minGuests || 10,
        maxGuests: maxGuests || 500,
        items: JSON.stringify(items),
        includes: includes || [],
        setupTime: setupTime || 60,
        staffIncluded: staffIncluded || false,
        isActive: true,
      },
    });

    return pkg;
  }

  /**
   * Generar cotización
   */
  async generateQuote(requestId) {
    const request = await prisma.cateringRequest.findUnique({
      where: { id: requestId },
      include: { package: true },
    });

    if (!request) throw new Error('Solicitud no encontrada');

    const basePrice = request.package
      ? request.package.pricePerPerson * request.guestCount
      : request.guestCount * 500; // Precio base por defecto

    // Calcular extras
    let extras = 0;
    if (request.dietaryRequirements?.includes('vegan')) extras += request.guestCount * 50;
    if (request.dietaryRequirements?.includes('gluten_free')) extras += request.guestCount * 30;

    // Descuento por volumen
    let discount = 0;
    if (request.guestCount >= 100) discount = basePrice * 0.1;
    else if (request.guestCount >= 50) discount = basePrice * 0.05;

    const subtotal = basePrice + extras - discount;
    const tax = Math.round(subtotal * 0.21);
    const total = subtotal + tax;

    const quote = await prisma.cateringQuote.create({
      data: {
        requestId,
        basePrice,
        extras,
        discount,
        subtotal,
        tax,
        total,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'sent',
        breakdown: JSON.stringify({
          pricePerPerson: basePrice / request.guestCount,
          guestCount: request.guestCount,
          dietaryExtras: extras,
          volumeDiscount: discount,
        }),
      },
    });

    await prisma.cateringRequest.update({
      where: { id: requestId },
      data: { status: 'quoted', currentQuoteId: quote.id },
    });

    logger.info({ requestId, quoteId: quote.id, total }, 'Quote generated');
    return quote;
  }

  /**
   * Aceptar cotización
   */
  async acceptQuote(quoteId, depositAmount = null) {
    const quote = await prisma.cateringQuote.findUnique({
      where: { id: quoteId },
      include: { request: true },
    });

    if (!quote || quote.status !== 'sent') throw new Error('Cotización no válida');
    if (quote.validUntil < new Date()) throw new Error('Cotización expirada');

    const deposit = depositAmount || Math.round(quote.total * 0.3);

    await prisma.cateringQuote.update({
      where: { id: quoteId },
      data: { status: 'accepted', acceptedAt: new Date() },
    });

    const booking = await prisma.cateringBooking.create({
      data: {
        requestId: quote.requestId,
        quoteId,
        storeId: quote.request.storeId,
        eventDate: quote.request.eventDate,
        totalAmount: quote.total,
        depositAmount: deposit,
        depositPaid: false,
        balanceDue: quote.total - deposit,
        status: 'pending_deposit',
      },
    });

    await prisma.cateringRequest.update({
      where: { id: quote.requestId },
      data: { status: 'booked' },
    });

    logger.info({ bookingId: booking.id, quoteId }, 'Quote accepted, booking created');
    return booking;
  }

  /**
   * Registrar pago de depósito
   */
  async recordDeposit(bookingId, paymentMethod) {
    const booking = await prisma.cateringBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Reserva no encontrada');

    await prisma.cateringBooking.update({
      where: { id: bookingId },
      data: {
        depositPaid: true,
        depositPaidAt: new Date(),
        depositPaymentMethod: paymentMethod,
        status: 'confirmed',
      },
    });

    return { success: true };
  }

  /**
   * Obtener menú de catering
   */
  async getCateringMenu(storeId) {
    const packages = await prisma.cateringPackage.findMany({
      where: { storeId, isActive: true },
      orderBy: { pricePerPerson: 'asc' },
    });

    return packages.map(pkg => ({
      ...pkg,
      items: JSON.parse(pkg.items || '[]'),
    }));
  }

  /**
   * Listar solicitudes
   */
  async listRequests(storeId, status = null) {
    return prisma.cateringRequest.findMany({
      where: { storeId, status: status || undefined },
      include: { quotes: true, booking: true },
      orderBy: { eventDate: 'asc' },
    });
  }

  /**
   * Calendario de eventos
   */
  async getEventsCalendar(storeId, month, year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const bookings = await prisma.cateringBooking.findMany({
      where: {
        storeId,
        eventDate: { gte: startDate, lte: endDate },
        status: { in: ['confirmed', 'in_progress'] },
      },
      include: {
        request: { select: { customerName, eventType, guestCount, venue } },
      },
    });

    return bookings.map(b => ({
      date: b.eventDate,
      customerName: b.request.customerName,
      eventType: b.request.eventType,
      guestCount: b.request.guestCount,
      venue: b.request.venue,
      status: b.status,
    }));
  }

  /**
   * Estadísticas de catering
   */
  async getCateringStats(storeId, year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const bookings = await prisma.cateringBooking.findMany({
      where: {
        storeId,
        eventDate: { gte: startDate, lte: endDate },
        status: { in: ['confirmed', 'completed'] },
      },
      include: { request: true },
    });

    const totalRevenue = bookings.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalEvents = bookings.length;
    const avgEventSize = totalEvents > 0
      ? Math.round(bookings.reduce((sum, b) => sum + b.request.guestCount, 0) / totalEvents)
      : 0;

    const byEventType = {};
    bookings.forEach(b => {
      const type = b.request.eventType;
      if (!byEventType[type]) byEventType[type] = { count: 0, revenue: 0 };
      byEventType[type].count++;
      byEventType[type].revenue += b.totalAmount;
    });

    return {
      year,
      totalRevenue,
      totalEvents,
      avgEventSize,
      avgRevenuePerEvent: totalEvents > 0 ? Math.round(totalRevenue / totalEvents) : 0,
      byEventType,
    };
  }
}

export const cateringService = new CateringService();
export default cateringService;
