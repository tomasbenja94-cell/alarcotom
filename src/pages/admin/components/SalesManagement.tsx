import { useState, useEffect } from 'react';
import { ordersApi } from '../../../lib/api';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  status: string;
  payment_method?: string;
  payment_status: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  order_items?: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    selected_options?: any;
  }>;
}

export default function SalesManagement() {
  const [sales, setSales] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Order | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadSales();
    
    // Actualizar cada 30 segundos
    const interval = setInterval(loadSales, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSales = async () => {
    try {
      setLoading(true);
      
      // Cargar órdenes desde la API del backend
      const orders = await ordersApi.getAll();
      
      // Las órdenes ya vienen con items incluidos desde el backend
      setSales(orders || []);
    } catch (error: any) {
      console.error('Error cargando ventas:', error);
      setSales([]);
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
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
      preparing: 'bg-purple-100 text-purple-800 border-purple-200',
      ready: 'bg-orange-100 text-orange-800 border-orange-200',
      delivered: 'bg-green-100 text-green-800 border-green-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200'
    };

    const statusLabels: Record<string, string> = {
      pending: 'Pendiente',
      confirmed: 'Confirmado',
      preparing: 'Preparando',
      ready: 'Listo',
      delivered: 'Entregado',
      cancelled: 'Cancelado'
    };

    return (
      <span className={`px-2 py-1 rounded-sm text-xs font-medium border ${
        statusColors[status] || 'bg-gray-100 text-gray-800 border-gray-200'
      }`}>
        {statusLabels[status] || status}
      </span>
    );
  };

  const filteredSales = sales.filter(sale => {
    const matchesStatus = filterStatus === 'all' || sale.status === filterStatus;
    const matchesMethod = filterMethod === 'all' || sale.payment_method === filterMethod;
    const matchesSearch = searchTerm === '' || 
      sale.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.customer_phone?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesMethod && matchesSearch;
  });

  const openDetailModal = (sale: Order) => {
    setSelectedSale(sale);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedSale(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#C7C7C7] border-t-[#111111] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#C7C7C7] font-medium">Cargando ventas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - Premium Style */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">VENTAS</h2>
            <p className="text-sm text-[#C7C7C7]">Lista completa de todas las ventas realizadas</p>
          </div>
          <button
            onClick={loadSales}
            className="px-4 py-2 text-sm font-medium bg-white hover:bg-[#F9F9F9] text-[#111111] rounded-sm transition-all border border-[#C7C7C7]"
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
              Buscar
            </label>
            <input
              type="text"
              placeholder="ID, Cliente, Teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
              Estado
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111]"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="confirmed">Confirmado</option>
              <option value="preparing">Preparando</option>
              <option value="ready">Listo</option>
              <option value="delivered">Entregado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
              Método de Pago
            </label>
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111]"
            >
              <option value="all">Todos</option>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="mercadopago">Mercado Pago</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="text-sm text-[#C7C7C7]">
              <span className="font-medium text-[#111111]">{filteredSales.length}</span> ventas
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Ventas */}
      {filteredSales.length === 0 ? (
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-12 text-center">
          <div className="text-5xl mb-4">💰</div>
          <p className="text-sm text-[#C7C7C7] font-medium">
            {searchTerm || filterStatus !== 'all' || filterMethod !== 'all'
              ? 'No se encontraron ventas con los filtros aplicados'
              : 'No hay ventas registradas'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F9F9F9] border-b border-[#C7C7C7]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-[#111111] uppercase tracking-wider">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-[#111111] uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-[#111111] uppercase tracking-wider">Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-[#111111] uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-[#111111] uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-[#111111] uppercase tracking-wider">Método</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-[#111111] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-[#111111] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C7C7C7]">
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-[#F9F9F9] transition-colors">
                    <td className="px-4 py-3 text-sm text-[#111111] font-mono">
                      #{sale.order_number}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#111111]">
                      {formatDate(sale.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#C7C7C7]">
                      {formatTime(sale.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-[#111111]">
                      {formatCurrency(sale.total)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#111111]">
                      <div>
                        <div className="font-medium">{sale.customer_name}</div>
                        {sale.customer_phone && (
                          <div className="text-xs text-[#C7C7C7]">{sale.customer_phone}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#111111]">
                      {sale.payment_method ? (
                        <span className="capitalize">{sale.payment_method}</span>
                      ) : (
                        <span className="text-[#C7C7C7]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatusBadge(sale.status)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => openDetailModal(sale)}
                        className="px-3 py-1 text-xs font-medium bg-[#111111] hover:bg-[#1A1A1A] text-white rounded-sm transition-all border border-[#FFC300]"
                      >
                        Ver Detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Detalle de Venta */}
      {showDetailModal && selectedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-[#FFC300]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#111111]">
                Detalle de Venta #{selectedSale.order_number}
              </h3>
              <button
                onClick={closeDetailModal}
                className="text-[#C7C7C7] hover:text-[#111111] text-2xl transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              {/* Información del Cliente */}
              <div className="bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm p-4">
                <h4 className="text-sm font-bold text-[#111111] mb-3 uppercase tracking-wider">
                  Información del Cliente
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[#C7C7C7]">Nombre:</span>
                    <span className="ml-2 font-medium text-[#111111]">{selectedSale.customer_name}</span>
                  </div>
                  {selectedSale.customer_phone && (
                    <div>
                      <span className="text-[#C7C7C7]">Teléfono:</span>
                      <span className="ml-2 font-medium text-[#111111]">{selectedSale.customer_phone}</span>
                    </div>
                  )}
                  {selectedSale.customer_address && (
                    <div className="col-span-2">
                      <span className="text-[#C7C7C7]">Dirección:</span>
                      <span className="ml-2 font-medium text-[#111111]">{selectedSale.customer_address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items del Pedido */}
              <div>
                <h4 className="text-sm font-bold text-[#111111] mb-3 uppercase tracking-wider">
                  Productos
                </h4>
                <div className="border border-[#C7C7C7] rounded-sm overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-[#F9F9F9] border-b border-[#C7C7C7]">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-bold text-[#111111] uppercase">Producto</th>
                        <th className="px-4 py-2 text-center text-xs font-bold text-[#111111] uppercase">Cantidad</th>
                        <th className="px-4 py-2 text-right text-xs font-bold text-[#111111] uppercase">Precio Unit.</th>
                        <th className="px-4 py-2 text-right text-xs font-bold text-[#111111] uppercase">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#C7C7C7]">
                      {selectedSale.order_items?.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 text-sm text-[#111111]">
                            <div className="font-medium">{item.product_name}</div>
                            {item.selected_options && typeof item.selected_options === 'object' && Object.keys(item.selected_options).length > 0 && (
                              <div className="text-xs text-[#C7C7C7] mt-1">
                                {Object.entries(item.selected_options).map(([key, value]) => (
                                  <div key={key}>• {key}: {String(value)}</div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-[#111111]">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-[#111111]">
                            {formatCurrency(item.unit_price)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-[#111111]">
                            {formatCurrency(item.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Resumen */}
              <div className="bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#C7C7C7]">Subtotal:</span>
                    <span className="font-medium text-[#111111]">{formatCurrency(selectedSale.subtotal)}</span>
                  </div>
                  {selectedSale.delivery_fee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[#C7C7C7]">Envío:</span>
                      <span className="font-medium text-[#111111]">{formatCurrency(selectedSale.delivery_fee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-[#C7C7C7]">
                    <span className="font-bold text-[#111111]">Total:</span>
                    <span className="font-bold text-lg text-[#111111]">{formatCurrency(selectedSale.total)}</span>
                  </div>
                </div>
              </div>

              {/* Información Adicional */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[#C7C7C7]">Estado:</span>
                  <div className="mt-1">{getStatusBadge(selectedSale.status)}</div>
                </div>
                <div>
                  <span className="text-[#C7C7C7]">Método de Pago:</span>
                  <div className="mt-1 font-medium text-[#111111]">
                    {selectedSale.payment_method ? (
                      <span className="capitalize">{selectedSale.payment_method}</span>
                    ) : (
                      <span className="text-[#C7C7C7]">-</span>
                    )}
                  </div>
                </div>
                {selectedSale.notes && (
                  <div className="col-span-2">
                    <span className="text-[#C7C7C7]">Notas:</span>
                    <div className="mt-1 font-medium text-[#111111]">{selectedSale.notes}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-6 mt-6 border-t border-[#C7C7C7]">
              <button
                onClick={closeDetailModal}
                className="px-4 py-2 text-sm font-medium bg-[#111111] hover:bg-[#1A1A1A] text-white rounded-sm transition-all border border-[#FFC300]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

