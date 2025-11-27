import { useState, useEffect } from 'react';

interface Metric {
  id: string;
  label: string;
  value: number;
  unit: string;
  trend: number;
  icon: string;
  color: string;
}

export default function RealTimeMetrics() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(() => {
      loadMetrics();
      setLastUpdate(new Date());
    }, 5000); // Actualizar cada 5 segundos

    return () => clearInterval(interval);
  }, []);

  const loadMetrics = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      // Cargar métricas en tiempo real
      const [ordersRes, salesRes] = await Promise.all([
        fetch(`${API_URL}/orders?storeId=${storeId}&status=pending&limit=100`, {
          headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
        }),
        fetch(`${API_URL}/analytics/realtime?storeId=${storeId}`, {
          headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
        }),
      ]);

      const orders = ordersRes.ok ? await ordersRes.json() : [];
      const salesData = salesRes.ok ? await salesRes.json() : {};

      // Calcular métricas
      const pendingOrders = orders.filter((o: any) => o.status === 'pending').length;
      const preparingOrders = orders.filter((o: any) => o.status === 'preparing').length;
      const readyOrders = orders.filter((o: any) => o.status === 'ready').length;

      const now = new Date();
      const todaySales = salesData.todaySales || 0;
      const todayOrders = salesData.todayOrders || orders.filter((o: any) => {
        const orderDate = new Date(o.created_at);
        return orderDate.toDateString() === now.toDateString();
      }).length;

      setMetrics([
        {
          id: 'pending',
          label: 'Pedidos Pendientes',
          value: pendingOrders,
          unit: '',
          trend: 0,
          icon: 'ri-time-line',
          color: 'from-amber-500 to-orange-500',
        },
        {
          id: 'preparing',
          label: 'En Preparación',
          value: preparingOrders,
          unit: '',
          trend: 0,
          icon: 'ri-restaurant-line',
          color: 'from-blue-500 to-indigo-500',
        },
        {
          id: 'ready',
          label: 'Listos para Entregar',
          value: readyOrders,
          unit: '',
          trend: 0,
          icon: 'ri-checkbox-circle-line',
          color: 'from-green-500 to-emerald-500',
        },
        {
          id: 'sales',
          label: 'Ventas Hoy',
          value: todaySales,
          unit: '$',
          trend: 0,
          icon: 'ri-money-dollar-circle-line',
          color: 'from-purple-500 to-violet-500',
        },
        {
          id: 'orders',
          label: 'Pedidos Hoy',
          value: todayOrders,
          unit: '',
          trend: 0,
          icon: 'ri-shopping-bag-3-line',
          color: 'from-rose-500 to-pink-500',
        },
      ]);
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: number, unit: string) => {
    if (unit === '$') {
      return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
      }).format(value);
    }
    return value.toLocaleString('es-AR');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Métricas en Tiempo Real</h2>
          <p className="text-xs text-slate-500 mt-1">
            Última actualización: {lastUpdate.toLocaleTimeString('es-AR')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-slate-500">En vivo</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className={`bg-gradient-to-br ${metric.color} rounded-xl p-4 text-white shadow-lg`}
          >
            <div className="flex items-center justify-between mb-2">
              <i className={`${metric.icon} text-2xl opacity-80`}></i>
            </div>
            <p className="text-xs opacity-90 mb-1">{metric.label}</p>
            <p className="text-2xl font-black">
              {metric.unit}
              {formatValue(metric.value, metric.unit)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

