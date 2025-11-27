import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ordersApi, deliveryPersonsApi, transfersApi } from '../../../lib/api';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  payment_method: string;
  payment_status: string;
  total: number;
  delivery_fee?: number;
  status: string;
  created_at: string;
  items: OrderItem[];
  delivery_person_id?: string;
  notes?: string;
  delivery_code?: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  subtotal: number;
  unit_price?: number;
  selected_options?: string;
}

interface DeliveryPerson {
  id: string;
  name: string;
  phone: string;
  status?: 'available' | 'busy';
}

// Toast component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
  const icon = type === 'success' ? (
    <i className="ri-checkbox-circle-fill text-white text-2xl"></i>
  ) : type === 'error' ? (
    <i className="ri-close-circle-fill text-white text-2xl"></i>
  ) : (
    <i className="ri-information-fill text-white text-2xl"></i>
  );

  return (
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center space-x-3 min-w-[300px] max-w-md animate-slideInRight`}>
      <span>{icon}</span>
      <p className="font-semibold flex-1">{message}</p>
      <button onClick={onClose} className="text-white hover:text-gray-200 font-bold text-xl hover:scale-110 transition-transform">×</button>
    </div>
  );
}

interface OrdersManagementProps {
  storeId?: string | null;
}

export default function OrdersManagement({ storeId }: OrdersManagementProps = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveryPersons, setDeliveryPersons] = useState<DeliveryPerson[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'pending' | 'cancelled' | 'completed'>('pending');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery'); // Nueva sección: DOMICILIO o RETIRO
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount_high' | 'amount_low'>('newest');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Estados para notificaciones en tiempo real
  const [pendingDeliveryCount, setPendingDeliveryCount] = useState(0);
  const [pendingPickupCount, setPendingPickupCount] = useState(0);
  const [notificationAnimation, setNotificationAnimation] = useState<'delivery' | 'pickup' | null>(null);
  const previousOrdersRef = useRef<Order[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  // Función para reproducir sonido de notificación
  const playNotificationSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Sonido corto y agradable (beep)
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
    } catch (error) {
      console.debug('No se pudo reproducir sonido de notificación:', error);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    loadDeliveryPersons();
    loadPendingTransfers();
    
    // Polling inteligente: verifica cada 5 segundos inicialmente
    // Luego se adapta según si hay pedidos pendientes (cada 3s si hay, 8s si no hay)
    let pollInterval = 5000; // Intervalo inicial más agresivo
    let cyclesWithoutOrders = 0;
    
    const poll = () => {
      loadOrders(true);
      loadPendingTransfers();
      
      // Adaptar intervalo: si no hay pedidos por varios ciclos, reducir frecuencia
      const hasPending = pendingDeliveryCount > 0 || pendingPickupCount > 0;
      
      if (hasPending) {
        cyclesWithoutOrders = 0;
        pollInterval = 3000; // Más frecuente cuando hay pedidos
      } else {
        cyclesWithoutOrders++;
        if (cyclesWithoutOrders > 3) {
          pollInterval = 8000; // Menos frecuente después de 3 ciclos sin pedidos
        }
      }
    };
    
    // Primera carga inmediata
    poll();
    
    // Iniciar polling adaptativo
    const intervalId = setInterval(() => {
      poll();
    }, pollInterval);
    
    // Polling más rápido inicial (primeros 30 segundos cada 3 segundos)
    const fastInitialInterval = setInterval(() => {
      loadOrders(true);
      loadPendingTransfers();
    }, 3000);
    
    // Desactivar polling rápido después de 30 segundos
    setTimeout(() => {
      clearInterval(fastInitialInterval);
    }, 30000);
    
    return () => {
      clearInterval(intervalId);
      clearInterval(fastInitialInterval);
    };
  }, []);

  const loadPendingTransfers = async () => {
    try {
      const data = await transfersApi.getPending();
      setPendingTransfers(data || []);
    } catch (error) {
      console.error('Error loading pending transfers:', error);
      setPendingTransfers([]);
    }
  };

  const loadOrders = async (silent: boolean = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await ordersApi.getAll(storeId ? { storeId } : undefined);
      
      const normalized = (data || []).map((order: any) => {
        const normalizedOrder = {
          id: order.id,
          order_number: order.order_number || order.orderNumber,
          customer_name: order.customer_name || order.customerName,
          customer_phone: order.customer_phone || order.customerPhone,
          customer_address: order.customer_address || order.customerAddress,
          payment_method: order.payment_method || order.paymentMethod,
          payment_status: order.payment_status || order.paymentStatus,
          total: order.total || order.total_amount,
          delivery_fee: order.delivery_fee || order.deliveryFee || 0,
        status: order.status,
        created_at: order.created_at || order.createdAt,
        notes: order.notes,
        items: (order.items || []).map((it: any) => ({
          id: it.id,
          product_name: it.product_name || it.productName,
          quantity: it.quantity,
          subtotal: it.subtotal,
          unit_price: it.unit_price || it.unitPrice,
          selected_options: it.selected_options || it.selectedOptions,
        })),
        delivery_person_id: order.delivery_person_id || order.deliveryPersonId,
        delivery_code: order.delivery_code || order.deliveryCode,
      };
      
      // Log para depuración
      if (normalizedOrder.status === 'pending') {
        console.log(`[LOAD ORDERS] Pedido ${normalizedOrder.order_number}:`, {
          status: normalizedOrder.status,
          customer_phone: normalizedOrder.customer_phone ? 'SÍ' : 'NO',
          payment_method: normalizedOrder.payment_method || 'N/A',
          payment_status: normalizedOrder.payment_status || 'N/A',
          delivery_fee: normalizedOrder.delivery_fee
        });
      }
      
      return normalizedOrder;
    });

      const sortedOrders = normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setOrders(sortedOrders);
      
      // Detectar nuevos pedidos y actualizar contadores (MEJORADO)
      if (silent && previousOrdersRef.current.length > 0) {
        const previousOrderIds = new Set(previousOrdersRef.current.map(o => o.id));
        
        // Solo detectar nuevos pedidos que fueron confirmados en WhatsApp Y tienen método de pago confirmado
        const newOrders = sortedOrders.filter(o => {
          // 1. Verificar que sea un pedido nuevo
          if (previousOrderIds.has(o.id)) return false;
          
          // 2. Verificar que esté pendiente
          if (o.status !== 'pending') return false;
          
          // 3. Verificar que tenga teléfono de cliente (obligatorio)
          const hasPhone = o.customer_phone && 
                          o.customer_phone.trim() !== '' && 
                          o.customer_phone.length >= 10;
          if (!hasPhone) {
            console.warn(`[PEDIDO DESCARTADO] Pedido ${o.order_number} sin teléfono válido`);
            return false;
          }
          
          // 4. Verificar que tenga nombre de cliente
          const hasName = o.customer_name && o.customer_name.trim() !== '';
          if (!hasName) {
            console.warn(`[PEDIDO DESCARTADO] Pedido ${o.order_number} sin nombre de cliente`);
            return false;
          }
          
          // 5. Verificar que tenga items
          if (!o.items || o.items.length === 0) {
            console.warn(`[PEDIDO DESCARTADO] Pedido ${o.order_number} sin items`);
            return false;
          }
          
          // 6. Verificar que el método de pago esté confirmado
          // IMPORTANTE: No verificar payment_status === 'pending' porque es normal para Mercado Pago y Transferencia
          const paymentMethod = (o.payment_method || '').toLowerCase().trim();
          const isPaymentMethodPending = paymentMethod === '' || 
                                         paymentMethod === 'null' ||
                                         paymentMethod === 'undefined' ||
                                         paymentMethod.includes('pendiente') ||
                                         paymentMethod.includes('sin definir');
          
          if (isPaymentMethodPending) {
            console.warn(`[PEDIDO DESCARTADO] Pedido ${o.order_number} con método de pago pendiente: "${paymentMethod}"`);
            return false;
          }
          
          // 7. Validar que el total sea mayor a 0
          if (!o.total || o.total <= 0) {
            console.warn(`[PEDIDO DESCARTADO] Pedido ${o.order_number} con total inválido: ${o.total}`);
            return false;
          }
          
          console.log(`[NUEVO PEDIDO DETECTADO] ${o.order_number} - ${o.customer_name} - ${o.payment_method} - $${o.total}`);
          return true;
        });
        
        if (newOrders.length > 0) {
          // Contar nuevos pedidos por tipo
          const newDelivery = newOrders.filter(o => (o.delivery_fee || 0) > 0).length;
          const newPickup = newOrders.filter(o => (o.delivery_fee || 0) === 0).length;
          
          if (newDelivery > 0) {
            setNotificationAnimation('delivery');
            playNotificationSound();
            setTimeout(() => setNotificationAnimation(null), 1000);
          }
          if (newPickup > 0) {
            setNotificationAnimation('pickup');
            playNotificationSound();
            setTimeout(() => setNotificationAnimation(null), 1000);
          }
        }
      }
      
      // Actualizar contadores de pedidos pendientes
      // Solo contar pedidos confirmados en WhatsApp Y con método de pago confirmado
      const pendingDelivery = sortedOrders.filter(o => {
        if (o.status !== 'pending' || (o.delivery_fee || 0) === 0) return false;
        const hasPhone = o.customer_phone && o.customer_phone.trim() !== '';
        if (!hasPhone) return false;
        
        // Verificar que el método de pago esté confirmado
        // IMPORTANTE: No verificar payment_status === 'pending' porque es normal para Mercado Pago y Transferencia
        const paymentMethod = (o.payment_method || '').toLowerCase();
        const isPaymentMethodPending = paymentMethod.includes('pendiente') || 
                                       paymentMethod === '' || 
                                       paymentMethod === 'null';
        
        return !isPaymentMethodPending; // Solo pedidos con método de pago confirmado
      }).length;
      
      const pendingPickup = sortedOrders.filter(o => {
        if (o.status !== 'pending' || (o.delivery_fee || 0) > 0) return false;
        const hasPhone = o.customer_phone && o.customer_phone.trim() !== '';
        if (!hasPhone) return false;
        
        // Verificar que el método de pago esté confirmado
        // IMPORTANTE: No verificar payment_status === 'pending' porque es normal para Mercado Pago y Transferencia
        const paymentMethod = (o.payment_method || '').toLowerCase();
        const isPaymentMethodPending = paymentMethod.includes('pendiente') || 
                                       paymentMethod === '' || 
                                       paymentMethod === 'null';
        
        return !isPaymentMethodPending; // Solo pedidos con método de pago confirmado
      }).length;
      
      setPendingDeliveryCount(pendingDelivery);
      setPendingPickupCount(pendingPickup);
      
      // Guardar estado actual para la próxima comparación
      previousOrdersRef.current = sortedOrders;
    } catch (error) {
      console.error('Error loading orders:', error);
      if (!silent) {
        showToast('Error al cargar pedidos', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadDeliveryPersons = async () => {
    try {
      const data = await deliveryPersonsApi.getAll();
      setDeliveryPersons(data || []);
    } catch (error) {
      console.error('Error loading delivery persons:', error);
    }
  };

  // Aprobar pedido (pasa directamente a repartidores solo si es DOMICILIO)
  // Para RETIRO: cambia a 'ready' y notifica al cliente que está listo
  const handleApprove = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) {
        showToast('Pedido no encontrado', 'error');
        return;
      }

      const isDelivery = (order.delivery_fee || 0) > 0;
      
      if (isDelivery) {
        // Pedido a domicilio: marcarlo como 'ready' para repartidores
        await ordersApi.update(orderId, { status: 'ready' });
        showToast('Pedido aprobado y disponible para repartidores', 'success');
      } else {
        // Pedido de retiro: generar código de entrega y marcarlo como 'ready'
        // Generar código de 4 dígitos
        const deliveryCode = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Actualizar pedido con estado 'ready' y código de entrega
        const updatedOrder = await ordersApi.update(orderId, { 
          status: 'ready',
          delivery_code: deliveryCode
        });
        
        // Actualizar el pedido en el estado local para que el código aparezca inmediatamente
        setOrders(prevOrders => prevOrders.map(o => 
          o.id === orderId 
            ? { ...o, status: 'ready', delivery_code: deliveryCode }
            : o
        ));
        
        // Enviar notificación al cliente
        if (order.customer_phone) {
          try {
            // Obtener dirección de retiro (por defecto Av. RIVADAVIA 2911)
            const pickupAddress = order.customer_address || 'Av. RIVADAVIA 2911';
            
            // Mensaje de notificación
            const message = `✅ ¡Tu pedido está listo para ser retirado!\n\n📦 Pedido: ${order.order_number}\n📍 ${pickupAddress}\n\n🆔 El código estará en tu ticket impreso.\n\nPodés pasar a retirarlo cuando gustes.\n\n¡Gracias por tu compra! ❤️`;

            // Enviar notificación al cliente vía endpoint del backend
            const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
            const notifyUrl = `${API_URL}/orders/${order.id}/notify`;
            const token = localStorage.getItem('adminToken');
            const response = await fetch(notifyUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
              },
              body: JSON.stringify({
                customerPhone: order.customer_phone,
                orderNumber: order.order_number,
                message
              })
            });

            // Verificar si la respuesta es HTML
            const responseText = await response.text();
            if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
              throw new Error('El servidor devolvió HTML en lugar de JSON');
            }

            if (!response.ok) {
              let errorData: any;
              try {
                errorData = JSON.parse(responseText);
              } catch {
                errorData = { error: responseText.substring(0, 200) };
              }
              throw new Error(errorData.error || errorData.message || 'Error al enviar notificación');
            }

            showToast('Pedido listo y cliente notificado', 'success');
          } catch (notifyError: any) {
            console.error('Error notificando cliente:', notifyError);
            showToast('Pedido listo, pero error al notificar cliente', 'error');
          }
        } else {
          showToast('Pedido listo (sin teléfono para notificar)', 'info');
        }
      }
      
      await loadOrders(true);
    } catch (error: any) {
      showToast(error.message || 'Error al aprobar pedido', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Notificar pedido listo para retiro
  const handleNotifyPickupReady = async (order: Order) => {
    setActionLoading(order.id);
    try {
      if (!order.customer_phone) {
        showToast('El pedido no tiene número de teléfono', 'error');
        return;
      }

      // Construir URL del webhook del bot de forma robusta
      let webhookUrl = import.meta.env.VITE_BOT_WEBHOOK_URL;
      
      // Si no hay variable específica, intentar construir desde VITE_API_URL
      if (!webhookUrl || webhookUrl.trim() === '') {
        const apiUrl = (import.meta.env.VITE_API_URL || '').trim();
        
        if (apiUrl) {
          // Remover /api del final si existe
          webhookUrl = apiUrl.replace(/\/api\/?$/, '');
          
          // Validar que la URL tenga protocolo válido
          if (!webhookUrl.match(/^https?:\/\//)) {
            // Si no tiene protocolo, agregar https://
            webhookUrl = webhookUrl.replace(/^\/+/, ''); // Remover slashes al inicio
            webhookUrl = `https://${webhookUrl}`;
          }
        }
      }
      
      // Fallback a URL por defecto si aún no hay URL válida
      if (!webhookUrl || webhookUrl.trim() === '' || !webhookUrl.match(/^https?:\/\/[^\/]+/)) {
        // En desarrollo, usar localhost:3001, en producción usar el dominio
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          webhookUrl = 'http://localhost:3001';
        } else {
          webhookUrl = 'https://elbuenmenu.site';
        }
      }
      
      // Asegurar que la URL no termine con /
      webhookUrl = webhookUrl.replace(/\/+$/, '');
      
      // Validación final: asegurar que la URL sea válida
      if (!webhookUrl.match(/^https?:\/\/[^\/\s]+/)) {
        webhookUrl = 'https://elbuenmenu.site';
      }
      
      // Obtener dirección de retiro (por defecto Av. RIVADAVIA 2911)
      const pickupAddress = order.customer_address || 'Av. RIVADAVIA 2911';
      
      // Mensaje de notificación con dirección y código
      const message = `✅ ¡Tu pedido está listo para ser retirado!\n\n📦 Pedido: ${order.order_number}\n📍 ${pickupAddress}\n\n🆔 Código: ${order.order_number}\n\nPodés pasar a retirarlo cuando gustes.\n\n¡Gracias por tu compra! ❤️`;

      // Enviar notificación al cliente vía endpoint del backend
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const notifyUrl = `${API_URL}/orders/${order.id}/notify`;
      const token = localStorage.getItem('adminToken');
      const response = await fetch(notifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          customerPhone: order.customer_phone,
          orderNumber: order.order_number,
          message
        })
      });

      // Obtener el texto de la respuesta primero
      const responseText = await response.text();
      
      // Verificar si la respuesta es HTML (error común cuando la URL está mal)
      if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.error('❌ [NOTIFICACIÓN WEB] El servidor devolvió HTML en lugar de JSON.');
        console.error('❌ [NOTIFICACIÓN WEB] URL intentada:', notifyUrl);
        throw new Error(`El servidor devolvió HTML en lugar de JSON. URL: ${notifyUrl}. Verifica que el bot esté corriendo y la URL sea correcta.`);
      }

      if (!response.ok) {
        let errorData: any;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: responseText.substring(0, 200) };
        }
        throw new Error(errorData.error || errorData.message || 'Error al enviar notificación');
      }
      
      // Verificar que la respuesta sea JSON válido
      try {
        JSON.parse(responseText);
      } catch {
        throw new Error(`La respuesta del servidor no es JSON válido: ${responseText.substring(0, 200)}`);
      }

      // Cambiar estado a 'ready' (listo para retiro)
      await ordersApi.update(order.id, { status: 'ready' });
      
      showToast('Notificación enviada al cliente', 'success');
      await loadOrders(true);
    } catch (error: any) {
      console.error('Error notificando pedido listo:', error);
      showToast(error.message || 'Error al enviar notificación', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Rechazar pedido
  const handleReject = async (orderId: string, reason?: string) => {
    setActionLoading(orderId);
    try {
      await ordersApi.reject(orderId, reason);
      showToast('Pedido rechazado y cancelado', 'info');
      setShowRejectModal(false);
      setRejectReason('');
      setRejectingOrderId(null);
      await loadOrders(true);
    } catch (error: any) {
      showToast(error.message || 'Error al rechazar pedido', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Actualizar estado del pedido
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setActionLoading(orderId);
    try {
      await ordersApi.update(orderId, { status: newStatus });
      showToast(`Estado actualizado a: ${getStatusText(newStatus)}`, 'success');
      await loadOrders(true);
    } catch (error: any) {
      showToast(error.message || 'Error al actualizar estado', 'error');
    } finally {
      setActionLoading(null);
    }
  };


  // Imprimir ticket del pedido
  const handlePrintTicket = (order: Order) => {
    // Crear una ventana nueva con el ticket estético
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
      showToast('Por favor, permite ventanas emergentes para imprimir', 'error');
      return;
    }

    // Construir HTML del ticket
    const ticketHTML = `
<!DOCTYPE html>
        <html>
          <head>
  <meta charset="UTF-8">
  <title>Ticket Pedido ${order.order_number}</title>
            <style>
              @media print {
      @page { margin: 0; size: 80mm auto; }
                body { margin: 0; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      width: 80mm;
      margin: 0 auto;
      padding: 10mm;
      background: white;
      font-size: 12px;
      line-height: 1.4;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: bold;
    }
    .header p {
      margin: 5px 0 0 0;
      font-size: 10px;
    }
    .section {
      margin: 15px 0;
      padding-bottom: 10px;
      border-bottom: 1px dashed #ccc;
    }
    .section:last-child {
      border-bottom: none;
    }
    .section-title {
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .item {
      display: flex;
      justify-content: space-between;
      margin: 5px 0;
      font-size: 11px;
    }
    .item-name {
      flex: 1;
    }
    .item-price {
      font-weight: bold;
      margin-left: 10px;
    }
    .extras {
      margin-left: 15px;
      font-size: 10px;
      color: #666;
    }
    .total {
      font-size: 16px;
      font-weight: bold;
      text-align: right;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 2px solid #000;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 10px;
      color: #666;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 10px 0;
              }
            </style>
          </head>
          <body>
  <div class="header">
    <h1>EL BUEN MENÚ</h1>
    <p>Pedido ${order.order_number}</p>
    <p>${new Date(order.created_at).toLocaleString('es-AR')}</p>
  </div>

  <div class="section">
    <div class="section-title">Cliente</div>
    <div><strong>${order.customer_name}</strong></div>
    <div>📱 ${order.customer_phone || 'N/A'}</div>
    ${order.customer_address ? `<div>📍 ${order.customer_address}</div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Items</div>
    ${order.items.map(item => {
      let extrasText = '';
      try {
        if (item.selected_options) {
          const options = typeof item.selected_options === 'string' 
            ? JSON.parse(item.selected_options) 
            : item.selected_options;
          
          let extras: any[] = [];
          if (options.options && Array.isArray(options.options)) {
            extras = options.options;
          } else if (Array.isArray(options)) {
            extras = options;
          } else if (typeof options === 'object') {
            Object.values(options).forEach((categoryOptions: any) => {
              if (Array.isArray(categoryOptions)) {
                extras.push(...categoryOptions);
              }
            });
          }
          
          if (extras.length > 0) {
            extrasText = extras.map((e: any) => `+ ${e.name}${e.price > 0 ? ` (+$${e.price})` : ''}`).join('<br/>');
          }
        }
      } catch (e) {
        console.error('Error parsing extras:', e);
      }
      
      return `
        <div class="item">
          <div class="item-name">
            ${item.quantity}x ${item.product_name}
            ${extrasText ? `<div class="extras">${extrasText}</div>` : ''}
          </div>
          <div class="item-price">$${(item.subtotal || 0).toLocaleString('es-AR')}</div>
        </div>
      `;
    }).join('')}
  </div>

  <div class="section">
    <div class="divider"></div>
    <div class="item">
      <span>Subtotal:</span>
      <span>$${(order.total - (order.delivery_fee || 0)).toLocaleString('es-AR')}</span>
    </div>
    ${(order.delivery_fee || 0) > 0 ? `
    <div class="item">
      <span>Envío:</span>
      <span>$${(order.delivery_fee || 0).toLocaleString('es-AR')}</span>
    </div>
    ` : ''}
    <div class="total">
      Total: $${order.total.toLocaleString('es-AR')}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Pago</div>
    <div>💳 ${order.payment_method || 'Pendiente de selección (Web)'}</div>
    <div>Estado: ${(order.payment_status === 'completed' || order.payment_status === 'approved') ? '✅ Pagado' : '⏳ Pendiente'}</div>
  </div>

  ${(() => {
    // Procesar notas: si es JSON, intentar parsearlo y mostrar solo información relevante
    if (!order.notes) return '';
    
    let notesDisplay = order.notes;
    try {
      // Intentar parsear como JSON
      const parsedNotes = JSON.parse(order.notes);
      
      // Si contiene preference_id o mpPreferenceId, no mostrar (es información técnica)
      if (parsedNotes.preference_id || parsedNotes.mpPreferenceId) {
        // No mostrar estas notas técnicas en el ticket
        return '';
      }
      
      // Si es un objeto, convertirlo a string legible
      if (typeof parsedNotes === 'object') {
        notesDisplay = Object.entries(parsedNotes)
          .filter(([key]) => !key.includes('preference') && !key.includes('Preference'))
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
      }
    } catch (e) {
      // Si no es JSON válido, usar el texto original
      notesDisplay = order.notes;
    }
    
    // Solo mostrar si hay contenido después de filtrar
    if (!notesDisplay || notesDisplay.trim() === '') {
      return '';
    }
    
    return `
  <div class="section">
    <div class="section-title">Notas</div>
    <div>${notesDisplay}</div>
  </div>
    `;
  })()}

  ${(() => {
    const isPickup = (order.delivery_fee || 0) === 0;
    const hasDeliveryCode = order.delivery_code && order.delivery_code.trim() !== '';
    
    if (isPickup && hasDeliveryCode) {
      return `
  <div class="section" style="border: 3px solid #000; padding: 15px; text-align: center; background: #f9f9f9; margin-top: 20px;">
    <div class="section-title" style="font-size: 16px; margin-bottom: 10px;">🔐 CÓDIGO DE RETIRO</div>
    <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 10px 0; color: #000;">${order.delivery_code}</div>
    <div style="font-size: 10px; color: #666; margin-top: 5px;">Presentá este código al retirar</div>
  </div>
      `;
    }
    return '';
  })()}

  <div class="footer">
    <div class="divider"></div>
    <div>¡Gracias por tu compra!</div>
    <div>www.elbuenmenu.site</div>
  </div>
</body>
</html>
    `;

    printWindow.document.write(ticketHTML);
    printWindow.document.close();
    
    // Esperar a que se cargue el contenido y luego imprimir
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  // Filtrar pedidos
  const filteredOrders = useMemo(() => {
    console.log(`[FILTER DEBUG] Total pedidos cargados: ${orders.length}`);
    console.log(`[FILTER DEBUG] Filtro activo: ${activeFilter}, Tipo: ${deliveryType}`);
    
    let filtered = orders;
    
    // Obtener IDs de pedidos con transferencias pendientes
    const ordersWithPendingTransfer = new Set(
      pendingTransfers
        .filter(t => t.status === 'pending')
        .map(t => t.order_id)
    );
    
    console.log(`[FILTER DEBUG] Pedidos con transferencias pendientes: ${ordersWithPendingTransfer.size}`);
    
    // Excluir pedidos con transferencias pendientes (deben ser aprobados primero en transferencias)
    filtered = filtered.filter(order => !ordersWithPendingTransfer.has(order.id));
    console.log(`[FILTER DEBUG] Después de excluir transferencias: ${filtered.length}`);
    
    // Filtrar por tipo de entrega: DOMICILIO (delivery_fee > 0) o RETIRO (delivery_fee = 0)
    if (deliveryType === 'delivery') {
      // Solo pedidos a domicilio
      filtered = filtered.filter(order => (order.delivery_fee || 0) > 0);
      console.log(`[FILTER DEBUG] Después de filtrar DOMICILIO: ${filtered.length}`);
    } else if (deliveryType === 'pickup') {
      // Solo pedidos para retiro
      filtered = filtered.filter(order => (order.delivery_fee || 0) === 0);
      console.log(`[FILTER DEBUG] Después de filtrar RETIRO: ${filtered.length}`);
    }
    
    // Filtrar por estado simplificado: PENDIENTES - CANCELADAS - COMPLETADAS
    if (activeFilter === 'pending') {
      console.log(`[FILTER DEBUG] Filtrando PENDIENTES. Pedidos antes del filtro: ${filtered.length}`);
      // Solo pedidos pendientes de aceptar
      // IMPORTANTE: Solo mostrar pedidos confirmados en WhatsApp Y con método de pago confirmado
      filtered = filtered.filter(order => {
        console.log(`[FILTER DETAIL] Analizando pedido ${order.order_number}:`, {
          status: order.status,
          customer_phone: order.customer_phone ? 'SÍ' : 'NO',
          payment_method: order.payment_method || 'N/A',
          payment_status: order.payment_status || 'N/A',
          delivery_fee: order.delivery_fee
        });
        
        // Incluir pedidos con status 'pending' o 'confirmed' (cuando el pago está aprobado pero aún no aprobado por admin)
        const isPendingOrConfirmed = order.status === 'pending' || order.status === 'confirmed';
        if (!isPendingOrConfirmed) {
          console.log(`[FILTER] ❌ Pedido ${order.order_number}: status no es 'pending' ni 'confirmed' (${order.status})`);
          return false;
        }
        
        // Verificar si el pedido fue confirmado en WhatsApp (tiene customer_phone)
        const hasPhone = order.customer_phone && order.customer_phone.trim() !== '';
        
        // Solo mostrar si tiene teléfono (confirmado en WhatsApp)
        if (!hasPhone) {
          console.log(`[FILTER] ❌ Pedido ${order.order_number}: sin customer_phone`);
          return false; // Excluir pedidos de la web que aún no fueron confirmados en WhatsApp
        }
        
        // Verificar que el método de pago esté confirmado (no "Pendiente de selección (Web)")
        const paymentMethod = (order.payment_method || '').trim();
        const paymentMethodLower = paymentMethod.toLowerCase();
        const paymentStatus = (order.payment_status || '').toLowerCase();
        
        // Métodos de pago válidos (confirmados)
        const validPaymentMethods = ['mercadopago', 'mercado pago', 'transferencia', 'efectivo', 'cash', 'transfer'];
        
        // Verificar si el método de pago está pendiente o no es válido
        const isPaymentMethodPending = paymentMethod === '' || 
                                       paymentMethod === 'null' ||
                                       paymentMethodLower.includes('pendiente') ||
                                       (!validPaymentMethods.some(valid => paymentMethodLower.includes(valid)));
        
        // Excluir si el método de pago aún no está confirmado
        if (isPaymentMethodPending) {
          console.log(`[FILTER] ❌ Pedido ${order.order_number}: método de pago pendiente o inválido (${order.payment_method})`);
          return false; // Excluir pedidos que aún no tienen método de pago confirmado
        }
        
        // Verificar el estado del pago según el método
        const isMercadoPago = paymentMethodLower.includes('mercadopago') || paymentMethodLower.includes('mercado pago');
        const isTransferencia = paymentMethodLower.includes('transferencia') || paymentMethodLower.includes('transfer');
        const isEfectivo = paymentMethodLower.includes('efectivo') || paymentMethodLower.includes('cash');
        
        // Para Mercado Pago: solo mostrar si el pago está aprobado
        if (isMercadoPago) {
          if (paymentStatus !== 'approved' && paymentStatus !== 'completed') {
            console.log(`[FILTER] ❌ Pedido ${order.order_number}: Mercado Pago aún no aprobado (status: ${order.payment_status})`);
            return false; // No mostrar hasta que el pago esté aprobado
          }
          console.log(`[FILTER] ✅ Pedido ${order.order_number}: Mercado Pago aprobado - MOSTRAR`);
          return true;
        }
        
        // Para Transferencia: solo mostrar si tiene una transferencia pendiente asociada
        if (isTransferencia) {
          const hasPendingTransfer = pendingTransfers.some(
            t => t.order_id === order.id && t.status === 'pending'
          );
          if (!hasPendingTransfer) {
            console.log(`[FILTER] ❌ Pedido ${order.order_number}: Transferencia sin comprobante pendiente`);
            return false;
          }
          console.log(`[FILTER] ✅ Pedido ${order.order_number}: Transferencia con comprobante - MOSTRAR`);
          return true;
        }
        
        // Para Efectivo: mostrar directamente (el pago se hace al recibir/retirar)
        if (isEfectivo) {
          const isPickup = (order.delivery_fee || 0) === 0;
          if (isPickup) {
            console.log(`[FILTER] ✅ Pedido ${order.order_number}: retiro con efectivo - MOSTRAR`);
          } else {
            console.log(`[FILTER] ✅ Pedido ${order.order_number}: domicilio con efectivo - MOSTRAR`);
          }
          return true;
        }
        
        // Para otros métodos de pago, mostrar si está pendiente
        console.log(`[FILTER] ✅ Pedido ${order.order_number} PASÓ EL FILTRO - método: ${order.payment_method}, status: ${order.status}`);
        return true;
      });
      console.log(`[FILTER DEBUG] Pedidos después del filtro PENDIENTES: ${filtered.length}`);
    } else if (activeFilter === 'cancelled') {
      // Solo pedidos cancelados/rechazados
      filtered = filtered.filter(order => order.status === 'cancelled');
    } else if (activeFilter === 'completed') {
      // Solo pedidos realmente completados (entregados)
      filtered = filtered.filter(order => 
        order.status === 'delivered'
      );
    }
    
    // Filtrar por método de pago
    if (paymentMethodFilter !== 'all') {
      filtered = filtered.filter(order => {
        const method = (order.payment_method || '').toLowerCase();
        if (paymentMethodFilter === 'mercadopago') {
          return method.includes('mercadopago') || method.includes('mercado pago');
        }
        if (paymentMethodFilter === 'transferencia') {
          return method.includes('transferencia') || method.includes('transfer');
        }
        if (paymentMethodFilter === 'efectivo') {
          return method.includes('efectivo') || method.includes('cash');
        }
        return true;
      });
    }
    
    // Filtrar por rango de fechas
    if (dateRange !== 'all') {
      const now = new Date();
      filtered = filtered.filter(order => {
        const orderDate = new Date(order.created_at);
        if (dateRange === 'today') {
          return orderDate.toDateString() === now.toDateString();
        }
        if (dateRange === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return orderDate >= weekAgo;
        }
        if (dateRange === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return orderDate >= monthAgo;
        }
        return true;
      });
    }
    
    // Filtrar por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(order => 
        order.order_number.toLowerCase().includes(term) ||
        order.customer_name.toLowerCase().includes(term) ||
        order.customer_phone.includes(term)
      );
    }
    
    // Ordenar
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'amount_high') {
        return b.total - a.total;
      }
      if (sortBy === 'amount_low') {
        return a.total - b.total;
      }
      return 0;
    });
    
    return sorted;
  }, [orders, activeFilter, deliveryType, searchTerm, paymentMethodFilter, dateRange, sortBy, pendingTransfers]);

  // Estadísticas simplificadas
  const stats = useMemo(() => {
    return {
      pending: orders.filter(o => o.status === 'pending').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
      completed: orders.filter(o => o.status === 'delivered').length, // Solo pedidos realmente entregados
    };
  }, [orders]);

  const getStatusColor = (status: string, paymentStatus?: string) => {
    if (status === 'cancelled') return 'bg-red-100 text-red-800 border-red-300';
    if (status === 'delivered') return 'bg-gray-100 text-gray-800 border-gray-300';
    if (status === 'assigned' || status === 'in_transit') return 'bg-purple-100 text-purple-800 border-purple-300';
    if (status === 'ready') return 'bg-green-100 text-green-800 border-green-300';
    if (status === 'preparing') return 'bg-blue-100 text-blue-800 border-blue-300';
    if (status === 'confirmed') return 'bg-indigo-100 text-indigo-800 border-indigo-300';
    if (paymentStatus === 'pending' && status !== 'cancelled') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      'pending': 'Pendiente',
      'confirmed': 'Confirmado',
      'preparing': 'En preparación',
      'ready': 'Listo',
      'assigned': 'Asignado',
      'in_transit': 'En camino',
      'delivered': 'Entregado',
      'cancelled': 'Cancelado',
    };
    return statusMap[status] || status;
  };

  const getStatusIcon = (status: string) => {
    const iconMap: Record<string, JSX.Element> = {
      'pending': <i className="ri-time-line text-yellow-500 text-xl"></i>,
      'confirmed': <i className="ri-checkbox-circle-line text-blue-500 text-xl"></i>,
      'preparing': <i className="ri-restaurant-line text-orange-500 text-xl"></i>,
      'ready': <i className="ri-checkbox-circle-fill text-green-500 text-xl"></i>,
      'assigned': <i className="ri-truck-line text-purple-500 text-xl"></i>,
      'in_transit': <i className="ri-map-pin-line text-indigo-500 text-xl"></i>,
      'delivered': <i className="ri-checkbox-circle-fill text-green-600 text-xl"></i>,
      'cancelled': <i className="ri-close-circle-line text-red-500 text-xl"></i>,
    };
    return iconMap[status] || <i className="ri-file-list-line text-gray-500 text-xl"></i>;
  };

  const canApprove = (order: Order) => {
    // Se puede aprobar si está pendiente o confirmado (pago aprobado pero aún no aprobado por admin)
    return order.status === 'pending' || order.status === 'confirmed';
  };

  const canReject = (order: Order) => {
    // Se puede rechazar si está pendiente o confirmado (pago aprobado pero aún no aprobado por admin)
    return order.status === 'pending' || order.status === 'confirmed';
  };

  const canNotifyPickup = (order: Order) => {
    // Solo se puede notificar si es pedido de retiro, está en preparación y NO está completado
    const isPickup = (order.delivery_fee || 0) === 0;
    const isCompleted = order.status === 'delivered' || order.status === 'completed' || order.status === 'cancelled';
    const isInPreparation = order.status === 'preparing' || order.status === 'confirmed';
    return isPickup && isInPreparation && !isCompleted;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold text-lg">Cargando pedidos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header - Más Pequeño */}
      <div className="bg-gradient-to-r from-orange-100 to-yellow-100 border-2 border-orange-400 rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold mb-1 text-gray-800 flex items-center space-x-2">
              <span className="text-2xl sm:text-3xl">📦</span>
              <span>PEDIDOS</span>
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 font-semibold">Gestiona los pedidos fácilmente</p>
          </div>
          <button
            onClick={() => loadOrders()}
            disabled={loading}
            className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-lg sm:rounded-xl transition-all shadow-md hover:shadow-lg transform hover:scale-105 disabled:opacity-50 disabled:transform-none flex items-center space-x-2"
          >
            <span className="text-lg sm:text-xl">🔄</span>
            <span>ACTUALIZAR</span>
          </button>
        </div>
      </div>

              {/* Estadísticas - Más Pequeñas con Iconos Modernos */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-400 rounded-xl sm:rounded-2xl shadow-lg p-2 sm:p-4 hover:scale-105 transition-all text-center">
                  <div className="flex justify-center mb-1 sm:mb-2">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 bg-yellow-500 rounded-full flex items-center justify-center">
                      <i className="ri-time-line text-white text-lg sm:text-2xl"></i>
                    </div>
                  </div>
                  <div className="text-xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2">{stats.pending}</div>
                  <div className="text-xs sm:text-sm text-gray-700 font-bold">PENDIENTES</div>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-400 rounded-xl sm:rounded-2xl shadow-lg p-2 sm:p-4 hover:scale-105 transition-all text-center">
                  <div className="flex justify-center mb-1 sm:mb-2">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 bg-red-500 rounded-full flex items-center justify-center">
                      <i className="ri-close-circle-line text-white text-lg sm:text-2xl"></i>
                    </div>
                  </div>
                  <div className="text-xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2">{stats.cancelled}</div>
                  <div className="text-xs sm:text-sm text-gray-700 font-bold">CANCELADAS</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-400 rounded-xl sm:rounded-2xl shadow-lg p-2 sm:p-4 hover:scale-105 transition-all text-center">
                  <div className="flex justify-center mb-1 sm:mb-2">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 bg-green-500 rounded-full flex items-center justify-center">
                      <i className="ri-checkbox-circle-fill text-white text-lg sm:text-2xl"></i>
                    </div>
                  </div>
                  <div className="text-xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2">{stats.completed}</div>
                  <div className="text-xs sm:text-sm text-gray-700 font-bold">COMPLETADAS</div>
                </div>
              </div>

      {/* Selector de tipo de pedido - SÚPER GRANDES */}
      <div className="bg-white border-2 sm:border-4 border-gray-300 rounded-xl sm:rounded-3xl shadow-xl sm:shadow-2xl p-3 sm:p-6 mb-4 sm:mb-8">
        <div className="flex gap-2 sm:gap-6">
          <button
            onClick={() => setDeliveryType('delivery')}
            className={`flex-1 px-3 py-3 sm:px-8 sm:py-6 text-base sm:text-2xl font-bold transition-all rounded-xl sm:rounded-3xl flex items-center justify-center space-x-2 sm:space-x-4 relative ${
              deliveryType === 'delivery'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white border-2 sm:border-4 border-orange-700 shadow-xl sm:shadow-2xl'
                : 'bg-white text-gray-800 hover:bg-orange-50 border-2 sm:border-4 border-gray-300 hover:border-orange-400'
            } ${notificationAnimation === 'delivery' ? 'animate-pulse' : ''}`}
          >
            <span className="text-2xl sm:text-5xl">🚚</span>
            <span>DOMICILIO</span>
            {pendingDeliveryCount > 0 && (
              <span 
                className={`absolute -top-2 -right-2 sm:-top-3 sm:-right-3 bg-red-500 text-white text-sm sm:text-xl font-bold rounded-full w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center shadow-xl ${
                  notificationAnimation === 'delivery' ? 'animate-bounce' : ''
                }`}
              >
                {pendingDeliveryCount > 9 ? '9+' : pendingDeliveryCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setDeliveryType('pickup')}
            className={`flex-1 px-3 py-3 sm:px-8 sm:py-6 text-base sm:text-2xl font-bold transition-all rounded-xl sm:rounded-3xl flex items-center justify-center space-x-2 sm:space-x-4 relative ${
              deliveryType === 'pickup'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-2 sm:border-4 border-blue-700 shadow-xl sm:shadow-2xl'
                : 'bg-white text-gray-800 hover:bg-blue-50 border-2 sm:border-4 border-gray-300 hover:border-blue-400'
            } ${notificationAnimation === 'pickup' ? 'animate-pulse' : ''}`}
          >
            <span className="text-2xl sm:text-5xl">🏪</span>
            <span>RETIRO</span>
            {pendingPickupCount > 0 && (
              <span 
                className={`absolute -top-2 -right-2 sm:-top-3 sm:-right-3 bg-red-500 text-white text-sm sm:text-xl font-bold rounded-full w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center shadow-xl ${
                  notificationAnimation === 'pickup' ? 'animate-bounce' : ''
                }`}
              >
                {pendingPickupCount > 9 ? '9+' : pendingPickupCount}
              </span>
            )}
          </button>
        </div>
      </div>
      
      {/* Estilos CSS para animación de vibración */}
      <style>{`
        @keyframes vibrate {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
          20%, 40%, 60%, 80% { transform: translateX(3px); }
        }
      `}</style>

      {/* Búsqueda y Filtros - SÚPER SIMPLES */}
      <div className="bg-white border-2 sm:border-4 border-gray-300 rounded-xl sm:rounded-3xl shadow-xl sm:shadow-2xl p-3 sm:p-6 mb-4 sm:mb-8">
        <div className="flex flex-col md:flex-row gap-3 sm:gap-6">
          {/* Búsqueda - GRANDE */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar pedido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 sm:px-6 sm:py-4 border-2 sm:border-4 border-gray-300 rounded-xl sm:rounded-2xl focus:ring-2 sm:focus:ring-4 focus:ring-orange-400 focus:border-orange-500 transition-all text-sm sm:text-xl text-gray-800 font-bold"
            />
          </div>
          
          {/* Filtros - GRANDES */}
          <div className="flex gap-2 sm:gap-4 overflow-x-auto pb-2 sm:pb-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <style>{`
              div::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            <button
              onClick={() => setActiveFilter('pending')}
              className={`px-3 py-2 sm:px-8 sm:py-4 text-sm sm:text-xl font-bold transition-all rounded-xl sm:rounded-2xl flex items-center space-x-1 sm:space-x-3 whitespace-nowrap flex-shrink-0 ${
                activeFilter === 'pending'
                  ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white border-2 sm:border-4 border-yellow-600 shadow-xl'
                  : 'bg-white text-gray-800 hover:bg-yellow-50 border-2 sm:border-4 border-gray-300 hover:border-yellow-400'
              }`}
            >
              <span className="text-xl sm:text-3xl">⏳</span>
              <span>PENDIENTES</span>
            </button>
            <button
              onClick={() => setActiveFilter('cancelled')}
              className={`px-3 py-2 sm:px-8 sm:py-4 text-sm sm:text-xl font-bold transition-all rounded-xl sm:rounded-2xl flex items-center space-x-1 sm:space-x-3 whitespace-nowrap flex-shrink-0 ${
                activeFilter === 'cancelled'
                  ? 'bg-gradient-to-r from-red-400 to-red-500 text-white border-2 sm:border-4 border-red-600 shadow-xl'
                  : 'bg-white text-gray-800 hover:bg-red-50 border-2 sm:border-4 border-gray-300 hover:border-red-400'
              }`}
            >
              <span className="text-xl sm:text-3xl">❌</span>
              <span>CANCELADAS</span>
            </button>
            <button
              onClick={() => setActiveFilter('completed')}
              className={`px-3 py-2 sm:px-8 sm:py-4 text-sm sm:text-xl font-bold transition-all rounded-xl sm:rounded-2xl flex items-center space-x-1 sm:space-x-3 whitespace-nowrap flex-shrink-0 ${
                activeFilter === 'completed'
                  ? 'bg-gradient-to-r from-green-400 to-green-500 text-white border-2 sm:border-4 border-green-600 shadow-xl'
                  : 'bg-white text-gray-800 hover:bg-green-50 border-2 sm:border-4 border-gray-300 hover:border-green-400'
              }`}
            >
              <span className="text-xl sm:text-3xl">✅</span>
              <span>COMPLETADAS</span>
            </button>
          </div>
        </div>
        
        {/* Filtros Avanzados */}
        <div className="mt-3 pt-3 border-t border-gray-200">
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
          >
            <i className={`ri-arrow-${showAdvancedFilters ? 'up' : 'down'}-s-line`}></i>
            Filtros Avanzados
          </button>
          
          {showAdvancedFilters && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Método de Pago */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Método de Pago</label>
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="mercadopago">Mercado Pago</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                </select>
              </div>
              
              {/* Rango de Fechas */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Rango de Fechas</label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="today">Hoy</option>
                  <option value="week">Última semana</option>
                  <option value="month">Último mes</option>
                </select>
              </div>
              
              {/* Ordenar Por */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Ordenar Por</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="newest">Más recientes</option>
                  <option value="oldest">Más antiguos</option>
                  <option value="amount_high">Mayor monto</option>
                  <option value="amount_low">Menor monto</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lista de pedidos - Mejorado */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white border-2 border-[#E5E5E5] rounded-2xl shadow-lg p-12 text-center">
          <div className="flex justify-center mb-4">
            <i className="ri-inbox-line text-gray-400 text-6xl"></i>
          </div>
          <p className="text-lg text-[#666] font-bold">
            {searchTerm ? 'No se encontraron pedidos con ese criterio' : 'No hay pedidos en este momento'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {filteredOrders.map((order, index) => (
            <div
              key={order.id}
              className="bg-white border-2 sm:border-4 border-gray-300 rounded-xl sm:rounded-3xl shadow-xl sm:shadow-2xl overflow-hidden transform transition-all duration-200 hover:shadow-2xl hover:border-orange-400 hover:scale-[1.02] sm:hover:scale-[1.03]"
            >
              {/* Header - GRANDE Y CLARO */}
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3 sm:p-6 border-b-2 sm:border-b-4 border-orange-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 sm:space-x-4">
                    <i className="ri-shopping-bag-line text-orange-400 text-2xl sm:text-5xl"></i>
                    <h3 className="font-bold text-lg sm:text-3xl">{order.order_number}</h3>
                  </div>
                  <div className="px-3 py-1.5 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl text-lg sm:text-2xl font-bold bg-white text-orange-600 shadow-xl">
                    {getStatusIcon(order.status)}
                  </div>
                </div>
              </div>

              {/* Información - GRANDE Y CLARA */}
              <div className="p-6">
                {/* Cliente - GRANDE */}
                <div className="mb-4 cursor-pointer" onClick={() => setSelectedOrder(order)} title="Click para ver detalles">
                  <p className="font-bold text-2xl text-gray-800 mb-2 flex items-center space-x-2">
                    <i className="ri-user-line text-orange-500"></i>
                    <span>{order.customer_name}</span>
                  </p>
                  <p className="text-xl text-gray-600 font-semibold flex items-center space-x-2">
                    <i className="ri-phone-line text-blue-500"></i>
                    <span>{order.customer_phone}</span>
                  </p>
                </div>
                
                <div className="flex items-center justify-between mb-4 border-t-4 border-gray-200 pt-4 mt-4">
                  <span className="text-xl text-gray-600 font-bold">TOTAL:</span>
                  <span className="font-bold text-3xl text-gray-800">${order.total.toLocaleString('es-AR')}</span>
                </div>
                
                <div className="text-lg text-gray-700 mb-3 font-semibold flex items-center space-x-2">
                  <i className="ri-bank-card-line text-purple-500"></i>
                  <span>{order.payment_method || 'Pendiente'}</span>
                </div>

                {/* Dirección - GRANDE */}
                {order.customer_address && (
                  <div className="mb-4">
                    <p className="text-lg text-gray-700 font-semibold" title={order.customer_address}>
                      <i className="ri-map-pin-line text-red-500"></i>
                      <span>{order.customer_address}</span>
                    </p>
                  </div>
                )}

                {/* Items - GRANDE */}
                {order.items && order.items.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xl font-bold text-gray-800 mb-2 flex items-center space-x-2">
                      <i className="ri-shopping-cart-line text-green-500"></i>
                      <span>{order.items.length} producto{order.items.length > 1 ? 's' : ''}</span>
                    </p>
                    <div className="text-xs text-[#C7C7C7] max-h-20 overflow-y-auto space-y-1">
                      {order.items.slice(0, 2).map((item, idx) => {
                        // Parsear selected_options si existe
                        let extrasText = '';
                        try {
                          if (item.selected_options) {
                            const options = typeof item.selected_options === 'string' 
                              ? JSON.parse(item.selected_options) 
                              : item.selected_options;
                            
                            if (options.options && Array.isArray(options.options)) {
                              // Estructura nueva: { options: [...], optionsText: [...] }
                              if (options.optionsText && options.optionsText.length > 0) {
                                extrasText = ' - ' + options.optionsText.join(', ');
                              } else {
                                // Construir texto desde las opciones
                                const extraNames = options.options.map((opt: any) => {
                                  const priceText = opt.price > 0 ? ` (+$${opt.price})` : '';
                                  return `${opt.name}${priceText}`;
                                });
                                if (extraNames.length > 0) {
                                  extrasText = ' - ' + extraNames.join(', ');
                                }
                              }
                            } else if (Array.isArray(options)) {
                              // Si es un array directo
                              const extraNames = options.map((opt: any) => {
                                const priceText = opt.price > 0 ? ` (+$${opt.price})` : '';
                                return `${opt.name}${priceText}`;
                              });
                              if (extraNames.length > 0) {
                                extrasText = ' - ' + extraNames.join(', ');
                              }
                            } else if (typeof options === 'object') {
                              // Estructura antigua: {categoryId: [options]}
                              const allExtras: string[] = [];
                              Object.values(options).forEach((categoryOptions: any) => {
                                if (Array.isArray(categoryOptions)) {
                                  categoryOptions.forEach((opt: any) => {
                                    const priceText = opt.price > 0 ? ` (+$${opt.price})` : '';
                                    allExtras.push(`${opt.name}${priceText}`);
                                  });
                                }
                              });
                              if (allExtras.length > 0) {
                                extrasText = ' - ' + allExtras.join(', ');
                              }
                            }
                          }
                        } catch (e) {
                          console.error('Error parsing selected_options:', e);
                        }
                        
                        return (
                          <div key={idx} className="truncate" title={`${item.quantity}x ${item.product_name}${extrasText}`}>
                            {item.quantity}x {item.product_name}
                            {extrasText && (
                              <span className="text-[#111111] text-[10px] block truncate">
                                └ {extrasText.replace(' - ', '')}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {order.items.length > 2 && (
                        <div className="text-[#C7C7C7]">+{order.items.length - 2} más</div>
                      )}
                  </div>
                </div>
              )}

                {/* Botones de acción - SÚPER SIMPLES Y GRANDES */}
                <div className="pt-4 border-t-4 border-gray-200">
                  {/* Botones de acción para pedidos pendientes */}
                  {canApprove(order) && (
                    <div className="space-y-3">
                      {/* Botón Imprimir - GRANDE */}
                      <button
                        onClick={() => handlePrintTicket(order)}
                        className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 text-xl flex items-center justify-center space-x-3"
                      >
                        <i className="ri-printer-line text-3xl"></i>
                        <span>IMPRIMIR TICKET</span>
                      </button>
                      
                      {/* Botón Aprobar/Pedido Listo - GRANDE */}
                      {(() => {
                        const isPickup = (order.delivery_fee || 0) === 0;
                        const buttonText = isPickup ? 'PEDIDO LISTO' : 'APROBAR PEDIDO';
                        const buttonIcon = isPickup ? '✅' : '✅';
                        
                        return (
                          <button
                            onClick={() => handleApprove(order.id)}
                            disabled={actionLoading === order.id}
                            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-xl flex items-center justify-center space-x-3"
                          >
                            {actionLoading === order.id ? (
                              <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <>
                                <i className="ri-checkbox-circle-fill text-3xl"></i>
                                <span>{buttonText}</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                      
                      {/* Botón Cancelar - GRANDE */}
                      <button
                        onClick={() => {
                          setRejectingOrderId(order.id);
                          setShowRejectModal(true);
                        }}
                        disabled={actionLoading === order.id}
                        className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-xl flex items-center justify-center space-x-3"
                      >
                        <i className="ri-close-circle-line text-3xl"></i>
                        <span>CANCELAR</span>
                      </button>
                    </div>
                  )}

                  {/* Botón de notificación para pedidos de retiro listos - GRANDE */}
                  {canNotifyPickup(order) && (
                    <div className="space-y-3">
                      {/* Botón Imprimir Ticket - GRANDE */}
                      <button
                        onClick={() => handlePrintTicket(order)}
                        className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 text-xl flex items-center justify-center space-x-3"
                      >
                        <i className="ri-printer-line text-3xl"></i>
                        <span>IMPRIMIR TICKET</span>
                      </button>
                      
                      {/* Botón Notificar Pedido Listo para Retiro - GRANDE */}
                      <button
                        onClick={() => handleNotifyPickupReady(order)}
                        disabled={actionLoading === order.id}
                        className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-xl flex items-center justify-center space-x-3"
                      >
                        {actionLoading === order.id ? (
                          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <>
                            <i className="ri-notification-line text-3xl"></i>
                            <span>AVISAR AL CLIENTE</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de detalles del pedido */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-extrabold text-gray-800">
                Detalles del Pedido {selectedOrder.order_number}
              </h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            {/* Información del cliente */}
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center space-x-2">
                <i className="ri-user-line text-orange-500"></i>
                <span>Cliente</span>
              </h4>
              <div className="space-y-2 text-sm">
                <p><strong>Nombre:</strong> {selectedOrder.customer_name}</p>
                <p><strong>Teléfono:</strong> {selectedOrder.customer_phone}</p>
                {selectedOrder.customer_address && (
                  <p><strong>Dirección:</strong> {selectedOrder.customer_address}</p>
                )}
              </div>
            </div>
            
            {/* Items con extras */}
            <div className="mb-6">
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center space-x-2">
                <i className="ri-shopping-cart-line text-green-500"></i>
                <span>Items del Pedido</span>
              </h4>
              <div className="space-y-3">
                {selectedOrder.items && selectedOrder.items.map((item, idx) => {
                  // Parsear selected_options
                  let extras: any[] = [];
                  try {
                    if (item.selected_options) {
                      const options = typeof item.selected_options === 'string' 
                        ? JSON.parse(item.selected_options) 
                        : item.selected_options;
                      
                      if (options.options && Array.isArray(options.options)) {
                        extras = options.options;
                      } else if (Array.isArray(options)) {
                        extras = options;
                      } else if (typeof options === 'object') {
                        // Estructura antigua: {categoryId: [options]}
                        const allExtras: any[] = [];
                        Object.values(options).forEach((categoryOptions: any) => {
                          if (Array.isArray(categoryOptions)) {
                            allExtras.push(...categoryOptions);
                          }
                        });
                        extras = allExtras;
                      }
                    }
                  } catch (e) {
                    console.error('Error parsing selected_options:', e);
                  }
                  
                  return (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">
                            {item.quantity}x {item.product_name}
                          </p>
                          <p className="text-sm text-gray-600">
                            ${item.unit_price?.toLocaleString('es-AR') || '0'} c/u
                          </p>
                        </div>
                        <p className="font-bold text-green-600">
                          ${item.subtotal.toLocaleString('es-AR')}
                        </p>
                      </div>
                      
                      {/* Mostrar extras si existen */}
                      {extras.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-700 mb-1">➕ Extras:</p>
                          <ul className="text-xs text-gray-600 space-y-1">
                            {extras.map((extra: any, extraIdx: number) => (
                              <li key={extraIdx} className="flex items-center justify-between">
                                <span>• {extra.name || extra.id}</span>
                                {extra.price > 0 && (
                                  <span className="text-orange-600 font-medium">
                                    +${extra.price.toLocaleString('es-AR')}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Total */}
            <div className="p-4 bg-green-50 rounded-xl">
              <div className="flex items-center justify-between text-lg">
                <span className="font-semibold text-gray-800 flex items-center space-x-2">
                  <i className="ri-money-dollar-circle-line text-green-500"></i>
                  <span>Total:</span>
                </span>
                <span className="font-extrabold text-green-600 text-xl">
                  ${selectedOrder.total.toLocaleString('es-AR')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de rechazo */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md transform transition-all">
            <div className="text-center mb-6">
              <div className="bg-gradient-to-r from-red-500 to-rose-600 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">❌</span>
              </div>
              <h3 className="text-3xl font-extrabold text-gray-800 mb-2">
                Cancelar Pedido
              </h3>
              <p className="text-gray-600 font-semibold">
                ¿Estás seguro de que querés cancelar este pedido?
              </p>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase">
                Motivo de la cancelación *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ej: Cliente canceló, producto no disponible, pago rechazado, etc."
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-red-500 focus:border-red-500 transition-all resize-none"
                rows={3}
                required
              />
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                  setRejectingOrderId(null);
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-extrabold py-4 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95"
              >
                Volver
              </button>
      <button
                onClick={() => {
                  if (!rejectReason.trim()) {
                    showToast('Por favor, ingresá el motivo de la cancelación', 'error');
                    return;
                  }
                  if (rejectingOrderId) {
                    handleReject(rejectingOrderId, rejectReason);
                  }
                }}
                disabled={actionLoading === rejectingOrderId || !rejectReason.trim()}
                className="flex-1 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-extrabold py-4 rounded-xl transition-all duration-300 disabled:opacity-50 shadow-xl hover:shadow-2xl transform hover:scale-105 active:scale-95"
              >
                {actionLoading === rejectingOrderId ? (
                  <span className="flex items-center justify-center space-x-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Cancelando...</span>
                  </span>
                ) : (
                  '❌ Confirmar Cancelación'
                )}
      </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
