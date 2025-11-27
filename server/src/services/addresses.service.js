/**
 * Sistema de Direcciones Guardadas
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class AddressesService {
  /**
   * Agregar dirección
   */
  async addAddress(customerId, addressData) {
    const { 
      label, street, number, floor, apartment, 
      city, postalCode, lat, lng, instructions, isDefault 
    } = addressData;

    // Si es default, quitar default de las demás
    if (isDefault) {
      await prisma.customerAddress.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });
    }

    // Si es la primera, hacerla default
    const count = await prisma.customerAddress.count({ where: { customerId } });

    const address = await prisma.customerAddress.create({
      data: {
        customerId,
        label: label || 'Casa',
        street,
        number,
        floor,
        apartment,
        city,
        postalCode,
        lat,
        lng,
        instructions,
        isDefault: isDefault || count === 0,
        fullAddress: this.buildFullAddress({ street, number, floor, apartment, city }),
      },
    });

    logger.info({ addressId: address.id, customerId }, 'Address added');
    return address;
  }

  buildFullAddress({ street, number, floor, apartment, city }) {
    let full = `${street} ${number}`;
    if (floor) full += `, Piso ${floor}`;
    if (apartment) full += ` ${apartment}`;
    if (city) full += `, ${city}`;
    return full;
  }

  /**
   * Obtener direcciones del cliente
   */
  async getAddresses(customerId) {
    return prisma.customerAddress.findMany({
      where: { customerId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Obtener dirección por defecto
   */
  async getDefaultAddress(customerId) {
    return prisma.customerAddress.findFirst({
      where: { customerId, isDefault: true, isActive: true },
    });
  }

  /**
   * Actualizar dirección
   */
  async updateAddress(addressId, customerId, updates) {
    const address = await prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!address || address.customerId !== customerId) {
      throw new Error('Dirección no encontrada');
    }

    // Si se marca como default
    if (updates.isDefault) {
      await prisma.customerAddress.updateMany({
        where: { customerId, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    // Reconstruir fullAddress si cambió algo
    if (updates.street || updates.number || updates.floor || updates.apartment || updates.city) {
      updates.fullAddress = this.buildFullAddress({
        street: updates.street || address.street,
        number: updates.number || address.number,
        floor: updates.floor || address.floor,
        apartment: updates.apartment || address.apartment,
        city: updates.city || address.city,
      });
    }

    return prisma.customerAddress.update({
      where: { id: addressId },
      data: updates,
    });
  }

  /**
   * Eliminar dirección (soft delete)
   */
  async deleteAddress(addressId, customerId) {
    const address = await prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!address || address.customerId !== customerId) {
      throw new Error('Dirección no encontrada');
    }

    await prisma.customerAddress.update({
      where: { id: addressId },
      data: { isActive: false },
    });

    // Si era default, hacer default otra
    if (address.isDefault) {
      const another = await prisma.customerAddress.findFirst({
        where: { customerId, isActive: true },
      });
      if (another) {
        await prisma.customerAddress.update({
          where: { id: another.id },
          data: { isDefault: true },
        });
      }
    }

    return { success: true };
  }

  /**
   * Establecer como default
   */
  async setDefault(addressId, customerId) {
    const address = await prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!address || address.customerId !== customerId) {
      throw new Error('Dirección no encontrada');
    }

    await prisma.customerAddress.updateMany({
      where: { customerId },
      data: { isDefault: false },
    });

    await prisma.customerAddress.update({
      where: { id: addressId },
      data: { isDefault: true },
    });

    return { success: true };
  }

  /**
   * Buscar dirección por coordenadas (reverse geocoding simplificado)
   */
  async findNearestAddress(customerId, lat, lng, radiusKm = 0.1) {
    const addresses = await prisma.customerAddress.findMany({
      where: { customerId, isActive: true, lat: { not: null } },
    });

    for (const addr of addresses) {
      const distance = this.calculateDistance(lat, lng, addr.lat, addr.lng);
      if (distance <= radiusKm) {
        return addr;
      }
    }

    return null;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Direcciones recientes (de pedidos)
   */
  async getRecentAddresses(customerId, limit = 5) {
    const orders = await prisma.order.findMany({
      where: { 
        customerId, 
        type: 'delivery',
        deliveryAddress: { not: null },
      },
      select: { deliveryAddress: true, deliveryLat: true, deliveryLng: true },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
    });

    // Eliminar duplicados
    const seen = new Set();
    const unique = [];

    for (const order of orders) {
      if (!seen.has(order.deliveryAddress)) {
        seen.add(order.deliveryAddress);
        unique.push({
          address: order.deliveryAddress,
          lat: order.deliveryLat,
          lng: order.deliveryLng,
        });
      }
      if (unique.length >= limit) break;
    }

    return unique;
  }

  /**
   * Labels predefinidos
   */
  getAddressLabels() {
    return [
      { id: 'home', label: 'Casa', icon: '🏠' },
      { id: 'work', label: 'Trabajo', icon: '🏢' },
      { id: 'partner', label: 'Pareja', icon: '💑' },
      { id: 'other', label: 'Otro', icon: '📍' },
    ];
  }
}

export const addressesService = new AddressesService();
export default addressesService;

