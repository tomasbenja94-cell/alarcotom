
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import LoadingSpinner from '../../components/base/LoadingSpinner';
import Button from '../../components/base/Button';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  total_amount: number;
  status: string;
  payment_method: string;
  items_summary: string;
  created_at: string;
  order_items: Array<{
    product_name: string;
    quantity: number;
    subtotal: number;
    options_text?: string;
  }>;
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadOrders();
    
    // Actualizar cada 30 segundos
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            product_name,
            quantity,
            subtotal,
            options_text
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (!error) {
        loadOrders();
      }
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'confirmed': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'preparing': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'ready': return 'bg-green-100 text-green-700 border-green-300';
      case 'delivering': return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'delivered': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente';
      case 'confirmed': return 'Confirmado';
      case 'preparing': return 'En cocina';
      case 'ready': return 'Listo';
      case 'delivering': return 'En camino';
      case 'delivered': return 'Entregado';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['pending', 'confirmed', 'preparing', 'ready', 'delivering'].includes(order.status);
    return order.status === filter;
  });

  const getOrderStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(order => order.created_at.startsWith(today));
    
    return {
      total: orders.length,
      today: todayOrders.length,
      pending: orders.filter(order => order.status === 'pending').length,
      active: orders.filter(order => ['pending', 'confirmed', 'preparing', 'ready', 'delivering'].includes(order.status)).length
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner text="Cargando pedidos..." />
      </div>
    );
  }

  const stats = getOrderStats();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate('/admin')}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <i className="ri-arrow-left-line text-gray-600"></i>
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-800">Gestión de Pedidos</h1>
                <p className="text-xs text-gray-500">{stats.active} activos • {stats.today} hoy</p>
              </div>
            </div>
            <Button
              onClick={loadOrders}
              variant="secondary"
              size="sm"
              icon="ri-refresh-line"
            >
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{stats.today}</p>
              <p className="text-xs text-gray-500">Hoy</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              <p className="text-xs text-gray-500">Pendientes</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.active}</p>
              <p className="text-xs text-gray-500">Activos</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'Todos', count: stats.total },
              { key: 'active', label: 'Activos', count: stats.active },
              { key: 'pending', label: 'Pendientes', count: stats.pending },
              { key: 'preparing', label: 'En cocina', count: orders.filter(o => o.status === 'preparing').length },
              { key: 'ready', label: 'Listos', count: orders.filter(o => o.status === 'ready').length },
              { key: 'delivered', label: 'Entregados', count: orders.filter(o => o.status === 'delivered').length }
            ].map((filterOption) => (
              <button
                key={filterOption.key}
                onClick={() => setFilter(filterOption.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === filterOption.key
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filterOption.label} ({filterOption.count})
              </button>
            ))}
          </div>
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <i className="ri-shopping-cart-line text-gray-300 text-4xl mb-4"></i>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">No hay pedidos</h3>
              <p className="text-gray-500">Los pedidos aparecerán aquí cuando se realicen</p>
            </div>
          ) : (
            filteredOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-bold text-gray-800">#{order.order_number}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                        {getStatusText(order.status)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{order.customer_name}</p>
                    <p className="text-xs text-gray-500">{order.customer_phone}</p>
                    <p className="text-xs text-gray-500">{formatTime(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg text-gray-800">{formatCurrency(order.total_amount)}</p>
                    <p className="text-xs text-gray-500">{order.payment_method}</p>
                  </div>
                </div>

                {/* Order Items */}
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <h4 className="font-medium text-gray-800 mb-2 text-sm">Productos:</h4>
                  <div className="space-y-1">
                    {order.order_items.map((item, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <div>
                          <span>{item.quantity}x {item.product_name}</span>
                          {item.options_text && (
                            <p className="text-xs text-gray-500 ml-4">+ {item.options_text}</p>
                          )}
                        </div>
                        <span className="text-gray-600">{formatCurrency(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Address */}
                <div className="mb-4">
                  <p className="text-sm text-gray-600">
                    <i className="ri-map-pin-line mr-1"></i>
                    {order.customer_address}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  {order.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateOrderStatus(order.id, 'confirmed')}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        <i className="ri-check-line mr-1"></i>
                        Confirmar
                      </button>
                      <button
                        onClick={() => updateOrderStatus(order.id, 'cancelled')}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        <i className="ri-close-line mr-1"></i>
                        Cancelar
                      </button>
                    </>
                  )}
                  
                  {order.status === 'confirmed' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'preparing')}
                      className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <i className="ri-restaurant-line mr-1"></i>
                      Iniciar Cocina
                    </button>
                  )}
                  
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'ready')}
                      className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <i className="ri-check-double-line mr-1"></i>
                      Marcar Listo
                    </button>
                  )}
                  
                  {order.status === 'ready' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'delivering')}
                      className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <i className="ri-truck-line mr-1"></i>
                      Enviar
                    </button>
                  )}
                  
                  {order.status === 'delivering' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'delivered')}
                      className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <i className="ri-check-line mr-1"></i>
                      Entregado
                    </button>
                  )}

                  {/* WhatsApp Contact */}
                  <a
                    href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center"
                  >
                    <i className="ri-whatsapp-line mr-1"></i>
                    WhatsApp
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
