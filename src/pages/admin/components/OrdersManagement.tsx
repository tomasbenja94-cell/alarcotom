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

// Toast component Ultra Premium
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const config = {
    success: {
      gradient: 'from-green-500 to-emerald-600',
      icon: 'ri-checkbox-circle-fill',
      bg: 'bg-green-500',
    },
    error: {
      gradient: 'from-red-500 to-rose-600',
      icon: 'ri-error-warning-fill',
      bg: 'bg-red-500',
    },
    info: {
      gradient: 'from-blue-500 to-indigo-600',
      icon: 'ri-information-fill',
      bg: 'bg-blue-500',
    },
  };

  const current = config[type];

  return (
    <div className={`fixed top-6 right-6 z-[9999] animate-slideInRight`}>
      <div className={`relative bg-gradient-to-r ${current.gradient} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center space-x-4 min-w-[320px] max-w-md border-2 border-white/20 backdrop-blur-sm`}>
        <div className="absolute inset-0 bg-white/10 rounded-2xl"></div>
        <div className="relative z-10 w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
          <i className={`${current.icon} text-white text-2xl`}></i>
        </div>
        <p className="font-bold flex-1 text-sm leading-relaxed">{message}</p>
        <button 
          onClick={onClose} 
          className="relative z-10 text-white/80 hover:text-white font-bold text-xl hover:scale-110 transition-transform w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/20"
        >
          ×
        </button>
      </div>
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
  const [storeName, setStoreName] = useState<string>('EL BUEN MENÚ');
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

  const loadStoreName = async () => {
    if (!storeId) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const response = await fetch(`${API_URL}/stores/${storeId}`);
      if (response.ok) {
        const store = await response.json();
        setStoreName(store.name || 'EL BUEN MENÚ');
      }
    } catch (error) {
      console.error('Error loading store name:', error);
    }
  };

  useEffect(() => {
    loadOrders();
    loadDeliveryPersons();
    loadPendingTransfers();
    loadStoreName();
    
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
      // IMPORTANTE: Pasar storeId para filtrar transferencias por tienda
      const data = await transfersApi.getPending(storeId ? { storeId } : undefined);
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
      
      // Pedido cargado
      
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
            // Pedido descartado: sin teléfono válido
            return false;
          }
          
          // 4. Verificar que tenga nombre de cliente
          const hasName = o.customer_name && o.customer_name.trim() !== '';
          if (!hasName) {
            // Pedido descartado: sin nombre de cliente
            return false;
          }
          
          // 5. Verificar que tenga items
          if (!o.items || o.items.length === 0) {
            // Pedido descartado: sin items
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
            // Pedido descartado: método de pago pendiente
            return false;
          }
          
          // 7. Validar que el total sea mayor a 0
          if (!o.total || o.total <= 0) {
            // Pedido descartado: total inválido
            return false;
          }
          
          // Nuevo pedido detectado
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


  // Imprimir ticket del pedido - Sistema Ultra Premium
  const handlePrintTicket = (order: Order) => {
    // Mostrar feedback visual antes de imprimir
    showToast('Preparando ticket para imprimir...', 'info');
    
    // Crear una ventana nueva con el ticket estético
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
      showToast('Por favor, permite ventanas emergentes para imprimir', 'error');
      return;
    }

    // Construir HTML del ticket mejorado
    const ticketHTML = `
<!DOCTYPE html>
        <html>
          <head>
  <meta charset="UTF-8">
  <title>Ticket Pedido ${order.order_number}</title>
            <style>
              @media print {
      @page { 
        margin: 0; 
        size: 80mm auto; 
      }
                body { margin: 0; }
                @page {
                  margin: 5mm;
                }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', 'Arial', sans-serif;
      width: 80mm;
      margin: 0 auto;
      padding: 12mm 8mm;
      background: white;
      font-size: 11px;
      line-height: 1.5;
      color: #000;
    }
    .header {
      text-align: center;
      border-bottom: 3px double #000;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      margin: 6px 0 0 0;
      font-size: 11px;
    }
    .header .order-number {
      font-size: 14px;
      font-weight: bold;
      margin-top: 4px;
    }
    .section {
      margin: 16px 0;
      padding-bottom: 12px;
      border-bottom: 1px dashed #666;
    }
    .section:last-child {
      border-bottom: none;
    }
    .section-title {
      font-weight: bold;
      font-size: 13px;
      margin-bottom: 10px;
      text-transform: uppercase;
      border-bottom: 1px solid #000;
      padding-bottom: 3px;
    }
    .item {
      display: flex;
      justify-content: space-between;
      margin: 6px 0;
      font-size: 11px;
      line-height: 1.4;
    }
    .item-name {
      flex: 1;
      padding-right: 5px;
    }
    .item-price {
      font-weight: bold;
      margin-left: 8px;
      white-space: nowrap;
    }
    .extras {
      margin-left: 12px;
      font-size: 9px;
      color: #444;
      margin-top: 2px;
      line-height: 1.3;
    }
    .total {
      font-size: 18px;
      font-weight: bold;
      text-align: right;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 3px double #000;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 9px;
      color: #666;
      border-top: 1px dashed #ccc;
      padding-top: 12px;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 12px 0;
    }
    .highlight-box {
      border: 2px solid #000;
      padding: 12px;
      text-align: center;
      background: #f5f5f5;
      margin-top: 15px;
      font-weight: bold;
    }
    .code-large {
      font-size: 28px;
      font-weight: bold;
      letter-spacing: 4px;
      margin: 8px 0;
      font-family: 'Courier New', monospace;
    }
            </style>
          </head>
          <body>
  <div class="header">
    <h1>${storeName.toUpperCase()}</h1>
    <div class="order-number">PEDIDO #${order.order_number}</div>
    <p>${new Date(order.created_at).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}</p>
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
  <div class="highlight-box">
    <div style="font-size: 14px; margin-bottom: 8px; text-transform: uppercase;">🔐 CÓDIGO DE RETIRO</div>
    <div class="code-large">${order.delivery_code}</div>
    <div style="font-size: 9px; color: #666; margin-top: 6px;">Presentá este código al retirar</div>
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
      printWindow.focus();
      printWindow.print();
      showToast('Ticket enviado a impresión', 'success');
    }, 800);
  };

  // Filtrar pedidos
  const filteredOrders = useMemo(() => {
    // Filtrando pedidos
    
    let filtered = orders;
    
    // Obtener IDs de pedidos con transferencias pendientes
    const ordersWithPendingTransfer = new Set(
      pendingTransfers
        .filter(t => t.status === 'pending')
        .map(t => t.order_id)
    );
    
    // Transferencias pendientes procesadas
    
    // Excluir pedidos con transferencias pendientes (deben ser aprobados primero en transferencias)
    filtered = filtered.filter(order => !ordersWithPendingTransfer.has(order.id));
    // Después de filtrar transferencias
    
    // Filtrar por tipo de entrega: DOMICILIO (delivery_fee > 0) o RETIRO (delivery_fee = 0)
    if (deliveryType === 'delivery') {
      // Solo pedidos a domicilio
      filtered = filtered.filter(order => (order.delivery_fee || 0) > 0);
      // Filtrado por DOMICILIO
    } else if (deliveryType === 'pickup') {
      // Solo pedidos para retiro
      filtered = filtered.filter(order => (order.delivery_fee || 0) === 0);
      // Filtrado por RETIRO
    }
    
    // Filtrar por estado simplificado: PENDIENTES - CANCELADAS - COMPLETADAS
    if (activeFilter === 'pending') {
      // Filtrando PENDIENTES
      // Solo pedidos pendientes de aceptar
      // IMPORTANTE: Solo mostrar pedidos confirmados en WhatsApp Y con método de pago confirmado
      filtered = filtered.filter(order => {
        // Analizando pedido
        
        // Incluir pedidos con status 'pending' o 'confirmed' (cuando el pago está aprobado pero aún no aprobado por admin)
        const isPendingOrConfirmed = order.status === 'pending' || order.status === 'confirmed';
        if (!isPendingOrConfirmed) {
          // Pedido excluido: status inválido
          return false;
        }
        
        // Verificar si el pedido fue confirmado en WhatsApp (tiene customer_phone)
        const hasPhone = order.customer_phone && order.customer_phone.trim() !== '';
        
        // Solo mostrar si tiene teléfono (confirmado en WhatsApp)
        if (!hasPhone) {
          // Pedido excluido: sin teléfono
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
          // Pedido excluido: método de pago inválido
          return false; // Excluir pedidos que aún no tienen método de pago confirmado
        }
        
        // Verificar el estado del pago según el método
        const isMercadoPago = paymentMethodLower.includes('mercadopago') || paymentMethodLower.includes('mercado pago');
        const isTransferencia = paymentMethodLower.includes('transferencia') || paymentMethodLower.includes('transfer');
        const isEfectivo = paymentMethodLower.includes('efectivo') || paymentMethodLower.includes('cash');
        
        // Para Mercado Pago: solo mostrar si el pago está aprobado
        if (isMercadoPago) {
          if (paymentStatus !== 'approved' && paymentStatus !== 'completed') {
            // Pedido excluido: Mercado Pago no aprobado
            return false; // No mostrar hasta que el pago esté aprobado
          }
          // Pedido incluido: Mercado Pago aprobado
          return true;
        }
        
        // Para Transferencia: mostrar si el pago está completado O si tiene transferencia pendiente
        if (isTransferencia) {
          // Si el pago está completado, mostrarlo directamente
          if (paymentStatus === 'completed' || paymentStatus === 'approved') {
            return true;
          }
          // Si no está completado, solo mostrar si tiene transferencia pendiente
          const hasPendingTransfer = pendingTransfers.some(
            t => t.order_id === order.id && t.status === 'pending'
          );
          return hasPendingTransfer;
        }
        
        // Para Efectivo: mostrar directamente (el pago se hace al recibir/retirar)
        if (isEfectivo) {
          const isPickup = (order.delivery_fee || 0) === 0;
          if (isPickup) {
            // Pedido incluido: retiro con efectivo
          } else {
            console.log(`[FILTER] ✅ Pedido ${order.order_number}: domicilio con efectivo - MOSTRAR`);
          }
          return true;
        }
        
        // Para otros métodos de pago, mostrar si está pendiente
        console.log(`[FILTER] ✅ Pedido ${order.order_number} PASÓ EL FILTRO - método: ${order.payment_method}, status: ${order.status}`);
        return true;
      });
      // Filtrado completado
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

  // Estadísticas - usar la misma lógica de filtrado que filteredOrders pero sin búsqueda ni fechas
  const stats = useMemo(() => {
    // Obtener IDs de pedidos con transferencias pendientes
    const ordersWithPendingTransfer = new Set(
      pendingTransfers
        .filter(t => t.status === 'pending')
        .map(t => t.order_id)
    );
    
    // Aplicar los mismos filtros que filteredOrders pero sin searchTerm y dateRange
    let filteredForStats = orders.filter(order => {
      // Excluir pedidos con transferencias pendientes
      if (ordersWithPendingTransfer.has(order.id)) return false;
      
      // Solo pedidos confirmados (con customer_phone y método de pago válido)
      const hasPhone = order.customer_phone && order.customer_phone.trim() !== '';
      if (!hasPhone) return false;
      
      // Verificar método de pago
      const paymentMethod = (order.payment_method || '').trim();
      const paymentMethodLower = paymentMethod.toLowerCase();
      const validPaymentMethods = ['mercadopago', 'mercado pago', 'transferencia', 'efectivo', 'cash', 'transfer'];
      const isPaymentMethodPending = paymentMethod === '' || 
                                     paymentMethod === 'null' ||
                                     paymentMethodLower.includes('pendiente') ||
                                     (!validPaymentMethods.some(valid => paymentMethodLower.includes(valid)));
      
      if (isPaymentMethodPending) return false;
      
      // Verificar estado de pago para Mercado Pago
      const paymentStatus = (order.payment_status || '').toLowerCase();
      const isMercadoPago = paymentMethodLower.includes('mercadopago') || paymentMethodLower.includes('mercado pago');
      if (isMercadoPago && paymentStatus !== 'approved' && paymentStatus !== 'completed') {
        return false;
      }
      
      return true;
    });
    
    return {
      pending: filteredForStats.filter(o => o.status === 'pending' || o.status === 'confirmed').length,
      cancelled: filteredForStats.filter(o => o.status === 'cancelled').length,
      completed: filteredForStats.filter(o => o.status === 'delivered').length,
    };
  }, [orders, pendingTransfers]);

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

      {/* Header Minimalista */}
      <div className="bg-white border border-gray-200 rounded-lg mb-3 p-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
              <i className="ri-shopping-bag-3-line text-white text-sm"></i>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-black flex items-center gap-2">
                <span>Pedidos</span>
                {stats.pending > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded">
                    {stats.pending}
                  </span>
                )}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded border border-gray-200">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
              <span className="text-[10px] text-gray-600">Auto</span>
            </div>
            <button
              onClick={() => loadOrders()}
              disabled={loading}
              className="px-2 py-1 text-[10px] bg-black text-white rounded border border-black hover:bg-gray-800 transition disabled:opacity-50 flex items-center gap-1"
            >
              {loading ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Cargando...</span>
                </>
              ) : (
                <>
                  <i className="ri-refresh-line text-xs"></i>
                  <span>Actualizar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas Minimalistas */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {/* PENDIENTES */}
        <div className="bg-white border border-gray-200 rounded-lg p-2 cursor-pointer hover:border-gray-300 transition" onClick={() => setActiveFilter('pending')}>
          <div className="flex items-center justify-between mb-1">
            <i className="ri-time-line text-gray-600 text-xs"></i>
            {stats.pending > 0 && (
              <span className="w-4 h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {stats.pending > 9 ? '9+' : stats.pending}
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-black leading-none mb-0.5">{stats.pending}</div>
          <div className="text-[9px] text-gray-600 font-medium">Pendientes</div>
        </div>

        {/* CANCELADAS */}
        <div className="bg-white border border-gray-200 rounded-lg p-2 cursor-pointer hover:border-gray-300 transition" onClick={() => setActiveFilter('cancelled')}>
          <div className="flex items-center justify-center mb-1">
            <i className="ri-close-circle-line text-gray-600 text-xs"></i>
          </div>
          <div className="text-xl font-bold text-black leading-none mb-0.5">{stats.cancelled}</div>
          <div className="text-[9px] text-gray-600 font-medium">Cancelados</div>
        </div>

        {/* COMPLETADAS */}
        <div className="bg-white border border-gray-200 rounded-lg p-2 cursor-pointer hover:border-gray-300 transition" onClick={() => setActiveFilter('completed')}>
          <div className="flex items-center justify-center mb-1">
            <i className="ri-checkbox-circle-fill text-gray-600 text-xs"></i>
          </div>
          <div className="text-xl font-bold text-black leading-none mb-0.5">{stats.completed}</div>
          <div className="text-[9px] text-gray-600 font-medium">Completados</div>
        </div>
      </div>

      {/* Selector de tipo de pedido - Minimalista */}
      <div className="bg-white border border-gray-200 rounded-lg p-2 mb-3">
        <div className="grid grid-cols-2 gap-2">
          {/* DOMICILIO */}
          <button
            onClick={() => setDeliveryType('delivery')}
            className={`relative px-3 py-2 text-xs font-medium transition-all rounded border flex items-center justify-center gap-1.5 ${
              deliveryType === 'delivery'
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className="text-sm">🚚</span>
            <span>Domicilio</span>
            {pendingDeliveryCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {pendingDeliveryCount > 9 ? '9+' : pendingDeliveryCount}
              </span>
            )}
          </button>

          {/* RETIRO */}
          <button
            onClick={() => setDeliveryType('pickup')}
            className={`relative px-3 py-2 text-xs font-medium transition-all rounded border flex items-center justify-center gap-1.5 ${
              deliveryType === 'pickup'
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className="text-sm">🏪</span>
            <span>Retiro</span>
            {pendingPickupCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {pendingPickupCount > 9 ? '9+' : pendingPickupCount}
              </span>
            )}
          </button>
        </div>
      </div>
      
      {/* Estilos CSS Premium */}
      <style>{`
        @keyframes vibrate {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
          20%, 40%, 60%, 80% { transform: translateX(3px); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes fadeInUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.5s ease-out;
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .scrollbar-hide::-webkit-scrollbar { 
          display: none; 
        }
        .scrollbar-hide { 
          -ms-overflow-style: none; 
          scrollbar-width: none; 
        }
      `}</style>

      {/* Búsqueda y Filtros - Ultra Premium */}
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Búsqueda Premium */}
          <div className="flex-1 relative">
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10">
              <i className="ri-search-line text-gray-400 text-xl"></i>
            </div>
            <input
              type="text"
              placeholder="Buscar por número de pedido, cliente o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-orange-300 focus:border-orange-500 transition-all text-base text-gray-800 font-medium bg-gray-50 focus:bg-white"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-circle-line text-xl"></i>
              </button>
            )}
          </div>
          
          {/* Filtros - Diseño Premium */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setActiveFilter('pending')}
              className={`px-5 py-3 text-base sm:text-lg font-bold transition-all rounded-xl flex items-center space-x-2 whitespace-nowrap flex-shrink-0 relative overflow-hidden ${
                activeFilter === 'pending'
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-lg scale-105 ring-2 ring-amber-300'
                  : 'bg-white text-gray-700 hover:bg-amber-50 border-2 border-gray-200 hover:border-amber-300 hover:shadow-md'
              }`}
            >
              {activeFilter === 'pending' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              )}
              <i className={`ri-time-line text-xl sm:text-2xl ${activeFilter === 'pending' ? 'text-white' : 'text-amber-500'}`}></i>
              <span className="relative z-10">PENDIENTES</span>
            </button>
            <button
              onClick={() => setActiveFilter('cancelled')}
              className={`px-5 py-3 text-base sm:text-lg font-bold transition-all rounded-xl flex items-center space-x-2 whitespace-nowrap flex-shrink-0 relative overflow-hidden ${
                activeFilter === 'cancelled'
                  ? 'bg-gradient-to-r from-red-400 to-red-500 text-white shadow-lg scale-105 ring-2 ring-red-300'
                  : 'bg-white text-gray-700 hover:bg-red-50 border-2 border-gray-200 hover:border-red-300 hover:shadow-md'
              }`}
            >
              {activeFilter === 'cancelled' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              )}
              <i className={`ri-close-circle-line text-xl sm:text-2xl ${activeFilter === 'cancelled' ? 'text-white' : 'text-red-500'}`}></i>
              <span className="relative z-10">CANCELADAS</span>
            </button>
            <button
              onClick={() => setActiveFilter('completed')}
              className={`px-5 py-3 text-base sm:text-lg font-bold transition-all rounded-xl flex items-center space-x-2 whitespace-nowrap flex-shrink-0 relative overflow-hidden ${
                activeFilter === 'completed'
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg scale-105 ring-2 ring-green-300'
                  : 'bg-white text-gray-700 hover:bg-green-50 border-2 border-gray-200 hover:border-green-300 hover:shadow-md'
              }`}
            >
              {activeFilter === 'completed' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              )}
              <i className={`ri-checkbox-circle-line text-xl sm:text-2xl ${activeFilter === 'completed' ? 'text-white' : 'text-green-500'}`}></i>
              <span className="relative z-10">COMPLETADAS</span>
            </button>
          </div>
        </div>
        
        {/* Filtros Avanzados Premium */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center gap-2 text-sm font-bold text-gray-700 hover:text-gray-900 transition-colors group"
          >
            <i className={`ri-filter-3-line text-lg transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`}></i>
            <span>Filtros Avanzados</span>
            <i className={`ri-arrow-${showAdvancedFilters ? 'up' : 'down'}-s-line transition-transform`}></i>
          </button>
          
          {showAdvancedFilters && (
            <div className="mt-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Método de Pago */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <i className="ri-bank-card-line text-purple-500"></i>
                    Método de Pago
                  </label>
                  <select
                    value={paymentMethodFilter}
                    onChange={(e) => setPaymentMethodFilter(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-purple-200 focus:border-purple-500 transition-all bg-white"
                  >
                    <option value="all">Todos los métodos</option>
                    <option value="mercadopago">Mercado Pago</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                  </select>
                </div>
                
                {/* Rango de Fechas */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <i className="ri-calendar-line text-blue-500"></i>
                    Rango de Fechas
                  </label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value as any)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-white"
                  >
                    <option value="all">Todas las fechas</option>
                    <option value="today">Hoy</option>
                    <option value="week">Última semana</option>
                    <option value="month">Último mes</option>
                  </select>
                </div>
                
                {/* Ordenar Por */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <i className="ri-sort-asc text-orange-500"></i>
                    Ordenar Por
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-orange-200 focus:border-orange-500 transition-all bg-white"
                  >
                    <option value="newest">Más recientes primero</option>
                    <option value="oldest">Más antiguos primero</option>
                    <option value="amount_high">Mayor monto</option>
                    <option value="amount_low">Menor monto</option>
                  </select>
                </div>
              </div>
              
              {/* Botón limpiar filtros */}
              {(paymentMethodFilter !== 'all' || dateRange !== 'all' || sortBy !== 'newest') && (
                <button
                  onClick={() => {
                    setPaymentMethodFilter('all');
                    setDateRange('all');
                    setSortBy('newest');
                  }}
                  className="mt-4 w-full py-2 bg-white border-2 border-gray-300 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Limpiar Filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lista de pedidos - Ultra Premium */}
      {filteredOrders.length === 0 ? (
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 rounded-3xl shadow-xl p-16 text-center border-2 border-gray-200">
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-64 h-64 bg-gray-400 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-gray-400 rounded-full blur-3xl"></div>
          </div>
          <div className="relative z-10">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-gray-200 to-gray-300 rounded-3xl flex items-center justify-center shadow-xl">
              <i className="ri-inbox-line text-gray-400 text-5xl"></i>
            </div>
            <h3 className="text-2xl font-black text-gray-700 mb-2">
              {searchTerm ? 'No se encontraron pedidos' : 'No hay pedidos en este momento'}
            </h3>
            <p className="text-gray-500 font-medium">
              {searchTerm ? 'Intenta con otros criterios de búsqueda' : 'Los pedidos aparecerán aquí cuando lleguen'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filteredOrders.map((order, index) => (
            <div
              key={order.id}
              className="group relative overflow-hidden bg-white rounded-lg shadow-sm border border-gray-200 transform transition-all duration-200 hover:shadow-md hover:border-gray-300"
              style={{ 
                animationDelay: `${index * 30}ms`,
                animationFillMode: 'both'
              }}
            >
              {/* Header Compacto */}
              <div className="relative overflow-hidden bg-gradient-to-r from-orange-500 to-orange-600 text-white p-2.5">
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center">
                      <i className="ri-shopping-bag-3-line text-white text-xs"></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-sm leading-tight">{order.order_number}</h3>
                      <p className="text-white/80 text-[10px] leading-tight">
                        {new Date(order.created_at).toLocaleString('es-AR', { 
                          day: '2-digit', 
                          month: 'short', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs">
                    {getStatusIcon(order.status)}
                  </div>
                </div>
              </div>

              {/* Información Compacta */}
              <div className="p-2.5 space-y-2">
                {/* Cliente */}
                <div 
                  className="p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-colors" 
                  onClick={() => setSelectedOrder(order)} 
                  title="Click para ver detalles completos"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-orange-500 rounded flex items-center justify-center flex-shrink-0">
                      <i className="ri-user-line text-white text-xs"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs text-gray-800 truncate">{order.customer_name}</p>
                      <p className="text-[10px] text-gray-500 flex items-center gap-1 truncate">
                        <i className="ri-phone-line text-blue-500"></i>
                        {order.customer_phone}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Total compacto */}
                <div className="relative overflow-hidden bg-green-600 rounded p-2 text-white">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase opacity-90">Total</span>
                    <span className="font-bold text-base">${order.total.toLocaleString('es-AR')}</span>
                  </div>
                  {order.delivery_fee && order.delivery_fee > 0 && (
                    <div className="mt-1 pt-1 border-t border-white/20 text-[10px] opacity-80">
                      Envío: ${order.delivery_fee.toLocaleString('es-AR')}
                    </div>
                  )}
                </div>
                
                {/* Método de pago compacto */}
                <div className="flex items-center gap-2 p-1.5 bg-gray-50 rounded">
                  <div className="w-5 h-5 bg-purple-500 rounded flex items-center justify-center flex-shrink-0">
                    <i className="ri-bank-card-line text-white text-xs"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-500">Pago</p>
                    <p className="text-xs font-semibold text-gray-800 truncate">{order.payment_method || 'Pendiente'}</p>
                  </div>
                  {order.payment_status === 'approved' || order.payment_status === 'completed' ? (
                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-semibold">✓</span>
                  ) : (
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-semibold">⏳</span>
                  )}
                </div>

                {/* Dirección compacta */}
                {order.customer_address && (
                  <div className="p-1.5 bg-blue-50 rounded border border-blue-200">
                    <div className="flex items-start gap-1.5">
                      <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-map-pin-line text-white text-xs"></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-blue-600 font-medium mb-0.5">Dirección</p>
                        <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{order.customer_address}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Items compacto */}
                {order.items && order.items.length > 0 && (
                  <div className="p-2 bg-green-50 rounded border border-green-200">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-5 h-5 bg-green-500 rounded flex items-center justify-center flex-shrink-0">
                        <i className="ri-shopping-cart-line text-white text-xs"></i>
                      </div>
                      <p className="font-semibold text-xs text-gray-800">
                        {order.items.length} producto{order.items.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="space-y-1 max-h-20 overflow-y-auto scrollbar-thin">
                      {order.items.slice(0, 2).map((item, idx) => {
                        // Parsear selected_options si existe
                        let extrasText = '';
                        try {
                          if (item.selected_options) {
                            const options = typeof item.selected_options === 'string' 
                              ? JSON.parse(item.selected_options) 
                              : item.selected_options;
                            
                            if (options.options && Array.isArray(options.options)) {
                              if (options.optionsText && options.optionsText.length > 0) {
                                extrasText = ' - ' + options.optionsText.join(', ');
                              } else {
                                const extraNames = options.options.map((opt: any) => {
                                  const priceText = opt.price > 0 ? ` (+$${opt.price})` : '';
                                  return `${opt.name}${priceText}`;
                                });
                                if (extraNames.length > 0) {
                                  extrasText = ' - ' + extraNames.join(', ');
                                }
                              }
                            } else if (Array.isArray(options)) {
                              const extraNames = options.map((opt: any) => {
                                const priceText = opt.price > 0 ? ` (+$${opt.price})` : '';
                                return `${opt.name}${priceText}`;
                              });
                              if (extraNames.length > 0) {
                                extrasText = ' - ' + extraNames.join(', ');
                              }
                            } else if (typeof options === 'object') {
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
                          <div key={idx} className="p-1 bg-white rounded border border-green-200" title={`${item.quantity}x ${item.product_name}${extrasText}`}>
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">
                                  {item.quantity}x {item.product_name}
                                </p>
                                {extrasText && (
                                  <p className="text-[10px] text-gray-600 mt-0.5 pl-1 border-l border-green-300 truncate">
                                    {extrasText.replace(' - ', '')}
                                  </p>
                                )}
                              </div>
                              <span className="text-xs font-semibold text-green-600 flex-shrink-0">${(item.subtotal || 0).toLocaleString('es-AR')}</span>
                            </div>
                          </div>
                        );
                      })}
                      {order.items.length > 2 && (
                        <div className="text-center pt-1">
                          <span className="inline-block px-2 py-0.5 bg-white rounded text-[10px] font-semibold text-gray-600 border border-green-200">
                            +{order.items.length - 2} más
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Botones de acción compactos */}
                <div className="pt-2 border-t border-gray-200 space-y-1.5">
                  {/* Botones de acción para pedidos pendientes */}
                  {canApprove(order) && (
                    <div className="space-y-1.5">
                      {/* Botón Imprimir */}
                      <button
                        onClick={() => handlePrintTicket(order)}
                        className="group relative w-full overflow-hidden bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded text-xs transition-all flex items-center justify-center gap-1.5"
                      >
                        <i className="ri-printer-line text-sm"></i>
                        <span>IMPRIMIR</span>
                      </button>
                      
                      {/* Botón Aprobar/Pedido Listo */}
                      {(() => {
                        const isPickup = (order.delivery_fee || 0) === 0;
                        const buttonText = isPickup ? 'LISTO' : 'APROBAR';
                        
                        return (
                          <button
                            onClick={() => handleApprove(order.id)}
                            disabled={actionLoading === order.id}
                            className="group relative w-full overflow-hidden bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                          >
                            {actionLoading === order.id ? (
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <>
                                <i className="ri-checkbox-circle-fill text-sm"></i>
                                <span>{buttonText}</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                      
                      {/* Botón Cancelar */}
                      <button
                        onClick={() => {
                          setRejectingOrderId(order.id);
                          setShowRejectModal(true);
                        }}
                        disabled={actionLoading === order.id}
                        className="group relative w-full overflow-hidden bg-red-600 hover:bg-red-700 text-white font-semibold py-1.5 px-3 rounded text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        <i className="ri-close-circle-line text-sm"></i>
                        <span>CANCELAR</span>
                      </button>
                    </div>
                  )}

                  {/* Botón de notificación para pedidos de retiro listos */}
                  {canNotifyPickup(order) && (
                    <div className="space-y-1.5">
                      {/* Botón Imprimir Ticket */}
                      <button
                        onClick={() => handlePrintTicket(order)}
                        className="group relative w-full overflow-hidden bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded text-xs transition-all flex items-center justify-center gap-1.5"
                      >
                        <i className="ri-printer-line text-sm"></i>
                        <span>IMPRIMIR</span>
                      </button>
                      
                      {/* Botón Notificar Pedido Listo para Retiro */}
                      <button
                        onClick={() => handleNotifyPickupReady(order)}
                        disabled={actionLoading === order.id}
                        className="group relative w-full overflow-hidden bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-3 rounded text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        {actionLoading === order.id ? (
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <i className="ri-notification-3-line text-sm"></i>
                            <span>AVISAR</span>
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

      {/* Modal de detalles del pedido - Ultra Premium */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-fadeIn">
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden transform transition-all">
            {/* Header del Modal */}
            <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <h3 className="text-3xl font-black mb-1">Pedido #{selectedOrder.order_number}</h3>
                  <p className="text-white/80 text-sm">
                    {new Date(selectedOrder.created_at).toLocaleString('es-AR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>
            
            {/* Contenido del Modal */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            
              {/* Información del cliente - Premium */}
              <div className="mb-6 p-5 bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border-2 border-orange-200">
                <h4 className="font-black text-gray-800 mb-4 flex items-center gap-2 text-lg">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
                    <i className="ri-user-line text-white text-xl"></i>
                  </div>
                  <span>Información del Cliente</span>
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-3 bg-white rounded-xl">
                    <p className="text-xs text-gray-500 font-medium mb-1">Nombre</p>
                    <p className="font-bold text-gray-800">{selectedOrder.customer_name}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl">
                    <p className="text-xs text-gray-500 font-medium mb-1">Teléfono</p>
                    <p className="font-bold text-gray-800 flex items-center gap-2">
                      <i className="ri-phone-line text-blue-500"></i>
                      {selectedOrder.customer_phone}
                    </p>
                  </div>
                  {selectedOrder.customer_address && (
                    <div className="p-3 bg-white rounded-xl md:col-span-2">
                      <p className="text-xs text-gray-500 font-medium mb-1">Dirección de Entrega</p>
                      <p className="font-bold text-gray-800 flex items-center gap-2">
                        <i className="ri-map-pin-line text-red-500"></i>
                        {selectedOrder.customer_address}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            
              {/* Items con extras - Premium */}
              <div className="mb-6">
                <h4 className="font-black text-gray-800 mb-4 flex items-center gap-2 text-lg">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center">
                    <i className="ri-shopping-cart-line text-white text-xl"></i>
                  </div>
                  <span>Items del Pedido ({selectedOrder.items?.length || 0})</span>
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
                      <div key={idx} className="bg-gradient-to-br from-white to-gray-50 border-2 border-gray-200 rounded-2xl p-4 hover:border-green-300 transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg font-bold text-sm">
                                {item.quantity}x
                              </span>
                              <p className="font-black text-lg text-gray-900">
                                {item.product_name}
                              </p>
                            </div>
                            <p className="text-sm text-gray-500 font-medium">
                              ${item.unit_price?.toLocaleString('es-AR') || '0'} c/u
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-xl text-green-600">
                              ${item.subtotal.toLocaleString('es-AR')}
                            </p>
                          </div>
                        </div>
                        
                        {/* Mostrar extras si existen */}
                        {extras.length > 0 && (
                          <div className="mt-3 pt-3 border-t-2 border-gray-200 bg-white/50 rounded-xl p-3">
                            <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-2">
                              <i className="ri-add-circle-line text-orange-500"></i>
                              Extras agregados
                            </p>
                            <div className="space-y-2">
                              {extras.map((extra: any, extraIdx: number) => (
                                <div key={extraIdx} className="flex items-center justify-between text-sm">
                                  <span className="text-gray-700 font-medium">• {extra.name || extra.id}</span>
                                  {extra.price > 0 && (
                                    <span className="text-orange-600 font-bold">
                                      +${extra.price.toLocaleString('es-AR')}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            
              {/* Resumen de totales - Premium */}
              <div className="p-6 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl text-white mb-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium opacity-90">Subtotal:</span>
                    <span className="font-bold">
                      ${((selectedOrder.total || 0) - (selectedOrder.delivery_fee || 0)).toLocaleString('es-AR')}
                    </span>
                  </div>
                  {selectedOrder.delivery_fee && selectedOrder.delivery_fee > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t border-white/20">
                      <span className="text-sm font-medium opacity-90">Envío:</span>
                      <span className="font-bold">${selectedOrder.delivery_fee.toLocaleString('es-AR')}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t-2 border-white/30">
                    <span className="text-lg font-black uppercase tracking-wider">Total:</span>
                    <span className="font-black text-3xl">
                      ${selectedOrder.total.toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Información adicional */}
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <p className="text-xs text-blue-600 font-medium mb-1">Método de Pago</p>
                  <p className="font-bold text-gray-800">{selectedOrder.payment_method || 'Pendiente'}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Estado: {selectedOrder.payment_status === 'approved' || selectedOrder.payment_status === 'completed' ? '✓ Pagado' : '⏳ Pendiente'}
                  </p>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <p className="text-xs text-purple-600 font-medium mb-1">Estado del Pedido</p>
                  <p className="font-bold text-gray-800">{getStatusText(selectedOrder.status)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(selectedOrder.created_at).toLocaleDateString('es-AR')}
                  </p>
                </div>
              </div>
              
              {/* Botones de acción en el modal */}
              <div className="flex gap-3 pt-4 border-t-2 border-gray-200">
                <button
                  onClick={() => handlePrintTicket(selectedOrder)}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <i className="ri-printer-line"></i>
                  Imprimir
                </button>
                {canApprove(selectedOrder) && (
                  <button
                    onClick={() => {
                      handleApprove(selectedOrder.id);
                      setSelectedOrder(null);
                    }}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <i className="ri-checkbox-circle-fill"></i>
                    Aprobar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de rechazo - Ultra Premium */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-fadeIn">
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
            <div className="relative overflow-hidden bg-gradient-to-br from-red-500 to-rose-600 text-white p-6">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
              <div className="relative z-10 text-center">
                <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl">
                  <i className="ri-error-warning-fill text-white text-4xl"></i>
                </div>
                <h3 className="text-3xl font-black mb-2">Cancelar Pedido</h3>
                <p className="text-white/90 font-medium">
                  Esta acción no se puede deshacer
                </p>
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <i className="ri-edit-box-line text-red-500"></i>
                  Motivo de la cancelación *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ej: Cliente canceló, producto no disponible, pago rechazado, etc."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-red-200 focus:border-red-500 transition-all resize-none font-medium"
                  rows={4}
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectReason('');
                    setRejectingOrderId(null);
                  }}
                  className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] flex items-center justify-center gap-2"
              >
                  <i className="ri-arrow-left-line"></i>
                  <span>Volver</span>
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
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-black rounded-xl transition-all shadow-lg hover:shadow-2xl transform hover:scale-[1.02] disabled:opacity-50 disabled:transform-none flex items-center justify-center gap-2"
                >
                  {actionLoading === rejectingOrderId ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <i className="ri-close-circle-fill text-xl"></i>
                      <span>Confirmar Cancelación</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
