import { useState, useEffect } from 'react';
import { ingredientsApi } from '../../../lib/api';

interface Ingredient {
  id: string;
  name: string;
  unit: 'kg' | 'unidad' | 'litro' | 'g';
  purchase_price: number;
  current_stock: number;
  min_stock: number;
  created_at: string;
}

export default function StockManagement() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tableExists, setTableExists] = useState<boolean | null>(null);

  // Estados para formulario simple
  const [showModal, setShowModal] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [form, setForm] = useState({
    name: '',
    unit: 'kg' as 'kg' | 'unidad' | 'litro' | 'g',
    purchase_price: '',
    current_stock: '',
    min_stock: ''
  });
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [selectedIngredientForStock, setSelectedIngredientForStock] = useState<Ingredient | null>(null);
  const [stockToAdd, setStockToAdd] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Intentar cargar desde la API del backend (si existe)
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const endpoint = API_URL.endsWith('/api') ? `${API_URL}/ingredients` : `${API_URL}/api/ingredients`;
      const response = await fetch(endpoint);
      
      // Verificar si la respuesta es HTML
      const responseText = await response.text();
      if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.warn('⚠️ [StockManagement] El servidor devolvió HTML para /ingredients, usando datos vacíos');
        setTableExists(false);
        setIngredients([]);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        // Si el endpoint no existe (404), usar datos vacíos sin mostrar error
        if (response.status === 404) {
          setTableExists(false);
          setIngredients([]);
          return;
        }
        // Silenciar otros errores también
        setTableExists(false);
        setIngredients([]);
        return;
      }

      try {
        const data = JSON.parse(responseText);
        setTableExists(true);
        setIngredients(data || []);
      } catch (parseError) {
        console.error('Error al parsear ingredients:', parseError);
        setTableExists(false);
        setIngredients([]);
      }
    } catch (error: any) {
      // Silenciar errores - la tabla puede no existir
      setTableExists(false);
      setIngredients([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar campos
    if (!form.name || !form.purchase_price || !form.current_stock || !form.min_stock) {
      alert('Por favor completa todos los campos');
      return;
    }

    try {
      const ingredientData = {
        name: form.name.trim(),
        unit: form.unit,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : 0,
        current_stock: parseFloat(form.current_stock),
        min_stock: parseFloat(form.min_stock)
      };

      if (editingIngredient) {
        // Actualizar insumo usando API del backend
        const data = await ingredientsApi.update(editingIngredient.id, ingredientData);
        setTableExists(true);
        // Actualizar localmente
        setIngredients(ingredients.map(ing => ing.id === editingIngredient.id ? data : ing));
        alert('✅ Insumo actualizado correctamente');
      } else {
        // Crear nuevo insumo usando API del backend
        const data = await ingredientsApi.create(ingredientData);
        setTableExists(true);
        // Agregar localmente
        setIngredients([...ingredients, data]);
        alert('✅ Insumo creado correctamente');
      }

      // Limpiar formulario
      setShowModal(false);
      setEditingIngredient(null);
      setForm({
        name: '',
        unit: 'kg',
        purchase_price: '',
        current_stock: '',
        min_stock: ''
      });
    } catch (error: any) {
      console.error('Error guardando insumo:', error);
      const errorMessage = error.message || error.details?.message || 'Error desconocido';
      alert('Error al guardar el insumo: ' + errorMessage);
      
      // Si el error indica que la tabla no existe, actualizar el estado
      if (errorMessage.includes('does not exist') || errorMessage.includes('TABLA') || error.status === 500) {
        setTableExists(false);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este insumo?')) {
      return;
    }

    try {
      // Eliminar insumo usando API del backend
      await ingredientsApi.delete(id);
      setTableExists(true);
      // Eliminar localmente
      setIngredients(ingredients.filter(ing => ing.id !== id));
      alert('✅ Insumo eliminado correctamente');
    } catch (error: any) {
      console.error('Error eliminando insumo:', error);
      const errorMessage = error.message || error.details?.message || 'Error desconocido';
      alert('Error al eliminar el insumo: ' + errorMessage);
      
      // Si el error indica que la tabla no existe, actualizar el estado
      if (errorMessage.includes('does not exist') || errorMessage.includes('TABLA') || error.status === 500) {
        setTableExists(false);
      }
    }
  };

  const filteredIngredients = ingredients.filter(ing => 
    ing.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockIngredients = filteredIngredients.filter(ing => 
    ing.current_stock <= ing.min_stock
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getUnitLabel = (unit: string) => {
    const labels: Record<string, string> = {
      kg: 'Kilogramos',
      unidad: 'Unidades',
      litro: 'Litros',
      g: 'Gramos'
    };
    return labels[unit] || unit;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#C7C7C7] border-t-[#111111] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#C7C7C7] font-medium">Cargando insumos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header - Diseño Moderno */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Insumos</h2>
          <p className="text-sm text-gray-500">Gestiona los productos crudos y materiales que compras</p>
        </div>
        <button
          onClick={() => {
            setShowModal(true);
            setEditingIngredient(null);
            setForm({
              name: '',
              unit: 'kg',
              purchase_price: '',
              current_stock: '',
              min_stock: ''
            });
          }}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          <span>Agregar Insumo</span>
        </button>
      </div>

      {/* Buscador siempre visible */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
        <input
          type="text"
          placeholder="🔍 Buscar insumo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base text-gray-900 placeholder-gray-400"
        />
      </div>

      {/* Alerta: Tabla no existe */}
      {tableExists === false && (
        <div className="bg-white border-2 border-[#FFC300] rounded-sm shadow-sm p-6">
          <div className="flex items-start space-x-4">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h3 className="text-base font-bold text-[#111111] mb-2">TABLA DE INSUMOS NO EXISTE</h3>
              <p className="text-sm text-[#111111] mb-4">
                Necesitas crear la tabla <code className="bg-[#F9F9F9] px-2 py-1 rounded text-xs border border-[#C7C7C7]">ingredients</code> en Supabase primero.
              </p>
              <div className="bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm p-4 mb-4">
                <p className="text-xs text-[#C7C7C7] uppercase tracking-wider mb-2">SQL para crear la tabla:</p>
                <pre className="text-xs text-[#111111] overflow-x-auto whitespace-pre-wrap font-mono">
{`CREATE TABLE IF NOT EXISTS ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit TEXT NOT NULL CHECK (unit IN ('kg', 'unidad', 'litro', 'g')),
    purchase_price DECIMAL(10, 2) NOT NULL,
    current_stock DECIMAL(10, 2) NOT NULL DEFAULT 0,
    min_stock DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`}
                </pre>
              </div>
              <div className="flex items-center space-x-2 text-xs text-[#C7C7C7]">
                <span>📝</span>
                <span>Ve a Supabase → SQL Editor → Pega este código → Run</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alerta de stock bajo */}
      {tableExists === true && lowStockIngredients.length > 0 && (
        <div className="bg-white border-2 border-[#FFC300] rounded-sm shadow-sm p-4">
          <div className="flex items-center space-x-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h3 className="text-sm font-bold text-[#111111] mb-1">STOCK BAJO</h3>
              <p className="text-xs text-[#C7C7C7]">
                {lowStockIngredients.length} insumo{lowStockIngredients.length > 1 ? 's' : ''} por debajo del mínimo
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Lista de insumos - Cards Modernas */}
      {tableExists !== false && (
        <div>
          {filteredIngredients.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-lg p-16 text-center">
              <div className="text-6xl mb-4">📦</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm ? 'No se encontraron insumos' : 'No hay insumos'}
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                {searchTerm ? 'Intenta con otro término de búsqueda' : 'Comienza agregando tu primer insumo'}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => {
                    setShowModal(true);
                    setEditingIngredient(null);
                    setForm({
                      name: '',
                      unit: 'kg',
                      purchase_price: '',
                      current_stock: '',
                      min_stock: ''
                    });
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all"
                >
                  + Crear Primer Insumo
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredIngredients.map((ing) => (
                <div 
                  key={ing.id} 
                  className={`bg-white border rounded-lg shadow-sm p-6 hover:shadow-md transition-all ${
                    ing.current_stock <= ing.min_stock ? 'border-2 border-yellow-400 bg-yellow-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 mb-1">{ing.name}</h3>
                      <p className="text-sm text-gray-500 mb-2">{getUnitLabel(ing.unit)}</p>
                      {ing.current_stock <= ing.min_stock && (
                        <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-full text-xs font-semibold">
                          ⚠️ Stock bajo
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-3 pt-4 border-t border-gray-100 mb-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Precio de compra:</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(ing.purchase_price)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-gray-600 block mb-1">Stock actual:</span>
                        <span className={`font-bold text-lg ${
                          ing.current_stock <= ing.min_stock ? 'text-yellow-700' : 'text-gray-900'
                        }`}>
                          {ing.current_stock} {ing.unit}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedIngredientForStock(ing);
                          setStockToAdd('');
                          setShowAddStockModal(true);
                        }}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-all"
                      >
                        + Agregar stock
                      </button>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Stock mínimo:</span>
                      <span className="font-medium text-gray-700">{ing.min_stock} {ing.unit}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => {
                        setEditingIngredient(ing);
                        setForm({
                          name: ing.name,
                          unit: ing.unit,
                          purchase_price: ing.purchase_price.toString(),
                          current_stock: ing.current_stock.toString(),
                          min_stock: ing.min_stock.toString()
                        });
                        setShowModal(true);
                      }}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all text-sm"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleDelete(ing.id)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-all text-sm"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Agregar/Editar Insumo - Diseño Moderno */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900">
                {editingIngredient ? 'Editar Insumo' : 'Agregar Insumo'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingIngredient(null);
                  setForm({
                    name: '',
                    unit: 'kg',
                    purchase_price: '',
                    current_stock: '',
                    min_stock: ''
                  });
                }}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Nombre del Insumo
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Milanesa cruda, Queso, Pan..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Unidad de Medida
                </label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value as any })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base text-gray-900"
                >
                  <option value="kg">Kilogramos (kg)</option>
                  <option value="unidad">Unidades</option>
                  <option value="litro">Litros (L)</option>
                  <option value="g">Gramos (g)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Precio de Compra (opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.purchase_price}
                  onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                  placeholder="Ej: 5000"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base text-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">Precio al que compras este insumo</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Stock Inicial
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.current_stock}
                  onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                  placeholder="Ej: 10"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base text-gray-900"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Cantidad que tienes ahora</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Stock Mínimo
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.min_stock}
                  onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                  placeholder="Ej: 5"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base text-gray-900"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Cantidad mínima antes de comprar más</p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingIngredient(null);
                    setForm({
                      name: '',
                      unit: 'kg',
                      purchase_price: '',
                      current_stock: '',
                      min_stock: ''
                    });
                  }}
                  className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all"
                >
                  {editingIngredient ? 'Actualizar' : 'Guardar'} Insumo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Agregar Stock - Responsive */}
      {showAddStockModal && selectedIngredientForStock && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                Agregar Stock
              </h3>
              <button
                onClick={() => {
                  setShowAddStockModal(false);
                  setSelectedIngredientForStock(null);
                  setStockToAdd('');
                }}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                <strong>{selectedIngredientForStock.name}</strong>
              </p>
              <p className="text-sm text-gray-500">
                Stock actual: <strong>{selectedIngredientForStock.current_stock} {selectedIngredientForStock.unit}</strong>
              </p>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!stockToAdd || parseFloat(stockToAdd) <= 0) {
                alert('Ingresa una cantidad válida');
                return;
              }

              try {
                const newStock = selectedIngredientForStock.current_stock + parseFloat(stockToAdd);
                await ingredientsApi.update(selectedIngredientForStock.id, {
                  name: selectedIngredientForStock.name,
                  unit: selectedIngredientForStock.unit,
                  purchase_price: selectedIngredientForStock.purchase_price,
                  current_stock: newStock,
                  min_stock: selectedIngredientForStock.min_stock
                });
                
                alert(`✅ Stock actualizado. Nuevo stock: ${newStock} ${selectedIngredientForStock.unit}`);
                setShowAddStockModal(false);
                setSelectedIngredientForStock(null);
                setStockToAdd('');
                loadData();
              } catch (error: any) {
                console.error('Error agregando stock:', error);
                alert('Error al agregar stock: ' + (error.message || 'Error desconocido'));
              }
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Cantidad a agregar ({selectedIngredientForStock.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={stockToAdd}
                  onChange={(e) => setStockToAdd(e.target.value)}
                  placeholder="Ej: 5"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base text-gray-900"
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddStockModal(false);
                    setSelectedIngredientForStock(null);
                    setStockToAdd('');
                  }}
                  className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all"
                >
                  Agregar Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
