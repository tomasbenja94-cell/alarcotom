import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ========== SERVICIO DE BALANCES ==========
class BalanceService {
  // Sumar saldo por entrega (SOLO desde deliver-order, una vez por pedido)
  // Puede recibir un cliente de transacción opcional para usar dentro de otra transacción
  async addBalanceForDelivery(driverId, orderId, amount = 3000, txClient = null) {
    const client = txClient || prisma;
    
    // Validar que el pedido existe y está asignado al repartidor
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: { deliveryPerson: true }
    });

    if (!order) {
      throw new Error('Pedido no encontrado');
    }

    if (order.deliveryPersonId !== driverId) {
      throw new Error('Este pedido no está asignado a este repartidor');
    }

    if (order.status !== 'delivered') {
      throw new Error('El pedido debe estar entregado antes de sumar saldo');
    }

    // Verificar que no se haya sumado saldo anteriormente (solo si no estamos en una transacción)
    if (!txClient) {
      const existingTransaction = await prisma.driverBalanceTransaction.findFirst({
        where: { orderId, type: 'delivery' }
      });

      if (existingTransaction) {
        throw new Error('El saldo ya fue sumado para este pedido');
      }
    }

    // Si estamos en una transacción, ejecutar directamente
    if (txClient) {
      // 1. Crear transacción
      const transaction = await txClient.driverBalanceTransaction.create({
        data: {
          driverId,
          orderId,
          type: 'delivery',
          amount,
          reference: `Entrega pedido ${order.orderNumber}`
        }
      });

      // 2. Actualizar saldo
      await txClient.deliveryPerson.update({
        where: { id: driverId },
        data: { balance: { increment: amount } }
      });

      // 3. Log auditoría (async, no bloquea)
      this.logBalanceChange('delivery', driverId, amount, orderId).catch(console.error);

      return transaction;
    }

    // Si no estamos en una transacción, crear una nueva
    return await prisma.$transaction(async (tx) => {
      // 1. Crear transacción
      const transaction = await tx.driverBalanceTransaction.create({
        data: {
          driverId,
          orderId,
          type: 'delivery',
          amount,
          reference: `Entrega pedido ${order.orderNumber}`
        }
      });

      // 2. Actualizar saldo
      await tx.deliveryPerson.update({
        where: { id: driverId },
        data: { balance: { increment: amount } }
      });

      // 3. Log auditoría (async, no bloquea)
      this.logBalanceChange('delivery', driverId, amount, orderId).catch(console.error);

      return transaction;
    });
  }

  // Registrar pago del admin (SOLO admin puede llamar esto)
  async registerAdminPayment(driverId, amount, adminId, reference) {
    // Validar que el saldo no se vuelva negativo
    const driver = await prisma.deliveryPerson.findUnique({
      where: { id: driverId },
      select: { balance: true }
    });

    if (!driver) {
      throw new Error('Repartidor no encontrado');
    }

    if (driver.balance - amount < 0) {
      throw new Error('El saldo no puede ser negativo');
    }

    // Transacción atómica
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.driverBalanceTransaction.create({
        data: {
          driverId,
          type: 'pago_admin',
          amount: -amount, // Negativo porque es un pago
          reference: reference || `Pago realizado por admin`
        }
      });

      await tx.deliveryPerson.update({
        where: { id: driverId },
        data: { balance: { decrement: amount } }
      });

      return transaction;
    });
  }

  // Registrar cobro en efectivo a domicilio (SOLO desde deliver-order)
  // Puede recibir un cliente de transacción opcional para usar dentro de otra transacción
  async addCashCollectionForDelivery(driverId, orderId, amount, customerAddress, txClient = null) {
    const client = txClient || prisma;
    
    // Validar que el pedido existe y está asignado al repartidor
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: { deliveryPerson: true }
    });

    if (!order) {
      throw new Error('Pedido no encontrado');
    }

    if (order.deliveryPersonId !== driverId) {
      throw new Error('Este pedido no está asignado a este repartidor');
    }

    if (order.status !== 'delivered') {
      throw new Error('El pedido debe estar entregado antes de registrar el cobro en efectivo');
    }

    // Verificar que no se haya registrado el cobro anteriormente (solo si no estamos en una transacción)
    if (!txClient) {
      const existingTransaction = await prisma.driverBalanceTransaction.findFirst({
        where: { orderId, type: 'cash_collection' }
      });

      if (existingTransaction) {
        throw new Error('El cobro en efectivo ya fue registrado para este pedido');
      }
    }

    // Formatear fecha y hora en formato DD/MM - HH:MM
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const reference = `Cobro en efectivo a cliente direccion: ${customerAddress || 'N/A'}`;

    // Si estamos en una transacción, ejecutar directamente
    if (txClient) {
      // Crear transacción de cobro en efectivo
      const transaction = await txClient.driverBalanceTransaction.create({
        data: {
          driverId,
          orderId,
          type: 'cash_collection',
          amount,
          reference: reference
        }
      });

      // Actualizar saldo
      await txClient.deliveryPerson.update({
        where: { id: driverId },
        data: { balance: { increment: amount } }
      });

      // Log auditoría (async, no bloquea)
      this.logBalanceChange('cash_collection', driverId, amount, orderId).catch(console.error);

      return transaction;
    }

    // Si no estamos en una transacción, crear una nueva
    return await prisma.$transaction(async (tx) => {
      // Crear transacción de cobro en efectivo
      const transaction = await tx.driverBalanceTransaction.create({
        data: {
          driverId,
          orderId,
          type: 'cash_collection',
          amount,
          reference: reference
        }
      });

      // Actualizar saldo
      await tx.deliveryPerson.update({
        where: { id: driverId },
        data: { balance: { increment: amount } }
      });

      // Log auditoría (async, no bloquea)
      this.logBalanceChange('cash_collection', driverId, amount, orderId).catch(console.error);

      return transaction;
    });
  }

  // Log de cambios de saldo (auditoría) - ahora usa auditService
  async logBalanceChange(type, driverId, amount, orderId, adminId) {
    // Importar auditService dinámicamente para evitar dependencia circular
    const { auditService } = await import('./audit.service.js');
    await auditService.logBalanceChange(driverId, amount, type, orderId, adminId);
  }

  // Obtener historial de transacciones (solo el propio repartidor o admin)
  async getTransactionHistory(driverId, requesterId, requesterRole) {
    // Verificar permisos
    if (requesterRole !== 'admin' && requesterRole !== 'super_admin' && requesterId !== driverId) {
      throw new Error('No tienes permiso para ver este historial');
    }

    return await prisma.driverBalanceTransaction.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { orderNumber: true } } },
      take: 100 // Limitar a 100 últimas transacciones
    });
  }
}

export const balanceService = new BalanceService();

