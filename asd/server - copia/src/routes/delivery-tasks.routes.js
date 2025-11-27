/**
 * Rutas para sistema de tareas globales de delivery
 * Pool global de tareas, aceptación, retiro y envío múltiple
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateDriver } from '../middlewares/auth.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/delivery-tasks/available
 * Obtiene todas las tareas disponibles (pedidos listos para delivery de todos los locales)
 */
router.get('/available', authenticateDriver, async (req, res) => {
  try {
    const tasks = await prisma.order.findMany({
      where: {
        status: 'ready', // Solo pedidos listos
        deliveryFee: { gt: 0 }, // Solo delivery (no retiro en local)
        deliveryStatus: { in: [null, 'available'] }, // No asignados
        deliveryPersonId: null
      },
      include: {
        store: {
          select: { id: true, name: true, imageUrl: true }
        },
        items: {
          select: { productName: true, quantity: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const formattedTasks = tasks.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      store: {
        id: order.store?.id,
        name: order.store?.name || 'Sin nombre',
        image: order.store?.imageUrl
      },
      customer: {
        name: order.customerName,
        address: order.customerAddress,
        lat: order.customerLat,
        lng: order.customerLng
      },
      items: order.items.map(i => `${i.quantity}x ${i.productName}`),
      total: order.total,
      deliveryFee: order.deliveryFee,
      createdAt: order.createdAt,
      status: 'available'
    }));

    res.json(formattedTasks);
  } catch (error) {
    console.error('Error obteniendo tareas disponibles:', error);
    res.status(500).json({ error: 'Error obteniendo tareas' });
  }
});

/**
 * POST /api/delivery-tasks/:orderId/accept
 * El repartidor acepta una tarea
 */
router.post('/:orderId/accept', authenticateDriver, async (req, res) => {
  try {
    const { orderId } = req.params;
    const driverId = req.user.id;

    // Verificar que la tarea está disponible
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (order.deliveryPersonId && order.deliveryPersonId !== driverId) {
      return res.status(400).json({ error: 'Este pedido ya fue aceptado por otro repartidor' });
    }

    // Asignar al repartidor
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryPersonId: driverId,
        deliveryStatus: 'accepted',
        acceptedAt: new Date(),
        status: 'assigned'
      },
      include: {
        store: { select: { name: true } }
      }
    });

    res.json({
      success: true,
      message: 'Tarea aceptada',
      order: {
        id: updated.id,
        orderNumber: updated.orderNumber,
        storeName: updated.store?.name,
        status: 'accepted'
      }
    });
  } catch (error) {
    console.error('Error aceptando tarea:', error);
    res.status(500).json({ error: 'Error aceptando tarea' });
  }
});

/**
 * GET /api/delivery-tasks/my-tasks
 * Obtiene las tareas del repartidor (aceptadas, retiradas, en ruta)
 */
router.get('/my-tasks', authenticateDriver, async (req, res) => {
  try {
    const driverId = req.user.id;

    const tasks = await prisma.order.findMany({
      where: {
        deliveryPersonId: driverId,
        status: { in: ['assigned', 'in_transit'] },
        deliveryStatus: { in: ['accepted', 'picked_up', 'in_multi_route', 'delivering'] }
      },
      include: {
        store: { select: { id: true, name: true, imageUrl: true } },
        items: { select: { productName: true, quantity: true } }
      },
      orderBy: [
        { multiRouteOrder: 'asc' },
        { acceptedAt: 'asc' }
      ]
    });

    // Agrupar por estado
    const accepted = tasks.filter(t => t.deliveryStatus === 'accepted');
    const pickedUp = tasks.filter(t => t.deliveryStatus === 'picked_up');
    const inRoute = tasks.filter(t => ['in_multi_route', 'delivering'].includes(t.deliveryStatus || ''));

    const formatTask = (order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      store: {
        id: order.store?.id,
        name: order.store?.name || 'Sin nombre',
        image: order.store?.imageUrl
      },
      customer: {
        name: order.customerName,
        address: order.customerAddress,
        lat: order.customerLat,
        lng: order.customerLng,
        phone: order.customerPhone
      },
      items: order.items.map(i => `${i.quantity}x ${i.productName}`),
      total: order.total,
      deliveryFee: order.deliveryFee,
      deliveryCode: order.deliveryCode,
      deliveryStatus: order.deliveryStatus,
      multiRouteOrder: order.multiRouteOrder,
      acceptedAt: order.acceptedAt,
      pickedUpAt: order.pickedUpAt
    });

    res.json({
      accepted: accepted.map(formatTask),
      pickedUp: pickedUp.map(formatTask),
      inRoute: inRoute.map(formatTask)
    });
  } catch (error) {
    console.error('Error obteniendo mis tareas:', error);
    res.status(500).json({ error: 'Error obteniendo tareas' });
  }
});

