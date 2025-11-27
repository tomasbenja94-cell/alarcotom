import { useState } from 'react';

interface ReportConfig {
  type: 'sales' | 'orders' | 'customers' | 'products' | 'revenue';
  format: 'pdf' | 'excel' | 'csv';
  dateFrom: string;
  dateTo: string;
  includeCharts: boolean;
}

export default function AdvancedReports() {
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
    type: 'sales',
    format: 'pdf',
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    includeCharts: true,
  });
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/reports/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ ...reportConfig, storeId })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_${reportConfig.type}_${Date.now()}.${reportConfig.format}`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error al generar el reporte');
    } finally {
      setGenerating(false);
    }
  };

  const quickReports = [
    { id: 'daily', label: 'Reporte Diario', period: 1 },
    { id: 'weekly', label: 'Reporte Semanal', period: 7 },
    { id: 'monthly', label: 'Reporte Mensual', period: 30 },
  ];

  const handleQuickReport = (period: number) => {
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - period * 24 * 60 * 60 * 1000);
    
    setReportConfig({
      ...reportConfig,
      dateFrom: dateFrom.toISOString().split('T')[0],
      dateTo: dateTo.toISOString().split('T')[0],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Reportes Avanzados</h2>
          <p className="text-sm text-slate-500 mt-1">Genera reportes profesionales de tu negocio</p>
        </div>
      </div>

      {/* Reportes Rápidos */}
      <div className="grid grid-cols-3 gap-3">
        {quickReports.map((report) => (
          <button
            key={report.id}
            onClick={() => handleQuickReport(report.period)}
            className="p-4 bg-white border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-lg transition-all text-left"
          >
            <i className="ri-file-chart-line text-2xl text-blue-500 mb-2 block"></i>
            <p className="font-bold text-slate-800">{report.label}</p>
            <p className="text-xs text-slate-500 mt-1">Últimos {report.period} días</p>
          </button>
        ))}
      </div>

      {/* Configuración de Reporte */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4">Configurar Reporte</h3>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Tipo de Reporte</label>
            <select
              value={reportConfig.type}
              onChange={(e) => setReportConfig({ ...reportConfig, type: e.target.value as any })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            >
              <option value="sales">Ventas</option>
              <option value="orders">Pedidos</option>
              <option value="customers">Clientes</option>
              <option value="products">Productos</option>
              <option value="revenue">Ingresos</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Formato</label>
            <select
              value={reportConfig.format}
              onChange={(e) => setReportConfig({ ...reportConfig, format: e.target.value as any })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            >
              <option value="pdf">PDF</option>
              <option value="excel">Excel (XLSX)</option>
              <option value="csv">CSV</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Fecha Desde</label>
            <input
              type="date"
              value={reportConfig.dateFrom}
              onChange={(e) => setReportConfig({ ...reportConfig, dateFrom: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Fecha Hasta</label>
            <input
              type="date"
              value={reportConfig.dateTo}
              onChange={(e) => setReportConfig({ ...reportConfig, dateTo: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={reportConfig.includeCharts}
            onChange={(e) => setReportConfig({ ...reportConfig, includeCharts: e.target.checked })}
            className="w-4 h-4"
          />
          <label className="text-sm font-medium text-slate-700">Incluir gráficos</label>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="mt-6 w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Generando reporte...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <i className="ri-download-line"></i>
              Generar Reporte
            </span>
          )}
        </button>
      </div>

      {/* Reportes Predefinidos */}
      <div>
        <h3 className="font-bold text-slate-800 mb-4">Reportes Predefinidos</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { type: 'sales', label: 'Reporte de Ventas', icon: 'ri-money-dollar-circle-line' },
            { type: 'orders', label: 'Análisis de Pedidos', icon: 'ri-shopping-bag-3-line' },
            { type: 'customers', label: 'Análisis de Clientes', icon: 'ri-user-heart-line' },
            { type: 'products', label: 'Productos Más Vendidos', icon: 'ri-bar-chart-box-line' },
          ].map((report) => (
            <button
              key={report.type}
              onClick={() => {
                setReportConfig({ ...reportConfig, type: report.type as any });
                handleGenerate();
              }}
              className="p-4 bg-white border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-lg transition-all text-left"
            >
              <i className={`${report.icon} text-2xl text-blue-500 mb-2 block`}></i>
              <p className="font-bold text-slate-800">{report.label}</p>
              <p className="text-xs text-slate-500 mt-1">Generar reporte completo</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

