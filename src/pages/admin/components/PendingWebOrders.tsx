import { useState, useEffect } from 'react';
import { ordersApi } from '../../../lib/api';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address?: string;
  payment_method: string | null;
  payment_status: string;
  total: number;
  delivery_fee?: number;
  status: string;
  created_at: string;
  items: OrderItem[];
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

export default function PendingWebOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30000); // Actualizar cada 30 segundos
    return () => clearInterval(interval);
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      // Obtener todos los pedidos (incluyendo los sin customer_phone)
      // Usar fetch directamente con ?all=true para obtener todos los pedidos
      const API_URL = (import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api').replace(/\/+$/, '') + '/api';
      const response = await fetch(`${API_URL}/orders?all=true`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
        }
      });
      if (!response.ok) throw new Error('Error al obtener pedidos');
      const data = await response.json();
      
      // Filtrar solo pedidos pendientes de confirmación (sin customer_phone y payment_status = 'pending')
      const pendingOrders = (data || []).filter((order: any) => {
        const hasPhone = order.customer_phone && order.customer_phone.trim() !== '';
        const isPending = order.payment_status === 'pending';
        return !hasPhone && isPending;
      });

      const normalized = pendingOrders.map((order: any) => ({
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
      }));

      setOrders(normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (error) {
      console.error('Error loading pending web orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const parseSelectedOptions = (options: string | null | undefined) => {
    if (!options) return [];
    try {
      const parsed = JSON.parse(options);
      if (parsed.options && Array.isArray(parsed.options)) {
        return parsed.options.map((opt: any) => opt.name || opt);
      }
      if (Array.isArray(parsed)) {
        return parsed.map((opt: any) => opt.name || opt);
      }
      return [];
    } catch {
      return [];
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando pedidos pendientes...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          📋 Pedidos Pendientes de Confirmación en WhatsApp
        </h2>
        <p className="text-gray-600">
          Estos pedidos fueron creados desde la web pero aún no fueron confirmados en WhatsApp.
          Solo lectura - No se pueden modificar.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 text-lg">
            ✅ No hay pedidos pendientes de confirmación
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-400"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">
                    Pedido {order.order_number}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Creado: {formatDate(order.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-800">
                    {formatCurrency(order.total)}
                  </div>
                  <div className="text-sm text-yellow-600 font-semibold mt-1">
                    ⏳ Pendiente de confirmación
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Cliente:</p>
                  <p className="text-gray-900">{order.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Dirección:</p>
                  <p className="text-gray-900">
                    {order.customer_address || 'No especificada'}
                  </p>
                </div>
              </div>

              {order.notes && (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-700">Notas:</p>
                  <p className="text-gray-900 text-sm">{order.notes}</p>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Items:</p>
                <div className="space-y-2">
                  {order.items.map((item) => {
                    const options = parseSelectedOptions(item.selected_options);
                    return (
                      <div key={item.id} className="bg-gray-50 rounded p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium text-gray-800">
                              {item.quantity}x {item.product_name}
                            </p>
                            {options.length > 0 && (
                              <div className="mt-1 ml-4">
                                {options.map((opt, idx) => (
                                  <p key={idx} className="text-sm text-gray-600">
                                    • {opt}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                          <p className="font-semibold text-gray-800 ml-4">
                            {formatCurrency(item.subtotal)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {order.delivery_fee && order.delivery_fee > 0 && (
                <div className="mt-4 pt-4 border-t flex justify-between">
                  <span className="text-gray-700">Envío:</span>
                  <span className="font-semibold text-gray-800">
                    {formatCurrency(order.delivery_fee)}
                  </span>
                </div>
              )}

              <div className="mt-4 pt-4 border-t bg-blue-50 rounded p-3">
                <p className="text-sm text-blue-800">
                  <strong>💡 Información para el bot:</strong>
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Código: <strong>{order.order_number}</strong> | 
                  Cliente: <strong>{order.customer_name}</strong> | 
                  Total: <strong>{formatCurrency(order.total)}</strong>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