/**
 * POST /api/delivery-tasks/:orderId/pickup
 * Marcar pedido como retirado del local
 */
router.post('/:orderId/pickup', authenticateDriver, async (req, res) => {
  try {
    const { orderId } = req.params;
    const driverId = req.user.id;

    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (order.deliveryPersonId !== driverId) {
      return res.status(403).json({ error: 'No tienes asignado este pedido' });
    }

    // Generar código de entrega si no existe
    let deliveryCode = order.deliveryCode;
    if (!deliveryCode) {
      deliveryCode = Math.floor(1000 + Math.random() * 9000).toString();
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryStatus: 'picked_up',
        pickedUpAt: new Date(),
        deliveryCode
      }
    });

    // NO enviar mensaje WhatsApp aquí - el mensaje del código ya existe en el flujo actual

    res.json({
      success: true,
      message: 'Pedido retirado',
      deliveryCode,
      order: {
        id: updated.id,
        orderNumber: updated.orderNumber,
        status: 'picked_up'
      }
    });
  } catch (error) {
    console.error('Error marcando retiro:', error);
    res.status(500).json({ error: 'Error marcando retiro' });
  }
});

/**
 * POST /api/delivery-tasks/start-multi-route
 * Iniciar ruta de entrega múltiple
 */
router.post('/start-multi-route', authenticateDriver, async (req, res) => {
  try {
    const { orderIds } = req.body;
    const driverId = req.user.id;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un pedido' });
    }

    // Verificar que todos los pedidos pertenecen al repartidor y están retirados
    const orders = await prisma.order.findMany({
      where: {
        id: { in: orderIds },
        deliveryPersonId: driverId,
        deliveryStatus: 'picked_up'
      }
    });

    if (orders.length !== orderIds.length) {
      return res.status(400).json({ 
        error: 'Algunos pedidos no están disponibles para iniciar ruta',
        available: orders.length,
        requested: orderIds.length
      });
    }

    // Crear ruta múltiple
    const route = await prisma.multiDeliveryRoute.create({
      data: {
        deliveryPersonId: driverId,
        orderIds: JSON.stringify(orderIds),
        totalOrders: orderIds.length,
        status: 'active'
      }
    });

    // Actualizar pedidos con el ID de ruta y orden
    await Promise.all(orderIds.map((orderId, index) => 
      prisma.order.update({
        where: { id: orderId },
        data: {
          deliveryStatus: index === 0 ? 'delivering' : 'in_multi_route',
          multiRouteId: route.id,
          multiRouteOrder: index,
          status: 'in_transit'
        }
      })
    ));

    // Actualizar repartidor
    await prisma.deliveryPerson.update({
      where: { id: driverId },
      data: { activeRouteId: route.id }
    });

    res.json({
      success: true,
      message: `Ruta iniciada con ${orderIds.length} pedidos`,
      routeId: route.id,
      totalOrders: orderIds.length
    });
  } catch (error) {
    console.error('Error iniciando ruta múltiple:', error);
    res.status(500).json({ error: 'Error iniciando ruta' });
  }
});

/**
 * GET /api/delivery-tasks/active-route
 * Obtener ruta activa del repartidor
 */
router.get('/active-route', authenticateDriver, async (req, res) => {
  try {
    const driverId = req.user.id;

    const driver = await prisma.deliveryPerson.findUnique({
      where: { id: driverId },
      select: { activeRouteId: true }
    });

    if (!driver?.activeRouteId) {
      return res.json({ activeRoute: null });
    }

    const route = await prisma.multiDeliveryRoute.findUnique({
      where: { id: driver.activeRouteId }
    });

    if (!route || route.status !== 'active') {
      return res.json({ activeRoute: null });
    }

    const orderIds = JSON.parse(route.orderIds);
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: {
        store: { select: { name: true } },
        items: { select: { productName: true, quantity: true } }
      },
      orderBy: { multiRouteOrder: 'asc' }
    });

    res.json({
      activeRoute: {
        id: route.id,
        totalOrders: route.totalOrders,
        completedOrders: route.completedOrders,
        currentOrderIndex: route.currentOrderIndex,
        orders: orders.map(o => ({
          id: o.id,
          orderNumber: o.orderNumber,
          storeName: o.store?.name,
          customer: {
            name: o.customerName,
            address: o.customerAddress,
            phone: o.customerPhone,
            lat: o.customerLat,
            lng: o.customerLng
          },
          items: o.items.map(i => `${i.quantity}x ${i.productName}`),
          total: o.total,
          deliveryCode: o.deliveryCode,
          deliveryStatus: o.deliveryStatus,
          multiRouteOrder: o.multiRouteOrder
        }))
      }
    });
  } catch (error) {
    console.error('Error obteniendo ruta activa:', error);
    res.status(500).json({ error: 'Error obteniendo ruta' });
  }
});

