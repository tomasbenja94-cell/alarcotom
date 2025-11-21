import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

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
        purchase_price: parseFloat(form.purchase_price),
        current_stock: parseFloat(form.current_stock),
        min_stock: parseFloat(form.min_stock)
      };

      if (editingIngredient) {
        // Actualizar insumo en Supabase
        const { data, error } = await supabase
          .from('ingredients')
          .update(ingredientData)
          .eq('id', editingIngredient.id)
          .select()
          .single();

        if (error) {
          // Si la tabla no existe, mostrar instrucciones
          if (error.code === 'PGRST116' || error.code === 'PGRST205' || error.message?.includes('does not exist')) {
            setTableExists(false);
            setShowModal(false);
            return; // El banner mostrará las instrucciones
          }
          throw error;
        }

        setTableExists(true);
        // Actualizar localmente
        setIngredients(ingredients.map(ing => ing.id === editingIngredient.id ? data : ing));
        alert('✅ Insumo actualizado correctamente');
      } else {
        // Crear nuevo insumo en Supabase
        const { data, error } = await supabase
          .from('ingredients')
          .insert([ingredientData])
          .select()
          .single();

        if (error) {
          // Si la tabla no existe, mostrar instrucciones
          if (error.code === 'PGRST116' || error.code === 'PGRST205' || error.message?.includes('does not exist')) {
            setTableExists(false);
            setShowModal(false);
            return; // El banner mostrará las instrucciones
          }
          throw error;
        }

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
      // Solo mostrar error si no es por tabla no existente
      if (error.code !== 'PGRST116' && error.code !== 'PGRST205' && !error.message?.includes('does not exist')) {
        console.error('Error guardando insumo:', error);
        alert('Error al guardar el insumo: ' + (error.message || 'Error desconocido'));
      } else {
        setTableExists(false);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este insumo?')) {
      return;
    }

    try {
      // Eliminar insumo de Supabase
      const { error } = await supabase
        .from('ingredients')
        .delete()
        .eq('id', id);

      if (error) {
        // Si la tabla no existe, mostrar instrucciones
        if (error.code === 'PGRST116' || error.code === 'PGRST205' || error.message?.includes('does not exist')) {
          setTableExists(false);
          return;
        }
        throw error;
      }

      setTableExists(true);
      // Eliminar localmente
      setIngredients(ingredients.filter(ing => ing.id !== id));
      alert('✅ Insumo eliminado correctamente');
    } catch (error: any) {
      // Solo mostrar error si no es por tabla no existente
      if (error.code !== 'PGRST116' && error.code !== 'PGRST205' && !error.message?.includes('does not exist')) {
        console.error('Error eliminando insumo:', error);
        alert('Error al eliminar el insumo: ' + (error.message || 'Error desconocido'));
      } else {
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
    <div className="space-y-6">
      {/* Header - Premium Style */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">STOCK & INSUMOS</h2>
            <p className="text-sm text-[#C7C7C7]">Gestiona los productos crudos y materiales que compras</p>
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
            className="px-4 py-2 text-sm font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
          >
            + Agregar Insumo
          </button>
        </div>
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

      {/* Lista de insumos - Solo mostrar si la tabla existe */}
      {tableExists !== false && (
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-[#111111]">TUS INSUMOS</h3>
            <input
              type="text"
              placeholder="🔍 Buscar insumo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111] w-64"
            />
          </div>

          {filteredIngredients.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📦</div>
              <p className="text-sm text-[#C7C7C7] font-medium">
                {searchTerm ? 'No se encontraron insumos' : 'No hay insumos registrados. Agrega el primero.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIngredients.map((ing) => (
                <div 
                  key={ing.id} 
                  className={`bg-white border rounded-sm shadow-sm p-5 hover:border-[#FFC300] transition-all ${
                    ing.current_stock <= ing.min_stock ? 'border-2 border-[#FFC300]' : 'border-[#C7C7C7]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-base text-[#111111] mb-1">{ing.name}</h3>
                      <div className="text-xs text-[#C7C7C7] mb-2">{getUnitLabel(ing.unit)}</div>
                      {ing.current_stock <= ing.min_stock && (
                        <div className="inline-block px-2 py-1 bg-[#FFF9E6] border border-[#FFC300] rounded-sm text-xs font-medium text-[#111111] mb-2">
                          ⚠️ Stock bajo
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
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
                        className="px-3 py-1 text-xs font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(ing.id)}
                        className="px-3 py-1 text-xs font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-3 border-t border-[#C7C7C7]">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#C7C7C7]">Precio de compra:</span>
                      <span className="font-medium text-[#111111]">{formatCurrency(ing.purchase_price)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#C7C7C7]">Stock actual:</span>
                      <span className={`font-bold ${
                        ing.current_stock <= ing.min_stock ? 'text-[#111111]' : 'text-[#111111]'
                      }`}>
                        {ing.current_stock} {ing.unit}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#C7C7C7]">Stock mínimo:</span>
                      <span className="font-medium text-[#111111]">{ing.min_stock} {ing.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Agregar/Editar Insumo - SIMPLE */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-8 w-full max-w-md border border-[#FFC300]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#111111]">
                {editingIngredient ? 'Editar Insumo' : 'Agregar Nuevo Insumo'}
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
                className="text-[#C7C7C7] hover:text-[#111111] text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                  Nombre del Insumo
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Milanesa cruda, Queso, Pan..."
                  className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                  Unidad de Medida
                </label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value as any })}
                  className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                >
                  <option value="kg">Kilogramos (kg)</option>
                  <option value="unidad">Unidades</option>
                  <option value="litro">Litros (L)</option>
                  <option value="g">Gramos (g)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                  Precio de Compra
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.purchase_price}
                  onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                  placeholder="Ej: 5000"
                  className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  required
                />
                <p className="text-xs text-[#C7C7C7] mt-1">Precio al que compras este insumo</p>
              </div>

              <div>
                <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                  Stock Inicial
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.current_stock}
                  onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                  placeholder="Ej: 10"
                  className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  required
                />
                <p className="text-xs text-[#C7C7C7] mt-1">Cantidad que tienes ahora</p>
              </div>

              <div>
                <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                  Stock Mínimo
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.min_stock}
                  onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                  placeholder="Ej: 5"
                  className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  required
                />
                <p className="text-xs text-[#C7C7C7] mt-1">Cantidad mínima antes de comprar más</p>
              </div>

              <div className="flex space-x-3 pt-4 border-t border-[#C7C7C7]">
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
                  className="flex-1 px-4 py-2 bg-white hover:bg-[#F9F9F9] text-[#111111] font-medium rounded-sm transition-all border border-[#C7C7C7]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium rounded-sm transition-all border border-[#111111]"
                >
                  {editingIngredient ? 'Actualizar' : 'Agregar'} Insumo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
