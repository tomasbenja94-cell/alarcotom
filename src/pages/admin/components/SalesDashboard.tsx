import { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Registrar componentes de Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SalesStats {
  total: {
    revenue: number;
    orders: number;
    deliveryFee: number;
    subtotal: number;
    averageOrderValue: number;
  };
  currentMonth: {
    revenue: number;
    orders: number;
  };
  currentWeek: {
    revenue: number;
    orders: number;
  };
  paymentMethods: Array<{
    method: string;
    count: number;
    total: number;
    percentage: number;
  }>;
  delivery: {
    deliveryOrders: number;
    pickupOrders: number;
    deliveryRevenue: number;
    pickupRevenue: number;
  };
  last30Days: Array<{
    date: string;
    revenue: number;
    orders: number;
  }>;
  last24Hours: Array<{
    hour: number;
    revenue: number;
    orders: number;
  }>;
  topProducts: Array<{
    name?: string;
    product_name?: string;
    quantity: number;
    revenue: number;
  }>;
}

// Usar la URL correcta de la API
const rawApiUrl = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
const API_URL = rawApiUrl;

async function fetchStats(): Promise<SalesStats> {
  const token = localStorage.getItem('adminToken');
  const endpoint = API_URL.endsWith('/api') ? `${API_URL}/stats/sales` : `${API_URL}/api/stats/sales`;
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json'
    }
  });
  
  // Verificar si la respuesta es HTML
  const responseText = await response.text();
  if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
    console.error('❌ [SalesDashboard] El servidor devolvió HTML en lugar de JSON');
    throw new Error(`El servidor devolvió HTML. Verifica que la URL del API sea correcta: ${API_URL}`);
  }
  
  if (!response.ok) {
    let errorData: any;
    try {
      errorData = JSON.parse(responseText);
    } catch {
      errorData = { error: responseText.substring(0, 200) || 'Error desconocido' };
    }
    throw new Error(errorData.error || 'Error al cargar estadísticas');
  }
  
  try {
    return JSON.parse(responseText);
  } catch (parseError) {
    throw new Error(`Respuesta inválida del servidor: ${responseText.substring(0, 100)}`);
  }
}

