import { useState } from 'react';

export default function ReportsManagement() {
  const [activeReport, setActiveReport] = useState<'sales' | 'products' | 'stock' | 'finance'>('sales');

  return (
    <div className="space-y-6">
      {/* Header - Premium Style */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">REPORTES</h2>
            <p className="text-sm text-[#C7C7C7]">Análisis y reportes profesionales del negocio</p>
          </div>
        </div>
      </div>

      {/* Navegación de tipos de reportes */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm">
        <div className="flex border-b border-[#C7C7C7]">
          {[
            { id: 'sales', label: 'Ventas', icon: '💰' },
            { id: 'products', label: 'Productos', icon: '🍔' },
            { id: 'stock', label: 'Stock', icon: '📦' },
            { id: 'finance', label: 'Finanzas', icon: '💸' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveReport(tab.id as any)}
              className={`px-6 py-3 text-xs font-medium transition-all border-b-2 ${
                activeReport === tab.id
                  ? 'border-[#FFC300] text-[#111111] bg-[#FFF9E6]'
                  : 'border-transparent text-[#C7C7C7] hover:text-[#111111]'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenido de reportes */}
        <div className="p-6">
          {activeReport === 'sales' && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[#111111] mb-4">REPORTES DE VENTAS</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">📅 Por Día</h4>
                  <p className="text-xs text-[#C7C7C7]">Ventas diarias detalladas</p>
                </div>
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">📆 Por Mes</h4>
                  <p className="text-xs text-[#C7C7C7]">Resumen mensual de ventas</p>
                </div>
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">🕐 Por Hora</h4>
                  <p className="text-xs text-[#C7C7C7]">Análisis de ventas por hora del día</p>
                </div>
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">💳 Por Método de Pago</h4>
                  <p className="text-xs text-[#C7C7C7]">Ventas por tipo de pago</p>
                </div>
              </div>
            </div>
          )}

          {activeReport === 'products' && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[#111111] mb-4">REPORTES DE PRODUCTOS</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">🔥 Más Vendidos</h4>
                  <p className="text-xs text-[#C7C7C7]">Productos con más ventas</p>
                </div>
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">💰 Margen de Ganancia</h4>
                  <p className="text-xs text-[#C7C7C7]">Análisis de rentabilidad por producto</p>
                </div>
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">📊 Rentabilidad</h4>
                  <p className="text-xs text-[#C7C7C7]">Productos más rentables</p>
                </div>
              </div>
            </div>
          )}

          {activeReport === 'stock' && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[#111111] mb-4">REPORTES DE STOCK</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">📦 Insumos Más Usados</h4>
                  <p className="text-xs text-[#C7C7C7]">Productos con mayor consumo</p>
                </div>
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">⚠️ Proyección de Fin de Stock</h4>
                  <p className="text-xs text-[#C7C7C7]">Cuándo se acabará cada insumo</p>
                </div>
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">📉 Merma Registrada</h4>
                  <p className="text-xs text-[#C7C7C7]">Pérdidas de stock registradas</p>
                </div>
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">⏰ Próximos Vencimientos</h4>
                  <p className="text-xs text-[#C7C7C7]">Productos próximos a vencer</p>
                </div>
              </div>
            </div>
          )}

          {activeReport === 'finance' && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[#111111] mb-4">REPORTES FINANCIEROS</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">💵 Ganancia Neta</h4>
                  <p className="text-xs text-[#C7C7C7]">Ganancia total del negocio</p>
                </div>
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">👥 Sueldos</h4>
                  <p className="text-xs text-[#C7C7C7]">Gastos en personal</p>
                </div>
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                  <h4 className="text-sm font-medium text-[#111111] mb-2">📊 Gastos</h4>
                  <p className="text-xs text-[#C7C7C7]">Todos los gastos registrados</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

