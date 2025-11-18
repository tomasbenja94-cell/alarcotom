import { useState, useEffect } from 'react';

interface DailyCostAnalysis {
  analysisDate: string;
  totalSales: number;
  totalExpenses: number;
  ingredientCost: number;
  laborCost: number;
  wasteCost: number;
  totalCost: number;
  netProfit: number;
  profitability: number;
  hoursWorked: number;
  ordersCount: number;
  averageTicket: number;
  details?: any;
}

export default function DailyCostAnalysis() {
  const [analysis, setAnalysis] = useState<DailyCostAnalysis | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  // Corregir URL si está usando api.elbuenmenu.site (que no existe)
  const rawApiUrl = import.meta.env.VITE_API_URL || 'https://elbuenmenu.site/api';
  const API_URL = rawApiUrl.includes('api.elbuenmenu.site') 
    ? 'https://elbuenmenu.site/api' 
    : rawApiUrl;

  useEffect(() => {
    loadAnalysis();
  }, [selectedDate]);

  const loadAnalysis = async () => {
    setIsLoading(true);
    try {
      const endpoint = API_URL.endsWith('/api') ? `${API_URL}/business/daily-cost-analysis?date=${selectedDate}` : `${API_URL}/api/business/daily-cost-analysis?date=${selectedDate}`;
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        setAnalysis(data.analysis || null);
      } else if (response.status === 404) {
        setAnalysis(null); // No hay análisis para esta fecha
      }
    } catch (error) {
      console.error('Error cargando análisis:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateAnalysis = async () => {
    if (!confirm('¿Generar análisis de costo real para esta fecha?\n\nEsto calculará:\n• Costo de insumos usados\n• Ganancia real del día\n• Desperdicio (merma)\n• Rentabilidad (%)\n• Horas trabajadas por empleados\n• Costo laboral del día')) {
      return;
    }

    setIsGenerating(true);
    try {
      const endpoint = API_URL.endsWith('/api') ? `${API_URL}/business/daily-cost-analysis/generate` : `${API_URL}/api/business/daily-cost-analysis/generate`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: selectedDate })
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysis(data.analysis);
        alert('✅ Análisis de costo real generado exitosamente');
      } else {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        alert(`❌ Error: ${error.error || 'Error al generar análisis'}`);
      }
    } catch (error: any) {
      console.error('Error generando análisis:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#111111]"></div>
          <p className="mt-4 text-sm text-[#C7C7C7]">Cargando análisis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">📊 COSTO REAL DEL DÍA</h2>
            <p className="text-sm text-[#C7C7C7]">Análisis completo de rentabilidad diaria</p>
          </div>
          <div className="flex items-center space-x-4">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            />
            <button
              onClick={generateAnalysis}
              disabled={isGenerating}
              className="px-4 py-2 bg-[#111111] text-white border border-[#FFC300] rounded-sm hover:bg-[#1A1A1A] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isGenerating ? 'Generando...' : '🔄 Generar Análisis'}
            </button>
          </div>
        </div>
      </div>

      {!analysis ? (
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-8 text-center">
          <p className="text-[#C7C7C7] mb-4">No hay análisis de costo para esta fecha</p>
          <button
            onClick={generateAnalysis}
            disabled={isGenerating}
            className="px-6 py-3 bg-[#111111] text-white border border-[#FFC300] rounded-sm hover:bg-[#1A1A1A] transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isGenerating ? 'Generando...' : '📊 Generar Análisis'}
          </button>
        </div>
      ) : (
        <>
          {/* Resumen Principal */}
          <div className="grid grid-cols-3 gap-4">
            {/* Ganancia Neta */}
            <div className="bg-white border-2 border-[#FFC300] rounded-sm shadow-sm p-6">
              <p className="text-sm text-[#C7C7C7] mb-2">GANANCIA NETA</p>
              <p className={`text-3xl font-bold ${analysis.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${analysis.netProfit.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-[#C7C7C7] mt-2">
                {analysis.profitability.toFixed(1)}% de rentabilidad
              </p>
            </div>

            {/* Ventas Totales */}
            <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
              <p className="text-sm text-[#C7C7C7] mb-2">VENTAS TOTALES</p>
              <p className="text-3xl font-bold text-[#111111]">
                ${analysis.totalSales.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-[#C7C7C7] mt-2">
                {analysis.ordersCount} pedidos • ${analysis.averageTicket.toFixed(0)} ticket promedio
              </p>
            </div>

            {/* Costo Total */}
            <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
              <p className="text-sm text-[#C7C7C7] mb-2">COSTO TOTAL</p>
              <p className="text-3xl font-bold text-[#111111]">
                ${analysis.totalCost.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-[#C7C7C7] mt-2">
                Insumos + Labor + Gastos + Merma
              </p>
            </div>
          </div>

          {/* Desglose de Costos */}
          <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
            <h3 className="text-lg font-bold text-[#111111] mb-4">💰 DESGLOSE DE COSTOS</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm">
                <p className="text-xs text-[#C7C7C7] mb-1">🍽️ Costo de Insumos</p>
                <p className="text-xl font-bold text-[#111111]">
                  ${analysis.ingredientCost.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-[#C7C7C7] mt-1">
                  {analysis.totalCost > 0 ? ((analysis.ingredientCost / analysis.totalCost) * 100).toFixed(1) : 0}% del total
                </p>
              </div>

              <div className="p-4 bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm">
                <p className="text-xs text-[#C7C7C7] mb-1">👥 Costo Laboral</p>
                <p className="text-xl font-bold text-[#111111]">
                  ${analysis.laborCost.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-[#C7C7C7] mt-1">
                  {analysis.hoursWorked.toFixed(1)} horas trabajadas
                </p>
              </div>

              <div className="p-4 bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm">
                <p className="text-xs text-[#C7C7C7] mb-1">⚠️ Desperdicio (Merma)</p>
                <p className="text-xl font-bold text-[#111111]">
                  ${analysis.wasteCost.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-[#C7C7C7] mt-1">
                  {analysis.totalCost > 0 ? ((analysis.wasteCost / analysis.totalCost) * 100).toFixed(1) : 0}% del total
                </p>
              </div>

              <div className="p-4 bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm">
                <p className="text-xs text-[#C7C7C7] mb-1">💸 Otros Gastos</p>
                <p className="text-xl font-bold text-[#111111]">
                  ${analysis.totalExpenses.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-[#C7C7C7] mt-1">
                  Proveedores, combustible, etc.
                </p>
              </div>
            </div>
          </div>

          {/* Métricas de Rentabilidad */}
          <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
            <h3 className="text-lg font-bold text-[#111111] mb-4">📈 MÉTRICAS DE RENTABILIDAD</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm">
                <p className="text-sm text-[#C7C7C7] mb-2">Rentabilidad</p>
                <div className="flex items-center justify-center space-x-2">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
                    analysis.profitability >= 30 ? 'bg-green-100 text-green-700' :
                    analysis.profitability >= 15 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {analysis.profitability.toFixed(0)}%
                  </div>
                </div>
                <p className="text-xs text-[#C7C7C7] mt-2">
                  {analysis.profitability >= 30 ? '✅ Excelente' :
                   analysis.profitability >= 15 ? '⚠️ Aceptable' :
                   '❌ Mejorar'}
                </p>
              </div>

              <div className="text-center p-4 bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm">
                <p className="text-sm text-[#C7C7C7] mb-2">Margen de Ganancia</p>
                <p className="text-2xl font-bold text-[#111111]">
                  {analysis.totalSales > 0 ? ((analysis.netProfit / analysis.totalSales) * 100).toFixed(1) : 0}%
                </p>
                <p className="text-xs text-[#C7C7C7] mt-2">
                  Por cada $100 vendidos
                </p>
              </div>

              <div className="text-center p-4 bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm">
                <p className="text-sm text-[#C7C7C7] mb-2">Costo por Pedido</p>
                <p className="text-2xl font-bold text-[#111111]">
                  ${analysis.ordersCount > 0 ? (analysis.totalCost / analysis.ordersCount).toFixed(0) : 0}
                </p>
                <p className="text-xs text-[#C7C7C7] mt-2">
                  Costo promedio por pedido
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

