import { useState, useEffect, useCallback, useMemo } from 'react';
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
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

  return (
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-6 py-4 rounded-xl shadow-2xl z-50 animate-slideInRight flex items-center space-x-3 min-w-[300px] max-w-md`}>
      <span className="text-2xl">{icon}</span>
      <p className="font-semibold flex-1">{message}</p>
      <button onClick={onClose} className="text-white hover:text-gray-200 font-bold text-xl">×</button>
    </div>
  );
}

export default function OrdersManagement() {
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

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    loadOrders();
    loadDeliveryPersons();
    loadPendingTransfers();
    
    // Auto-refresh cada 10 segundos
    const interval = setInterval(() => {
      loadOrders(true);
      loadPendingTransfers();
    }, 10000);
    
    return () => clearInterval(interval);
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
      const data = await ordersApi.getAll();
      
      const normalized = (data || []).map((order: any) => ({
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
      }));

      setOrders(normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
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
  const handleApprove = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) {
        showToast('Pedido no encontrado', 'error');
      return;
    }

      // Si es pedido a domicilio (delivery_fee > 0), marcarlo como 'ready' para repartidores
      // Si es pedido para retiro (delivery_fee = 0), marcarlo como 'preparing' (no necesita repartidor)
      const isDelivery = (order.delivery_fee || 0) > 0;
      const newStatus = isDelivery ? 'ready' : 'preparing';
      
      await ordersApi.update(orderId, { status: newStatus });
      
      if (isDelivery) {
        showToast('Pedido aprobado y disponible para repartidores', 'success');
      } else {
        showToast('Pedido aprobado y en preparación', 'success');
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

      // URL del webhook del bot (usar variable de entorno o default)
      const webhookUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://elbuenmenu.site';
      
      // Mensaje de notificación
      const message = `✅ ¡Tu pedido está listo para retirar!\n\n📦 Pedido: ${order.order_number}\n\n📍 Podés pasar a retirarlo cuando gustes.\n\n¡Gracias por tu compra! ❤️`;

      // Enviar notificación al cliente vía webhook del bot
      const response = await fetch(`${webhookUrl}/notify-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': import.meta.env.VITE_API_KEY || 'default-api-key'
        },
        body: JSON.stringify({
          customerPhone: order.customer_phone,
          orderNumber: order.order_number,
          message
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || 'Error al enviar notificación');
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
    <div>Estado: ${order.payment_status === 'completed' ? '✅ Pagado' : '⏳ Pendiente'}</div>
  </div>

  ${order.notes ? `
  <div class="section">
    <div class="section-title">Notas</div>
    <div>${order.notes}</div>
  </div>
  ` : ''}

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
    let filtered = orders;
    
    // Obtener IDs de pedidos con transferencias pendientes
    const ordersWithPendingTransfer = new Set(
      pendingTransfers
        .filter(t => t.status === 'pending')
        .map(t => t.order_id)
    );
    
    // Excluir pedidos con transferencias pendientes (deben ser aprobados primero en transferencias)
    filtered = filtered.filter(order => !ordersWithPendingTransfer.has(order.id));
    
    // Filtrar por tipo de entrega: DOMICILIO (delivery_fee > 0) o RETIRO (delivery_fee = 0)
    if (deliveryType === 'delivery') {
      // Solo pedidos a domicilio
      filtered = filtered.filter(order => (order.delivery_fee || 0) > 0);
    } else if (deliveryType === 'pickup') {
      // Solo pedidos para retiro
      filtered = filtered.filter(order => (order.delivery_fee || 0) === 0);
    }
    
    // Filtrar por estado simplificado: PENDIENTES - CANCELADAS - COMPLETADAS
    if (activeFilter === 'pending') {
      // Solo pedidos pendientes de aceptar
      // EXCLUIR pedidos de retiro con efectivo que no tienen transferencias pendientes
      filtered = filtered.filter(order => {
        if (order.status !== 'pending') return false;
        
        // Si es pedido de retiro (deliveryFee === 0) y pago en efectivo
        const isPickup = (order.delivery_fee || 0) === 0;
        const isCashPayment = order.payment_method === 'efectivo' || order.payment_method === 'cash';
        
        if (isPickup && isCashPayment) {
          // Solo mostrar si tiene una transferencia pendiente asociada
          const hasPendingTransfer = pendingTransfers.some(
            t => t.order_id === order.id && t.status === 'pending'
          );
          return hasPendingTransfer;
        }
        
        // Para todos los demás casos, mostrar si está pendiente
        return true;
      });
    } else if (activeFilter === 'cancelled') {
      // Solo pedidos cancelados/rechazados
      filtered = filtered.filter(order => order.status === 'cancelled');
    } else if (activeFilter === 'completed') {
      // Pedidos que fueron aceptados (cualquier estado después de 'pending')
      filtered = filtered.filter(order => 
        order.status !== 'pending' && order.status !== 'cancelled'
      );
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
    
    return filtered;
  }, [orders, activeFilter, deliveryType, searchTerm, pendingTransfers]);

  // Estadísticas simplificadas
  const stats = useMemo(() => {
    return {
      pending: orders.filter(o => o.status === 'pending').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
      completed: orders.filter(o => o.status !== 'pending' && o.status !== 'cancelled').length,
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
    const iconMap: Record<string, string> = {
      'pending': '⏳',
      'confirmed': '✅',
      'preparing': '🍳',
      'ready': '📦',
      'assigned': '🚚',
      'in_transit': '📍',
      'delivered': '🎉',
      'cancelled': '❌',
    };
    return iconMap[status] || '📋';
  };

  const canApprove = (order: Order) => {
    // Solo se puede aprobar si está pendiente
    return order.status === 'pending';
  };

  const canReject = (order: Order) => {
    // Solo se puede rechazar si está pendiente
    return order.status === 'pending';
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

      {/* Header premium - Mejorado */}
      <div className="bg-gradient-to-r from-white to-[#FFF9E6] border-2 border-[#FFC300] rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2 text-[#111111] flex items-center space-x-3">
              <span className="text-4xl">📦</span>
              <span>PEDIDOS</span>
            </h2>
            <p className="text-sm text-[#666] font-medium">Administra y gestiona todos los pedidos en tiempo real</p>
          </div>
          <button
            onClick={() => loadOrders()}
            disabled={loading}
            className="px-6 py-3 text-sm font-bold text-white bg-gradient-to-r from-[#111111] to-[#2A2A2A] hover:from-[#2A2A2A] hover:to-[#111111] rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.05] disabled:opacity-50 disabled:transform-none flex items-center space-x-2"
          >
            <span>🔄</span>
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Estadísticas simplificadas - Mejoradas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-300 rounded-2xl shadow-lg p-6 hover:scale-[1.02] transition-all">
          <div className="text-4xl mb-3">⏳</div>
          <div className="text-4xl font-bold text-[#111111] mb-2">{stats.pending}</div>
          <div className="text-sm text-[#666] font-bold uppercase tracking-wider">PENDIENTES</div>
          <div className="text-xs text-[#666] mt-2">Disponibles para aceptar</div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 rounded-2xl shadow-lg p-6 hover:scale-[1.02] transition-all">
          <div className="text-4xl mb-3">❌</div>
          <div className="text-4xl font-bold text-[#111111] mb-2">{stats.cancelled}</div>
          <div className="text-sm text-[#666] font-bold uppercase tracking-wider">CANCELADAS</div>
          <div className="text-xs text-[#666] mt-2">Pedidos rechazados</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-2xl shadow-lg p-6 hover:scale-[1.02] transition-all">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-4xl font-bold text-[#111111] mb-2">{stats.completed}</div>
          <div className="text-sm text-[#666] font-bold uppercase tracking-wider">COMPLETADAS</div>
          <div className="text-xs text-[#666] mt-2">Pedidos aceptados</div>
        </div>
      </div>

      {/* Selector de tipo de pedido: DOMICILIO o RETIRO - Mejorado */}
      <div className="bg-white border-2 border-[#E5E5E5] rounded-2xl shadow-md p-4 mb-6">
        <div className="flex gap-3">
          <button
            onClick={() => setDeliveryType('delivery')}
            className={`flex-1 px-6 py-4 text-sm font-bold transition-all rounded-xl flex items-center justify-center space-x-2 ${
              deliveryType === 'delivery'
                ? 'bg-gradient-to-r from-[#111111] to-[#2A2A2A] text-white border-2 border-[#FFC300] shadow-lg'
                : 'bg-white text-[#111111] hover:bg-[#F9F9F9] border-2 border-[#E5E5E5] hover:border-[#FFC300]'
            }`}
          >
            <span className="text-xl">🚚</span>
            <span>DOMICILIO</span>
          </button>
          <button
            onClick={() => setDeliveryType('pickup')}
            className={`flex-1 px-6 py-4 text-sm font-bold transition-all rounded-xl flex items-center justify-center space-x-2 ${
              deliveryType === 'pickup'
                ? 'bg-gradient-to-r from-[#111111] to-[#2A2A2A] text-white border-2 border-[#FFC300] shadow-lg'
                : 'bg-white text-[#111111] hover:bg-[#F9F9F9] border-2 border-[#E5E5E5] hover:border-[#FFC300]'
            }`}
          >
            <span className="text-xl">🏪</span>
            <span>RETIRO</span>
          </button>
        </div>
      </div>

      {/* Filtros y búsqueda - Mejorado */}
      <div className="bg-white border-2 border-[#E5E5E5] rounded-2xl shadow-md p-5 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Búsqueda */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="🔍 Buscar por número, cliente o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-5 py-3 border-2 border-[#E5E5E5] rounded-xl focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111] font-medium"
            />
          </div>
          
          {/* Filtros simplificados */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveFilter('pending')}
              className={`px-5 py-3 text-xs font-bold transition-all rounded-xl flex items-center space-x-2 ${
                activeFilter === 'pending'
                  ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white border-2 border-yellow-600 shadow-md'
                  : 'bg-white text-[#111111] hover:bg-yellow-50 border-2 border-[#E5E5E5] hover:border-yellow-300'
              }`}
            >
              <span>⏳</span>
              <span>PENDIENTES</span>
            </button>
            <button
              onClick={() => setActiveFilter('cancelled')}
              className={`px-5 py-3 text-xs font-bold transition-all rounded-xl flex items-center space-x-2 ${
                activeFilter === 'cancelled'
                  ? 'bg-gradient-to-r from-red-400 to-red-500 text-white border-2 border-red-600 shadow-md'
                  : 'bg-white text-[#111111] hover:bg-red-50 border-2 border-[#E5E5E5] hover:border-red-300'
              }`}
            >
              <span>❌</span>
              <span>CANCELADAS</span>
            </button>
            <button
              onClick={() => setActiveFilter('completed')}
              className={`px-5 py-3 text-xs font-bold transition-all rounded-xl flex items-center space-x-2 ${
                activeFilter === 'completed'
                  ? 'bg-gradient-to-r from-green-400 to-green-500 text-white border-2 border-green-600 shadow-md'
                  : 'bg-white text-[#111111] hover:bg-green-50 border-2 border-[#E5E5E5] hover:border-green-300'
              }`}
            >
              <span>✅</span>
              <span>COMPLETADAS</span>
            </button>
          </div>
        </div>
      </div>

      {/* Lista de pedidos - Mejorado */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white border-2 border-[#E5E5E5] rounded-2xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">📭</div>
          <p className="text-lg text-[#666] font-bold">
            {searchTerm ? 'No se encontraron pedidos con ese criterio' : 'No hay pedidos en este momento'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredOrders.map((order, index) => (
            <div
              key={order.id}
              className="bg-white border-2 border-[#E5E5E5] rounded-2xl shadow-lg overflow-hidden transform transition-all duration-200 hover:shadow-xl hover:border-[#FFC300] hover:scale-[1.02] animate-fadeIn"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              {/* Header compacto - Mejorado */}
              <div className="bg-gradient-to-r from-[#111111] to-[#2A2A2A] text-white p-4 border-b-2 border-[#FFC300]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">📦</span>
                    <h3 className="font-bold text-base">{order.order_number}</h3>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#FFC300] to-[#FFD60A] text-[#111111] shadow-md">
                    {getStatusIcon(order.status)}
                  </div>
                </div>
              </div>

              {/* Información compacta - Premium Style */}
              <div className="p-3">
                {/* Cliente y Total en una línea */}
                <div className="mb-2 cursor-pointer" onClick={() => setSelectedOrder(order)} title="Click para ver detalles">
                  <p className="font-medium text-sm text-[#111111] truncate">👤 {order.customer_name}</p>
                  <p className="text-xs text-[#C7C7C7] truncate">📱 {order.customer_phone}</p>
                </div>
                
                <div className="flex items-center justify-between mb-2 border-t border-[#C7C7C7] pt-2 mt-2">
                  <span className="text-xs text-[#C7C7C7] font-medium uppercase">Total:</span>
                  <span className="font-bold text-base text-[#111111]">${order.total.toLocaleString('es-AR')}</span>
                </div>
                
                <div className="text-xs text-[#C7C7C7] mb-2">💳 {order.payment_method || 'Pendiente de selección (Web)'}</div>

                {/* Dirección compacta */}
                {order.customer_address && (
                  <div className="mb-2">
                    <p className="text-xs text-[#C7C7C7] truncate" title={order.customer_address}>
                      📍 {order.customer_address}
                    </p>
                  </div>
                )}

                {/* Items compactos con extras */}
                {order.items && order.items.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-[#111111] mb-1">🛒 {order.items.length} item{order.items.length > 1 ? 's' : ''}</p>
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

                {/* Botones de acción compactos - Premium Style */}
                <div className="pt-2 border-t border-[#C7C7C7]">
                  {/* Botones de acción para pedidos pendientes */}
                  {canApprove(order) && (
                    <div className="space-y-2">
                      {/* Botón Imprimir Ticket - MUY IMPORTANTE */}
                  <button
                        onClick={() => handlePrintTicket(order)}
                        className="w-full bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium py-2 px-4 rounded-sm transition-all duration-200 text-xs flex items-center justify-center space-x-2 border-2 border-[#FFC300]"
                  >
                        <span className="text-sm">🖨️</span>
                        <span>IMPRIMIR</span>
                  </button>
                      
                      {/* Botón Aprobar (pasa directamente a repartidores) - Premium Style */}
                      <button
                        onClick={() => handleApprove(order.id)}
                        disabled={actionLoading === order.id}
                        className="w-full bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium py-2 px-4 rounded-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-xs flex items-center justify-center space-x-2 border border-[#C7C7C7]"
                      >
                        {actionLoading === order.id ? (
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <>
                            <span className="text-sm">✅</span>
                            <span>APROBAR</span>
                          </>
                        )}
                      </button>
                      
                      {/* Botón Cancelar (emoji X) - Premium Style */}
                  <button
                        onClick={() => {
                          setRejectingOrderId(order.id);
                          setShowRejectModal(true);
                        }}
                        disabled={actionLoading === order.id}
                        className="w-full bg-white hover:bg-[#F9F9F9] text-[#111111] font-medium py-2 px-3 rounded-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center border border-[#C7C7C7]"
                        title="Cancelar pedido"
                      >
                        ❌
                  </button>
                    </div>
                  )}

                  {/* Botón de notificación para pedidos de retiro listos - Premium Style */}
                  {canNotifyPickup(order) && (
                    <div className="space-y-2">
                      {/* Botón Imprimir Ticket */}
                      <button
                        onClick={() => handlePrintTicket(order)}
                        className="w-full bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium py-2 px-4 rounded-sm transition-all duration-200 text-xs flex items-center justify-center space-x-2 border-2 border-[#FFC300]"
                      >
                        <span className="text-sm">🖨️</span>
                        <span>IMPRIMIR</span>
                      </button>
                      
                      {/* Botón Notificar Pedido Listo para Retiro */}
                  <button
                        onClick={() => handleNotifyPickupReady(order)}
                        disabled={actionLoading === order.id}
                        className="w-full bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium py-2 px-4 rounded-sm transition-all duration-200 text-xs flex items-center justify-center space-x-2 border border-[#C7C7C7] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === order.id ? (
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <>
                            <span className="text-sm">📲</span>
                            <span>NOTIFICAR LISTO</span>
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
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all animate-scaleIn">
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
              <h4 className="font-semibold text-gray-800 mb-3">👤 Cliente</h4>
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
              <h4 className="font-semibold text-gray-800 mb-3">🛒 Items del Pedido</h4>
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
                <span className="font-semibold text-gray-800">💰 Total:</span>
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
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md transform transition-all animate-scaleIn">
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
