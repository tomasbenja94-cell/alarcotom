import { z } from 'zod';

// ========== VALIDADORES DE PEDIDOS ==========
export const createOrderSchema = z.object({
  customer_name: z.string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  
  customer_phone: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Número de teléfono inválido')
    .optional()
    .nullable(),
  
  customer_address: z.string()
    .max(500, 'La dirección no puede exceder 500 caracteres')
    .optional()
    .nullable(),
  
  customer_lat: z.number()
    .min(-90, 'Latitud inválida')
    .max(90, 'Latitud inválida')
    .optional()
    .nullable(),
  
  customer_lng: z.number()
    .min(-180, 'Longitud inválida')
    .max(180, 'Longitud inválida')
    .optional()
    .nullable(),
  
  payment_method: z.enum(['efectivo', 'transferencia', 'mercado_pago', 'tarjeta'])
    .optional()
    .nullable(),
  
  subtotal: z.number()
    .positive('El subtotal debe ser positivo')
    .max(1000000, 'El subtotal es demasiado alto'),
  
  delivery_fee: z.number()
    .min(0, 'El costo de envío no puede ser negativo')
    .max(10000, 'El costo de envío es demasiado alto')
    .default(0),
  
  total: z.number()
    .positive('El total debe ser positivo')
    .max(1000000, 'El total es demasiado alto'),
  
  notes: z.string()
    .max(1000, 'Las notas no pueden exceder 1000 caracteres')
    .optional()
    .nullable(),
  
  items: z.array(z.object({
    product_id: z.string().uuid('ID de producto inválido').optional().nullable(),
    product_name: z.string().min(1).max(200),
    quantity: z.number().int().positive().max(100),
    unit_price: z.number().positive().max(50000),
    subtotal: z.number().positive().max(5000000),
    selected_options: z.record(z.any()).optional()
  })).min(1, 'Debe tener al menos un item')
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'assigned',
    'in_transit',
    'delivered',
    'cancelled'
  ]),
  reason: z.string().max(500).optional()
});

// ========== VALIDADORES DE REPARTIDORES ==========
export const createDeliveryPersonSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'El nombre no puede exceder 100 caracteres'),
  phone: z.string()
    .min(12, 'El teléfono debe tener al menos 12 caracteres (incluyendo prefijo +54)')
    .max(20, 'El teléfono no puede exceder 20 caracteres')
    .regex(/^\+[0-9]{11,19}$/, 'El teléfono debe empezar con + seguido de números (ej: +5491234567890)'),
  username: z.string()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(50, 'El usuario no puede exceder 50 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'El usuario solo puede contener letras, números y guiones bajos'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(100, 'La contraseña no puede exceder 100 caracteres'),
  is_active: z.boolean().optional().default(true)
});

export const loginDriverSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const locationUpdateSchema = z.object({
  driver_id: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

// ========== VALIDADORES DE CÓDIGOS DE ENTREGA ==========
export const deliveryCodeSchema = z.string()
  .length(4, 'El código debe tener 4 dígitos')
  .regex(/^\d{4}$/, 'El código solo puede contener números');

export const deliverOrderSchema = z.object({
  driver_id: z.string().uuid(),
  order_id: z.string().uuid(),
  delivery_code: z.string().min(3).max(6) // Permitir espacios/guiones que se normalizarán
});

export const cancelDeliverySchema = z.object({
  driver_id: z.string().uuid(),
  order_id: z.string().uuid(),
  reason: z.enum([
    'NO_ENTREGO_EL_CODIGO',
    'NO_ESTABA',
    'DIRECCION_INCORRECTA',
    'CLIENTE_RECHAZO',
    'OTRO'
  ]),
  notes: z.string().max(500).optional()
});

// ========== VALIDADORES DE BALANCES ==========
export const registerPaymentSchema = z.object({
  driver_id: z.string().uuid(),
  amount: z.number()
    .positive('El monto debe ser positivo')
    .max(1000000, 'El monto es demasiado alto')
    .multipleOf(0.01, 'El monto debe tener máximo 2 decimales'),
  reference: z.string().max(500).optional()
});

// ========== VALIDADORES DE CLIENTES ==========
export const createCustomerSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  name: z.string().min(2).max(100).optional().nullable(),
  is_blocked: z.boolean().optional().default(false),
  disabled_payment_methods: z.array(z.string()).optional().nullable(),
  notes: z.string().max(1000).optional().nullable()
});

// ========== VALIDADORES DE UBICACIÓN ==========
export function validateArgentinaCoordinates(lat, lng) {
  // Argentina aproximada: -55 a -21 lat, -73 a -53 lng
  return lat >= -55 && lat <= -21 && lng >= -73 && lng <= -53;
}

