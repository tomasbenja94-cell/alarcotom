import { useState, useEffect } from 'react';

interface AnalyticsData {
  sales: {
    today: number;
    week: number;
    month: number;
    trend: number;
  };
  orders: {
    today: number;
    week: number;
    month: number;
    trend: number;
  };
  customers: {
    total: number;
    new: number;
    returning: number;
  };
  topProducts: Array<{
    id: string;
    name: string;
    sales: number;
    revenue: number;
  }>;
  peakHours: Array<{
    hour: number;
    orders: number;
  }>;
}

export default function AdvancedAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/analytics?storeId=${storeId}&period=${period}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const analytics = await response.json();
        setData(analytics);
      } else {
        // Mock data para desarrollo
        setData({
          sales: { today: 125000, week: 850000, month: 3200000, trend: 15 },
          orders: { today: 45, week: 280, month: 1100, trend: 8 },
          customers: { total: 1250, new: 45, returning: 280 },
          topProducts: [
            { id: '1', name: 'Producto A', sales: 120, revenue: 48000 },
            { id: '2', name: 'Producto B', sales: 95, revenue: 38000 },
            { id: '3', name: 'Producto C', sales: 80, revenue: 32000 },
          ],
          peakHours: [
            { hour: 12, orders: 25 },
            { hour: 13, orders: 30 },
            { hour: 19, orders: 28 },
            { hour: 20, orders: 22 },
          ],
        });
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Analytics Avanzado</h2>
        <div className="flex gap-2">
          {[
            { id: 'today', label: 'Hoy' },
            { id: 'week', label: 'Semana' },
            { id: 'month', label: 'Mes' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                period === p.id
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-200">
          <p className="text-xs text-emerald-600 mb-1">Ventas</p>
          <p className="text-2xl font-bold text-emerald-700">
            {formatCurrency(
              period === 'today' ? data.sales.today : period === 'week' ? data.sales.week : data.sales.month
            )}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <i className={`ri-arrow-${data.sales.trend >= 0 ? 'up' : 'down'}-line text-emerald-600`}></i>
            <span className="text-xs text-emerald-600">{Math.abs(data.sales.trend)}%</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 mb-1">Pedidos</p>
          <p className="text-2xl font-bold text-blue-700">
            {period === 'today' ? data.orders.today : period === 'week' ? data.orders.week : data.orders.month}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <i className={`ri-arrow-${data.orders.trend >= 0 ? 'up' : 'down'}-line text-blue-600`}></i>
            <span className="text-xs text-blue-600">{Math.abs(data.orders.trend)}%</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
          <p className="text-xs text-purple-600 mb-1">Clientes</p>
          <p className="text-2xl font-bold text-purple-700">{data.customers.total}</p>
          <p className="text-xs text-purple-600 mt-2">
            {data.customers.new} nuevos
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
          <p className="text-xs text-amber-600 mb-1">Ticket Promedio</p>
          <p className="text-2xl font-bold text-amber-700">
            {formatCurrency(
              (period === 'today' ? data.sales.today : period === 'week' ? data.sales.week : data.sales.month) /
              (period === 'today' ? data.orders.today : period === 'week' ? data.orders.week : data.orders.month) || 0
            )}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Productos Top */}
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-4">Productos Más Vendidos</h3>
          <div className="space-y-3">
            {data.topProducts.map((product, idx) => (
              <div key={product.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.sales} ventas</p>
                  </div>
                </div>
                <p className="font-bold text-slate-800">{formatCurrency(product.revenue)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Horarios Pico */}
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-4">Horarios Pico</h3>
          <div className="space-y-3">
            {data.peakHours.map((peak) => {
              const maxOrders = Math.max(...data.peakHours.map(p => p.orders));
              const percentage = (peak.orders / maxOrders) * 100;
              
              return (
                <div key={peak.hour}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">
                      {peak.hour}:00 - {peak.hour + 1}:00
                    </span>
                    <span className="text-sm text-slate-600">{peak.orders} pedidos</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

