import { useState, useEffect } from 'react';

interface DailyCashStats {
  today: {
    revenue: number;
    orders: number;
    expenses: number;
    net: number;
    averageTicket: number;
  };
  byMethod: Array<{
    method: string;
    count: number;
    total: number;
  }>;
}

// Usar la URL correcta de la API
const rawApiUrl = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
const API_URL = rawApiUrl;

export default function DailyCash() {
  const [stats, setStats] = useState<DailyCashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<string>('');
  const [expenseDescription, setExpenseDescription] = useState<string>('');

  useEffect(() => {
    loadDailyStats();
  }, []);

  const loadDailyStats = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken');
      
      // Obtener estadísticas del día desde el API
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
        console.error('❌ [DailyCash] El servidor devolvió HTML en lugar de JSON');
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

      let salesData: any;
      try {
        salesData = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Respuesta inválida del servidor: ${responseText.substring(0, 100)}`);
      }
      
      // Calcular estadísticas del día
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Por ahora usar datos de ejemplo hasta que se implemente el endpoint específico
      setStats({
        today: {
          revenue: salesData.currentWeek?.revenue || 0,
          orders: salesData.currentWeek?.orders || 0,
          expenses: 0, // Esto vendría de otro endpoint
          net: salesData.currentWeek?.revenue || 0,
          averageTicket: salesData.total?.averageOrderValue || 0
        },
        byMethod: salesData.paymentMethods || []
      });
    } catch (error) {
      console.error('Error loading daily stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleCloseDay = async () => {
    if (!confirm('¿Estás seguro de cerrar el día? Esto generará un reporte del cierre.')) {
      return;
    }

    // Aquí se generaría el PDF del cierre
    alert('Funcionalidad de cierre de día y generación de PDF próximamente');
  };

  const handleAddExpense = async () => {
    const amount = parseFloat(expenses);
    if (isNaN(amount) || amount <= 0) {
      alert('Ingresa un monto válido');
      return;
    }

    // Aquí se registraría el egreso
    alert('Funcionalidad de registro de egresos próximamente');
    setExpenses('');
    setExpenseDescription('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#C7C7C7] border-t-[#111111] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#C7C7C7] font-medium">Cargando caja diaria...</p>
        </div>
      </div>
    );
  }

  const today = stats?.today || { revenue: 0, orders: 0, expenses: 0, net: 0, averageTicket: 0 };
  const byMethod = stats?.byMethod || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">CAJA DIARIA</h2>
            <p className="text-sm text-[#C7C7C7]">{new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <button
            onClick={handleCloseDay}
            className="px-4 py-2 text-sm font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
          >
            Cerrar Día
          </button>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">INGRESOS</div>
          <div className="text-3xl font-bold text-[#111111]">{formatCurrency(today.revenue)}</div>
        </div>

        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">EGRESOS</div>
          <div className="text-3xl font-bold text-[#111111]">{formatCurrency(today.expenses)}</div>
        </div>

        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">TOTAL NETO</div>
          <div className="text-3xl font-bold text-[#111111]">{formatCurrency(today.net)}</div>
        </div>

        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-2">PEDIDOS</div>
          <div className="text-3xl font-bold text-[#111111]">{today.orders}</div>
          <div className="text-xs text-[#C7C7C7] mt-1">Ticket promedio: {formatCurrency(today.averageTicket)}</div>
        </div>
      </div>

      {/* Ingresos por método de pago */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <h3 className="text-lg font-bold text-[#111111] mb-4">INGRESOS POR MÉTODO DE PAGO</h3>
        <div className="space-y-3">
          {byMethod.map((method, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 border-b border-[#C7C7C7] last:border-0">
              <span className="text-sm font-medium text-[#111111]">{method.method || 'Desconocido'}</span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-[#C7C7C7]">{method.count} pedidos</span>
                <span className="text-sm font-bold text-[#111111]">{formatCurrency(method.total)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Registrar egreso */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <h3 className="text-lg font-bold text-[#111111] mb-4">REGISTRAR EGRESO</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#C7C7C7] font-medium mb-1">Descripción</label>
            <input
              type="text"
              value={expenseDescription}
              onChange={(e) => setExpenseDescription(e.target.value)}
              placeholder="Ej: Compra de ingredientes"
              className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#C7C7C7] font-medium mb-1">Monto</label>
            <input
              type="number"
              value={expenses}
              onChange={(e) => setExpenses(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111]"
            />
          </div>
          <button
            onClick={handleAddExpense}
            className="w-full px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium rounded-sm transition-all border border-[#111111]"
          >
            Agregar Egreso
          </button>
        </div>
      </div>
    </div>
  );
}