/**
 * POST /api/delivery-tasks/:orderId/deliver
 * Marcar pedido como entregado (dentro de ruta múltiple o individual)
 */
router.post('/:orderId/deliver', authenticateDriver, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { code } = req.body; // Código de entrega para verificar
    const driverId = req.user.id;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (order.deliveryPersonId !== driverId) {
      return res.status(403).json({ error: 'No tienes asignado este pedido' });
    }

    // Verificar código si se proporciona
    if (code && order.deliveryCode && code !== order.deliveryCode) {
      return res.status(400).json({ error: 'Código de entrega incorrecto' });
    }

    // Actualizar pedido como entregado
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'delivered',
        deliveryStatus: 'delivered',
        updatedAt: new Date()
      }
    });

    // Si está en una ruta múltiple, actualizar la ruta
    if (order.multiRouteId) {
      const route = await prisma.multiDeliveryRoute.findUnique({
        where: { id: order.multiRouteId }
      });

      if (route) {
        const newCompleted = route.completedOrders + 1;
        const isRouteComplete = newCompleted >= route.totalOrders;

        await prisma.multiDeliveryRoute.update({
          where: { id: route.id },
          data: {
            completedOrders: newCompleted,
            currentOrderIndex: isRouteComplete ? route.currentOrderIndex : route.currentOrderIndex + 1,
            status: isRouteComplete ? 'completed' : 'active',
            completedAt: isRouteComplete ? new Date() : null
          }
        });

        // Si la ruta se completó, limpiar activeRouteId del repartidor
        if (isRouteComplete) {
          await prisma.deliveryPerson.update({
            where: { id: driverId },
            data: { activeRouteId: null }
          });
        } else {
          // Marcar el siguiente pedido como "delivering"
          const orderIds = JSON.parse(route.orderIds);
          const nextOrderId = orderIds[route.currentOrderIndex + 1];
          if (nextOrderId) {
            await prisma.order.update({
              where: { id: nextOrderId },
              data: { deliveryStatus: 'delivering' }
            });
          }
        }
      }
    }

    // Incrementar contador de entregas del repartidor
    await prisma.deliveryPerson.update({
      where: { id: driverId },
      data: { totalDeliveries: { increment: 1 } }
    });

    // El mensaje de WhatsApp de agradecimiento se envía desde el flujo existente
    // NO agregar lógica de WhatsApp aquí

    res.json({
      success: true,
      message: 'Pedido entregado',
      orderNumber: order.orderNumber
    });
  } catch (error) {
    console.error('Error marcando entrega:', error);
    res.status(500).json({ error: 'Error marcando entrega' });
  }
});

/**
 * POST /api/delivery-tasks/:orderId/cancel
 * Cancelar/rechazar una tarea aceptada
 */
router.post('/:orderId/cancel', authenticateDriver, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const driverId = req.user.id;

    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (order.deliveryPersonId !== driverId) {
      return res.status(403).json({ error: 'No tienes asignado este pedido' });
    }

    // Solo se puede cancelar si no está en ruta
    if (['in_multi_route', 'delivering'].includes(order.deliveryStatus || '')) {
      return res.status(400).json({ error: 'No se puede cancelar un pedido en ruta' });
    }

    // Liberar el pedido
    await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryPersonId: null,
        deliveryStatus: 'available',
        acceptedAt: null,
        pickedUpAt: null,
        status: 'ready'
      }
    });

    res.json({
      success: true,
      message: 'Tarea liberada',
      reason
    });
  } catch (error) {
    console.error('Error cancelando tarea:', error);
    res.status(500).json({ error: 'Error cancelando tarea' });
  }
});

export default router;

