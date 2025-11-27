import { useState, useEffect } from 'react';

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color: string;
  }>;
}

export default function ChartsAndTrends() {
  const [salesChart, setSalesChart] = useState<ChartData | null>(null);
  const [ordersChart, setOrdersChart] = useState<ChartData | null>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCharts();
  }, [period]);

  const loadCharts = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/analytics/charts?storeId=${storeId}&period=${period}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSalesChart(data.sales);
        setOrdersChart(data.orders);
      } else {
        // Mock data
        const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
        const labels = Array.from({ length: days }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - (days - i - 1));
          return period === 'year' ? date.toLocaleDateString('es-AR', { month: 'short' }) : date.getDate().toString();
        });
        
        setSalesChart({
          labels,
          datasets: [
            {
              label: 'Ventas',
              data: Array.from({ length: days }, () => Math.floor(Math.random() * 50000) + 100000),
              color: '#3b82f6',
            },
          ],
        });
        
        setOrdersChart({
          labels,
          datasets: [
            {
              label: 'Pedidos',
              data: Array.from({ length: days }, () => Math.floor(Math.random() * 20) + 30),
              color: '#10b981',
            },
          ],
        });
      }
    } catch (error) {
      console.error('Error loading charts:', error);
    } finally {
      setLoading(false);
    }
  };

  const SimpleBarChart = ({ data, title, color }: { data: ChartData; title: string; color: string }) => {
    const maxValue = Math.max(...data.datasets[0].data);
    const minValue = Math.min(...data.datasets[0].data);
    
    return (
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4">{title}</h3>
        <div className="flex items-end justify-between gap-1 h-64">
          {data.datasets[0].data.map((value, index) => {
            const height = ((value - minValue) / (maxValue - minValue)) * 100;
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div className="w-full flex flex-col items-center justify-end" style={{ height: '200px' }}>
                  <div
                    className={`w-full rounded-t-lg transition-all hover:opacity-80 ${color}`}
                    style={{ height: `${Math.max(height, 5)}%` }}
                    title={`${data.labels[index]}: ${value.toLocaleString('es-AR')}`}
                  ></div>
                </div>
                <span className="text-xs text-slate-500 mt-2 transform -rotate-45 origin-left">
                  {data.labels[index]}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
          <div>
            <p className="text-xs text-slate-500">Mínimo</p>
            <p className="font-bold text-slate-800">{minValue.toLocaleString('es-AR')}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">Promedio</p>
            <p className="font-bold text-slate-800">
              {(data.datasets[0].data.reduce((a, b) => a + b, 0) / data.datasets[0].data.length).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Máximo</p>
            <p className="font-bold text-slate-800">{maxValue.toLocaleString('es-AR')}</p>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Gráficos y Tendencias</h2>
          <p className="text-sm text-slate-500 mt-1">Análisis visual de tu negocio</p>
        </div>
        <div className="flex gap-2">
          {['week', 'month', 'year'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p as any)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                period === p
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Año'}
            </button>
          ))}
        </div>
      </div>

      {salesChart && (
        <SimpleBarChart
          data={salesChart}
          title="Tendencia de Ventas"
          color="bg-gradient-to-t from-blue-500 to-blue-400"
        />
      )}

      {ordersChart && (
        <SimpleBarChart
          data={ordersChart}
          title="Tendencia de Pedidos"
          color="bg-gradient-to-t from-green-500 to-green-400"
        />
      )}

      {/* Comparación de Métricas */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Crecimiento</h3>
          <div className="space-y-3">
            {[
              { label: 'Ventas', value: 27.5, trend: 'up' },
              { label: 'Pedidos', value: 18.4, trend: 'up' },
              { label: 'Clientes', value: 15.2, trend: 'up' },
            ].map((metric) => (
              <div key={metric.label} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{metric.label}</span>
                <span className={`font-bold ${
                  metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {metric.trend === 'up' ? '+' : '-'}{metric.value}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Promedios</h3>
          <div className="space-y-3">
            {[
              { label: 'Ticket Promedio', value: '$3,030' },
              { label: 'Pedidos/Día', value: '45' },
              { label: 'Tiempo Entrega', value: '35 min' },
            ].map((metric) => (
              <div key={metric.label} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{metric.label}</span>
                <span className="font-bold text-slate-800">{metric.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Objetivos</h3>
          <div className="space-y-3">
            {[
              { label: 'Ventas Mensuales', progress: 85, target: '$4,000,000' },
              { label: 'Nuevos Clientes', progress: 72, target: '150' },
              { label: 'Satisfacción', progress: 94, target: '4.8' },
            ].map((metric) => (
              <div key={metric.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-600">{metric.label}</span>
                  <span className="text-xs font-medium text-slate-500">{metric.progress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${metric.progress}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