export default function SalesDashboard() {
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '30d'>('30d');

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000); // Actualizar cada 30 segundos
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStats();
      setStats(data);
    } catch (err: any) {
      console.error('Error loading stats:', err);
      setError(err.message || 'Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#C7C7C7] border-t-[#111111] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#C7C7C7] font-medium">Cargando estadísticas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6 text-center">
        <div className="text-3xl mb-4">❌</div>
        <p className="text-[#111111] font-medium text-base mb-4">{error}</p>
        <button
          onClick={loadStats}
          className="px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium rounded-sm transition-all border border-[#111111]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  // Formatear números
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-AR').format(num);
  };

  // Valores por defecto para evitar errores cuando los datos no están disponibles
  const last30Days = stats.last30Days || [];
  const last24Hours = stats.last24Hours || [];
  const paymentMethods = stats.paymentMethods || [];
  const topProducts = stats.topProducts || [];
  const delivery = stats.delivery || { deliveryOrders: 0, pickupOrders: 0, deliveryRevenue: 0, pickupRevenue: 0 };
  const total = stats.total || { revenue: 0, orders: 0, deliveryFee: 0, subtotal: 0, averageOrderValue: 0 };
  const currentMonth = stats.currentMonth || { revenue: 0, orders: 0 };
  const currentWeek = stats.currentWeek || { revenue: 0, orders: 0 };

  // Configurar gráfico de ingresos por día/hora - Premium Style
  const revenueChartData = timeRange === '30d' 
    ? {
        labels: last30Days.map(d => {
          const date = new Date(d.date);
          return `${date.getDate()}/${date.getMonth() + 1}`;
        }),
        datasets: [{
          label: 'Ingresos ($)',
          data: last30Days.map(d => d.revenue || 0),
          borderColor: '#111111',
          backgroundColor: 'rgba(255, 195, 0, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#111111',
          pointBorderColor: '#FFC300',
          pointBorderWidth: 2
        }]
      }
    : {
        labels: last24Hours.map(h => `${h.hour || 0}:00`),
        datasets: [{
          label: 'Ingresos ($)',
          data: last24Hours.map(h => h.revenue || 0),
          borderColor: '#111111',
          backgroundColor: 'rgba(255, 195, 0, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#111111',
          pointBorderColor: '#FFC300',
          pointBorderWidth: 2
        }]
      };

  // Configurar gráfico de métodos de pago - Premium Style
  const paymentMethodsData = {
    labels: paymentMethods.map(pm => pm.method || 'Desconocido'),
    datasets: [{
      data: paymentMethods.map(pm => pm.total || 0),
      backgroundColor: [
        '#111111',
        '#C7C7C7',
        '#A0A0A0',
        '#808080',
        '#606060',
        'rgba(255, 195, 0, 0.3)'
      ],
      borderColor: [
        '#111111',
        '#C7C7C7',
        '#A0A0A0',
        '#808080',
        '#606060',
        '#FFC300'
      ],
      borderWidth: 1
    }]
  };

  // Configurar gráfico de productos más vendidos - Premium Style
  const topProductsData = {
    labels: topProducts.slice(0, 5).map(p => {
      const name = p.name || p.product_name || 'Producto desconocido';
      return name.length > 20 ? name.substring(0, 20) + '...' : name;
    }),
    datasets: [{
      label: 'Cantidad vendida',
      data: topProducts.slice(0, 5).map(p => p.quantity || 0),
      backgroundColor: '#111111',
      borderColor: '#FFC300',
      borderWidth: 1,
      borderRadius: 0
    }]
  };

  // Configurar gráfico de delivery vs pickup - Premium Style
  const deliveryVsPickupData = {
    labels: ['Delivery', 'Retiro'],
    datasets: [{
      data: [delivery.deliveryOrders || 0, delivery.pickupOrders || 0],
      backgroundColor: [
        '#111111',
        '#C7C7C7'
      ],
      borderColor: [
        '#FFC300',
        '#FFC300'
      ],
      borderWidth: 1
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#111111',
          font: {
            size: 12,
            weight: 'bold' as const
          },
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: {
          size: 14,
          weight: 'bold' as const
        },
        bodyFont: {
          size: 12
        },
        cornerRadius: 8
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return formatCurrency(value);
          },
          color: '#C7C7C7',
          font: {
            size: 11
          }
        },
        grid: {
          color: '#C7C7C7',
          lineWidth: 0.5
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: '#C7C7C7',
          font: {
            size: 11
          }
        }
      }
    }
  };

  const barChartOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      x: {
        grid: {
          display: false
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header - Premium Style */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">DASHBOARD</h2>
            <p className="text-sm text-[#C7C7C7]">Métricas y análisis de ventas en tiempo real</p>
          </div>
          <button
            onClick={loadStats}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7] disabled:opacity-50"
          >
            {loading ? '🔄 Actualizando...' : '🔄 Actualizar'}
          </button>
        </div>
      </div>

      {/* Métricas principales - Premium Style */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ingresos Totales */}
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5 hover:border-[#FFC300] transition-all">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">TOTAL</div>
          <div className="text-3xl font-bold text-[#111111] mb-1">{formatCurrency(total.revenue)}</div>
          <div className="text-xs text-[#C7C7C7] mb-3">Ingresos totales</div>
          <div className="pt-3 border-t border-[#C7C7C7]">
            <div className="text-xs text-[#C7C7C7]">
              Promedio: {formatCurrency(total.averageOrderValue)} por pedido
            </div>
          </div>
        </div>

        {/* Pedidos Totales */}
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5 hover:border-[#FFC300] transition-all">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">TOTAL</div>
          <div className="text-3xl font-bold text-[#111111] mb-1">{formatNumber(total.orders)}</div>
          <div className="text-xs text-[#C7C7C7] mb-3">Pedidos completados</div>
          <div className="pt-3 border-t border-[#C7C7C7]">
            <div className="text-xs text-[#C7C7C7]">
              Este mes: {formatNumber(currentMonth.orders)} pedidos
            </div>
          </div>
        </div>

        {/* Mes Actual */}
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5 hover:border-[#FFC300] transition-all">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">MES ACTUAL</div>
          <div className="text-3xl font-bold text-[#111111] mb-1">{formatCurrency(currentMonth.revenue)}</div>
          <div className="text-xs text-[#C7C7C7] mb-3">Ingresos del mes</div>
          <div className="pt-3 border-t border-[#C7C7C7]">
            <div className="text-xs text-[#C7C7C7]">
              {formatNumber(currentMonth.orders)} pedidos
            </div>
          </div>
        </div>

        {/* Semana Actual */}
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5 hover:border-[#FFC300] transition-all">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">SEMANA ACTUAL</div>
          <div className="text-3xl font-bold text-[#111111] mb-1">{formatCurrency(currentWeek.revenue)}</div>
          <div className="text-xs text-[#C7C7C7] mb-3">Ingresos de la semana</div>
          <div className="pt-3 border-t border-[#C7C7C7]">
            <div className="text-xs text-[#C7C7C7]">
              {formatNumber(currentWeek.orders)} pedidos
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos principales - Premium Style */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico de ingresos */}
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#111111]">TENDENCIA DE INGRESOS</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setTimeRange('24h')}
                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${
                  timeRange === '24h'
                    ? 'bg-[#111111] text-white border-2 border-[#FFC300]'
                    : 'bg-white text-[#111111] hover:bg-[#F9F9F9] border border-[#C7C7C7]'
                }`}
              >
                24h
              </button>
              <button
                onClick={() => setTimeRange('30d')}
                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${
                  timeRange === '30d'
                    ? 'bg-[#111111] text-white border-2 border-[#FFC300]'
                    : 'bg-white text-[#111111] hover:bg-[#F9F9F9] border border-[#C7C7C7]'
                }`}
              >
                30d
              </button>
            </div>
          </div>
          <div className="h-64">
            <Line data={revenueChartData} options={chartOptions} />
          </div>
        </div>

        {/* Gráfico de métodos de pago */}
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
          <h3 className="text-lg font-bold text-[#111111] mb-4">MÉTODOS DE PAGO</h3>
          <div className="h-64">
            <Doughnut data={paymentMethodsData} options={chartOptions} />
          </div>
          <div className="mt-4 space-y-2">
            {paymentMethods.map((pm, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 border-b border-[#C7C7C7] last:border-0">
                <span className="font-medium text-sm text-[#111111]">{pm.method || 'Desconocido'}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[#C7C7C7]">{pm.count || 0} pedidos</span>
                  <span className="font-bold text-sm text-[#111111]">{formatCurrency(pm.total || 0)}</span>
                  <span className="text-xs text-[#C7C7C7]">({(pm.percentage || 0).toFixed(1)}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gráficos secundarios - Premium Style */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Productos más vendidos */}
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
          <h3 className="text-lg font-bold text-[#111111] mb-4">PRODUCTOS MÁS VENDIDOS</h3>
          <div className="h-64">
            <Bar data={topProductsData} options={barChartOptions} />
          </div>
          <div className="mt-4 space-y-2">
            {topProducts.slice(0, 5).map((product, idx) => {
              const productName = product.name || product.product_name || 'Producto desconocido';
              return (
                <div key={idx} className="flex items-center justify-between p-3 border-b border-[#C7C7C7] last:border-0 hover:bg-[#F9F9F9] transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-[#111111]">#{idx + 1}</span>
                    <span className="font-medium text-sm text-[#111111]">{productName}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-[#C7C7C7]">{product.quantity || 0} unidades</span>
                    <span className="font-bold text-sm text-[#111111]">{formatCurrency(product.revenue || 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Delivery vs Pickup */}
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
          <h3 className="text-lg font-bold text-[#111111] mb-4">DELIVERY VS RETIRO</h3>
          <div className="h-64">
            <Doughnut data={deliveryVsPickupData} options={chartOptions} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
              <div className="text-2xl font-bold text-[#111111] mb-1">
                {formatNumber(delivery.deliveryOrders || 0)}
              </div>
              <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider">Delivery</div>
              <div className="text-xs text-[#C7C7C7] mt-2">
                {formatCurrency(delivery.deliveryRevenue || 0)} en total
              </div>
            </div>
            <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
              <div className="text-2xl font-bold text-[#111111] mb-1">
                {formatNumber(delivery.pickupOrders || 0)}
              </div>
              <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider">Retiro</div>
              <div className="text-xs text-[#C7C7C7] mt-2">
                {formatCurrency(delivery.pickupRevenue || 0)} en total
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Métricas adicionales - Premium Style */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">SUBTOTAL</div>
          <div className="text-2xl font-bold text-[#111111]">{formatCurrency(total.subtotal)}</div>
        </div>
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">COSTO DE ENVÍO</div>
          <div className="text-2xl font-bold text-[#111111]">{formatCurrency(total.deliveryFee)}</div>
        </div>
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">TICKET PROMEDIO</div>
          <div className="text-2xl font-bold text-[#111111]">{formatCurrency(total.averageOrderValue)}</div>
        </div>
      </div>
      </div>
  );
}

