import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ========== MÁQUINA DE ESTADOS PARA PEDIDOS ==========
class OrderStateValidator {
  // Estados válidos
  static STATES = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PREPARING: 'preparing',
    READY: 'ready',
    ASSIGNED: 'assigned',
    IN_TRANSIT: 'in_transit',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled'
  };

  // Transiciones permitidas (usar strings directamente ya que this no está disponible en propiedades estáticas)
  static ALLOWED_TRANSITIONS = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['preparing', 'cancelled'],
    'preparing': ['ready', 'cancelled'],
    'ready': ['assigned', 'cancelled'],
    'assigned': ['in_transit', 'cancelled'],
    'in_transit': ['delivered', 'cancelled'],
    'delivered': [], // Estado final, no se puede cambiar
    'cancelled': [] // Estado final, no se puede cambiar
  };

  // Roles permitidos para cada transición
  static ROLE_PERMISSIONS = {
    'pending': {
      'confirmed': ['admin', 'super_admin', 'operator'],
      'cancelled': ['admin', 'super_admin', 'operator']
    },
    'confirmed': {
      'preparing': ['admin', 'super_admin', 'operator'],
      'cancelled': ['admin', 'super_admin', 'operator']
    },
    'preparing': {
      'ready': ['admin', 'super_admin', 'operator'],
      'cancelled': ['admin', 'super_admin', 'operator']
    },
    'ready': {
      'assigned': ['admin', 'super_admin'], // Solo admin puede asignar
      'cancelled': ['admin', 'super_admin', 'operator']
    },
    'assigned': {
      'in_transit': ['driver'], // Solo repartidor puede cambiar a in_transit
      'cancelled': ['admin', 'super_admin', 'operator']
    },
    'in_transit': {
      'delivered': ['driver'], // Solo repartidor puede entregar
      'cancelled': ['admin', 'super_admin', 'operator']
    }
  };

  // Validar si una transición es permitida
  static validateTransition(oldStatus, newStatus, userRole = null) {
    // Verificar que el estado anterior existe
    if (!OrderStateValidator.ALLOWED_TRANSITIONS[oldStatus]) {
      return {
        valid: false,
        error: `Estado anterior inválido: ${oldStatus}`
      };
    }

    // Verificar que el estado nuevo existe
    const validStates = Object.values(OrderStateValidator.STATES);
    if (!validStates.includes(newStatus)) {
      return {
        valid: false,
        error: `Estado nuevo inválido: ${newStatus}`
      };
    }

    // Verificar que la transición está permitida
    const allowedNextStates = OrderStateValidator.ALLOWED_TRANSITIONS[oldStatus];
    if (!allowedNextStates.includes(newStatus)) {
      return {
        valid: false,
        error: `Transición no permitida: ${oldStatus} -> ${newStatus}. Estados permitidos: ${allowedNextStates.join(', ')}`
      };
    }

    // Verificar permisos por rol
    if (userRole) {
      const rolePermissions = OrderStateValidator.ROLE_PERMISSIONS[oldStatus];
      if (rolePermissions && rolePermissions[newStatus]) {
        const allowedRoles = rolePermissions[newStatus];
        if (!allowedRoles.includes(userRole)) {
          return {
            valid: false,
            error: `Rol '${userRole}' no tiene permiso para cambiar de ${oldStatus} a ${newStatus}. Roles permitidos: ${allowedRoles.join(', ')}`
          };
        }
      }
    }

    return { valid: true };
  }

  // Validar estado de pedido antes de actualizar
  async validateOrderStatusChange(orderId, newStatus, userRole = null) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true }
      });

      if (!order) {
        return {
          valid: false,
          error: 'Pedido no encontrado'
        };
      }

      // Validar transición
      const validation = OrderStateValidator.validateTransition(order.status, newStatus, userRole);

      if (!validation.valid) {
        return validation;
      }

      // Validaciones adicionales según el estado
      if (newStatus === OrderStateValidator.STATES.ASSIGNED) {
        // Verificar que tenga repartidor asignado
        const orderWithDriver = await prisma.order.findUnique({
          where: { id: orderId },
          select: { deliveryPersonId: true }
        });

        if (!orderWithDriver.deliveryPersonId) {
          return {
            valid: false,
            error: 'No se puede asignar un pedido sin repartidor'
          };
        }
      }

      if (newStatus === OrderStateValidator.STATES.DELIVERED) {
        // Verificar que tenga código de entrega válido
        const orderWithCode = await prisma.order.findUnique({
          where: { id: orderId },
          select: { deliveryCode: true, status: true }
        });

        if (orderWithCode.status !== OrderStateValidator.STATES.IN_TRANSIT) {
          return {
            valid: false,
            error: 'Solo se puede entregar un pedido que esté en tránsito'
          };
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Error validando cambio de estado: ${error.message}`
      };
    }
  }

  // Obtener estados siguientes permitidos
  getNextAllowedStates(currentStatus, userRole = null) {
    const allowedNextStates = OrderStateValidator.ALLOWED_TRANSITIONS[currentStatus] || [];
    
    if (!userRole) {
      return allowedNextStates;
    }

    // Filtrar por permisos de rol
    const rolePermissions = OrderStateValidator.ROLE_PERMISSIONS[currentStatus];
    if (!rolePermissions) {
      return allowedNextStates;
    }

    return allowedNextStates.filter(state => {
      const allowedRoles = rolePermissions[state];
      return !allowedRoles || allowedRoles.includes(userRole);
    });
  }
}

const orderStateValidator = new OrderStateValidator();
export { orderStateValidator };

