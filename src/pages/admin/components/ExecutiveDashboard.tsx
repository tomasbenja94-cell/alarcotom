import { useState, useEffect } from 'react';

interface KPIData {
  revenue: {
    today: number;
    yesterday: number;
    week: number;
    month: number;
    trend: number;
  };
  orders: {
    today: number;
    yesterday: number;
    week: number;
    month: number;
    trend: number;
    averageTicket: number;
  };
  customers: {
    new: number;
    returning: number;
    total: number;
    growth: number;
  };
  conversion: {
    rate: number;
    trend: number;
  };
  performance: {
    avgDeliveryTime: number;
    avgPrepTime: number;
    satisfaction: number;
  };
}

export default function ExecutiveDashboard() {
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [realTimeUpdates, setRealTimeUpdates] = useState(true);

  useEffect(() => {
    loadKPIs();
    if (realTimeUpdates) {
      const interval = setInterval(loadKPIs, 10000); // Actualizar cada 10s
      return () => clearInterval(interval);
    }
  }, [period, realTimeUpdates]);

  const loadKPIs = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/analytics/kpis?storeId=${storeId}&period=${period}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setKpis(data);
      } else {
        // Mock data para desarrollo
        setKpis({
          revenue: { today: 125000, yesterday: 98000, week: 850000, month: 3200000, trend: 27.5 },
          orders: { today: 45, yesterday: 38, week: 280, month: 1100, trend: 18.4, averageTicket: 3030 },
          customers: { new: 12, returning: 33, total: 1250, growth: 15 },
          conversion: { rate: 68, trend: 5 },
          performance: { avgDeliveryTime: 35, avgPrepTime: 18, satisfaction: 4.7 },
        });
      }
    } catch (error) {
      console.error('Error loading KPIs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  if (!kpis) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Dashboard Ejecutivo</h2>
          <p className="text-sm text-slate-500 mt-1">Vista general del negocio en tiempo real</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={realTimeUpdates}
              onChange={(e) => setRealTimeUpdates(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-slate-600">Actualización en tiempo real</span>
          </label>
          <div className="flex gap-2">
            {['today', 'week', 'month'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p as any)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  period === p
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Revenue */}
        <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <i className="ri-money-dollar-circle-line text-3xl opacity-80"></i>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              kpis.revenue.trend >= 0 ? 'bg-white/20' : 'bg-red-500/50'
            }`}>
              {kpis.revenue.trend >= 0 ? '↑' : '↓'} {Math.abs(kpis.revenue.trend).toFixed(1)}%
            </span>
          </div>
          <p className="text-xs opacity-90 mb-1">Ventas</p>
          <p className="text-3xl font-black">
            {formatCurrency(
              period === 'today' ? kpis.revenue.today : period === 'week' ? kpis.revenue.week : kpis.revenue.month
            )}
          </p>
        </div>

        {/* Orders */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <i className="ri-shopping-bag-3-line text-3xl opacity-80"></i>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              kpis.orders.trend >= 0 ? 'bg-white/20' : 'bg-red-500/50'
            }`}>
              {kpis.orders.trend >= 0 ? '↑' : '↓'} {Math.abs(kpis.orders.trend).toFixed(1)}%
            </span>
          </div>
          <p className="text-xs opacity-90 mb-1">Pedidos</p>
          <p className="text-3xl font-black">
            {period === 'today' ? kpis.orders.today : period === 'week' ? kpis.orders.week : kpis.orders.month}
          </p>
          <p className="text-xs opacity-80 mt-1">
            Ticket promedio: {formatCurrency(kpis.orders.averageTicket)}
          </p>
        </div>

        {/* Customers */}
        <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <i className="ri-user-line text-3xl opacity-80"></i>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-white/20">
              +{kpis.customers.growth}%
            </span>
          </div>
          <p className="text-xs opacity-90 mb-1">Clientes</p>
          <p className="text-3xl font-black">{kpis.customers.total}</p>
          <p className="text-xs opacity-80 mt-1">
            {kpis.customers.new} nuevos, {kpis.customers.returning} recurrentes
          </p>
        </div>

        {/* Conversion */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <i className="ri-line-chart-line text-3xl opacity-80"></i>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              kpis.conversion.trend >= 0 ? 'bg-white/20' : 'bg-red-500/50'
            }`}>
              {kpis.conversion.trend >= 0 ? '↑' : '↓'} {Math.abs(kpis.conversion.trend).toFixed(1)}%
            </span>
          </div>
          <p className="text-xs opacity-90 mb-1">Tasa de Conversión</p>
          <p className="text-3xl font-black">{kpis.conversion.rate}%</p>
        </div>
      </div>

      {/* Métricas de Performance */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">Tiempo Promedio de Entrega</h3>
            <i className="ri-time-line text-2xl text-blue-500"></i>
          </div>
          <p className="text-4xl font-black text-slate-800">{kpis.performance.avgDeliveryTime}</p>
          <p className="text-sm text-slate-500 mt-1">minutos</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">Tiempo de Preparación</h3>
            <i className="ri-restaurant-line text-2xl text-amber-500"></i>
          </div>
          <p className="text-4xl font-black text-slate-800">{kpis.performance.avgPrepTime}</p>
          <p className="text-sm text-slate-500 mt-1">minutos</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">Satisfacción</h3>
            <i className="ri-star-line text-2xl text-amber-500"></i>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-black text-slate-800">{kpis.performance.satisfaction}</p>
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <i
                  key={star}
                  className={`ri-star-${star <= Math.round(kpis.performance.satisfaction) ? 'fill' : 'line'} text-amber-400 text-xl`}
                ></i>
              ))}
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-1">de 5.0 estrellas</p>
        </div>
      </div>

      {/* Comparación Período Anterior */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl p-6 border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4">Comparación con Período Anterior</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Ventas</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-slate-800">
                {formatCurrency(
                  period === 'today' ? kpis.revenue.today : period === 'week' ? kpis.revenue.week : kpis.revenue.month
                )}
              </p>
              <span className={`text-sm font-bold ${
                kpis.revenue.trend >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {kpis.revenue.trend >= 0 ? '+' : ''}{kpis.revenue.trend.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              vs {period === 'today' ? 'ayer' : period === 'week' ? 'semana anterior' : 'mes anterior'}
            </p>
          </div>

          <div className="bg-white rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Pedidos</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-slate-800">
                {period === 'today' ? kpis.orders.today : period === 'week' ? kpis.orders.week : kpis.orders.month}
              </p>
              <span className={`text-sm font-bold ${
                kpis.orders.trend >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {kpis.orders.trend >= 0 ? '+' : ''}{kpis.orders.trend.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              vs {period === 'today' ? 'ayer' : period === 'week' ? 'semana anterior' : 'mes anterior'}
            </p>
          </div>

          <div className="bg-white rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Conversión</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-slate-800">{kpis.conversion.rate}%</p>
              <span className={`text-sm font-bold ${
                kpis.conversion.trend >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {kpis.conversion.trend >= 0 ? '+' : ''}{kpis.conversion.trend.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

