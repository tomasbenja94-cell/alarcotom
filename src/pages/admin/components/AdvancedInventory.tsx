import { useState, useEffect } from 'react';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  current_stock: number;
  min_stock: number;
  max_stock: number;
  unit: string;
  cost_per_unit: number;
  last_restocked?: string;
  supplier?: string;
}

export default function AdvancedInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'low_stock' | 'out_of_stock'>('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<Partial<InventoryItem>>({
    name: '',
    category: '',
    current_stock: 0,
    min_stock: 10,
    max_stock: 100,
    unit: 'unidad',
    cost_per_unit: 0,
  });

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/inventory?storeId=${storeId}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setItems(data || []);
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'low_stock') {
      return item.current_stock <= item.min_stock && item.current_stock > 0;
    }
    if (filter === 'out_of_stock') {
      return item.current_stock === 0;
    }
    return true;
  });

  const stats = {
    total: items.length,
    lowStock: items.filter(i => i.current_stock <= i.min_stock && i.current_stock > 0).length,
    outOfStock: items.filter(i => i.current_stock === 0).length,
    totalValue: items.reduce((sum, i) => sum + (i.current_stock * i.cost_per_unit), 0),
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
        <h2 className="text-xl font-bold text-slate-800">Inventario Avanzado</h2>
        <button
          onClick={() => {
            setSelectedItem(null);
            setForm({
              name: '',
              category: '',
              current_stock: 0,
              min_stock: 10,
              max_stock: 100,
              unit: 'unidad',
              cost_per_unit: 0,
            });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
        >
          <i className="ri-add-line mr-2"></i>
          Nuevo Item
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200">
          <p className="text-xs text-emerald-600 mb-1">Total Items</p>
          <p className="text-2xl font-bold text-emerald-700">{stats.total}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <p className="text-xs text-amber-600 mb-1">Stock Bajo</p>
          <p className="text-2xl font-bold text-amber-700">{stats.lowStock}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-xs text-red-600 mb-1">Sin Stock</p>
          <p className="text-2xl font-bold text-red-700">{stats.outOfStock}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 mb-1">Valor Total</p>
          <p className="text-lg font-bold text-blue-700">
            ${stats.totalValue.toLocaleString('es-AR')}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'Todos' },
          { id: 'low_stock', label: 'Stock Bajo' },
          { id: 'out_of_stock', label: 'Sin Stock' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === f.id
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de Items */}
      <div className="space-y-2">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl">
            <i className="ri-box-3-line text-4xl text-slate-400 mb-3 block"></i>
            <p className="text-slate-500">No hay items en inventario</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const stockPercentage = (item.current_stock / item.max_stock) * 100;
            const isLow = item.current_stock <= item.min_stock;
            const isOut = item.current_stock === 0;
            
            return (
              <div
                key={item.id}
                className={`p-4 rounded-xl border-2 ${
                  isOut
                    ? 'bg-red-50 border-red-200'
                    : isLow
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-slate-800">{item.name}</h3>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                        {item.category}
                      </span>
                      {isOut && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                          SIN STOCK
                        </span>
                      )}
                      {isLow && !isOut && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                          STOCK BAJO
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-slate-600">
                          Stock: <strong className="text-slate-800">{item.current_stock}</strong> {item.unit}
                        </span>
                        <span className="text-slate-500">
                          Mín: {item.min_stock} | Máx: {item.max_stock}
                        </span>
                        <span className="text-slate-600">
                          Costo: <strong>${item.cost_per_unit.toLocaleString('es-AR')}</strong> / {item.unit}
                        </span>
                      </div>
                      
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isOut
                              ? 'bg-red-500'
                              : isLow
                              ? 'bg-amber-500'
                              : stockPercentage > 50
                              ? 'bg-green-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedItem(item);
                        setForm(item);
                        setShowModal(true);
                      }}
                      className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

