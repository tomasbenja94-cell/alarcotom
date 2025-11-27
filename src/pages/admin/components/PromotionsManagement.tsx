import { useState, useEffect } from 'react';

interface Promotion {
  id: string;
  title: string;
  description: string;
  type: 'discount' | '2x1' | 'combo' | 'free_delivery';
  discount_percentage?: number;
  discount_amount?: number;
  min_purchase?: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  product_ids?: string[];
  image_url?: string;
}

export default function PromotionsManagement() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [form, setForm] = useState<Partial<Promotion>>({
    title: '',
    description: '',
    type: 'discount',
    discount_percentage: 0,
    min_purchase: 0,
    is_active: true,
  });

  useEffect(() => {
    loadPromotions();
  }, []);

  const loadPromotions = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/promotions?storeId=${storeId}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPromotions(data || []);
      }
    } catch (error) {
      console.error('Error loading promotions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const url = editingPromotion 
        ? `${API_URL}/promotions/${editingPromotion.id}`
        : `${API_URL}/promotions`;
      
      const response = await fetch(url, {
        method: editingPromotion ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ ...form, store_id: storeId })
      });
      
      if (response.ok) {
        await loadPromotions();
        setShowModal(false);
        setEditingPromotion(null);
        setForm({
          title: '',
          description: '',
          type: 'discount',
          discount_percentage: 0,
          min_purchase: 0,
          is_active: true,
        });
      }
    } catch (error) {
      console.error('Error saving promotion:', error);
      alert('Error al guardar la promoción');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta promoción?')) return;
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`${API_URL}/promotions/${id}`, {
        method: 'DELETE',
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        await loadPromotions();
      }
    } catch (error) {
      console.error('Error deleting promotion:', error);
    }
  };

  const toggleActive = async (promotion: Promotion) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`${API_URL}/promotions/${promotion.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ is_active: !promotion.is_active })
      });
      
      if (response.ok) {
        await loadPromotions();
      }
    } catch (error) {
      console.error('Error toggling promotion:', error);
    }
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
        <h2 className="text-xl font-bold text-slate-800">Gestión de Promociones</h2>
        <button
          onClick={() => {
            setEditingPromotion(null);
            setForm({
              title: '',
              description: '',
              type: 'discount',
              discount_percentage: 0,
              min_purchase: 0,
              is_active: true,
            });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
        >
          <i className="ri-add-line mr-2"></i>
          Nueva Promoción
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-200">
          <p className="text-xs text-orange-600 mb-1">Total</p>
          <p className="text-2xl font-bold text-orange-700">{promotions.length}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-xs text-green-600 mb-1">Activas</p>
          <p className="text-2xl font-bold text-green-700">
            {promotions.filter(p => p.is_active).length}
          </p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 mb-1">Descuentos</p>
          <p className="text-2xl font-bold text-blue-700">
            {promotions.filter(p => p.type === 'discount').length}
          </p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
          <p className="text-xs text-purple-600 mb-1">Combos</p>
          <p className="text-2xl font-bold text-purple-700">
            {promotions.filter(p => p.type === 'combo').length}
          </p>
        </div>
      </div>

      {/* Lista de Promociones */}
      <div className="space-y-3">
        {promotions.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl">
            <i className="ri-fire-line text-4xl text-slate-400 mb-3 block"></i>
            <p className="text-slate-500">No hay promociones creadas</p>
          </div>
        ) : (
          promotions.map((promo) => (
            <div
              key={promo.id}
              className={`p-4 rounded-xl border-2 ${
                promo.is_active
                  ? 'bg-white border-orange-200 shadow-sm'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-bold text-slate-800">{promo.title}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        promo.type === 'discount'
                          ? 'bg-blue-100 text-blue-700'
                          : promo.type === 'combo'
                          ? 'bg-purple-100 text-purple-700'
                          : promo.type === '2x1'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {promo.type === 'discount' && 'Descuento'}
                      {promo.type === 'combo' && 'Combo'}
                      {promo.type === '2x1' && '2x1'}
                      {promo.type === 'free_delivery' && 'Envío Gratis'}
                    </span>
                    {promo.is_active ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        ACTIVA
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-600">
                        INACTIVA
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mb-2">{promo.description}</p>
                  <div className="flex gap-4 text-xs text-slate-500">
                    {promo.discount_percentage && (
                      <span>Descuento: {promo.discount_percentage}%</span>
                    )}
                    {promo.min_purchase && (
                      <span>Mínimo: ${promo.min_purchase.toLocaleString('es-AR')}</span>
                    )}
                    <span>
                      Válida hasta: {new Date(promo.valid_until).toLocaleDateString('es-AR')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleActive(promo)}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                      promo.is_active
                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    {promo.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingPromotion(promo);
                      setForm(promo);
                      setShowModal(true);
                    }}
                    className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(promo.id)}
                    className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingPromotion ? 'Editar Promoción' : 'Nueva Promoción'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Título</label>
                <input
                  type="text"
                  value={form.title || ''}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  placeholder="Ej: Descuento del 20%"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Descripción</label>
                <textarea
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  rows={3}
                  placeholder="Descripción de la promoción"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Tipo</label>
                <select
                  value={form.type || 'discount'}
                  onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="discount">Descuento</option>
                  <option value="2x1">2x1</option>
                  <option value="combo">Combo</option>
                  <option value="free_delivery">Envío Gratis</option>
                </select>
              </div>

              {form.type === 'discount' && (
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Porcentaje de Descuento
                  </label>
                  <input
                    type="number"
                    value={form.discount_percentage || 0}
                    onChange={(e) =>
                      setForm({ ...form, discount_percentage: parseInt(e.target.value) })
                    }
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    min="0"
                    max="100"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Compra Mínima (opcional)
                </label>
                <input
                  type="number"
                  value={form.min_purchase || 0}
                  onChange={(e) =>
                    setForm({ ...form, min_purchase: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Válida Desde</label>
                <input
                  type="date"
                  value={form.valid_from || ''}
                  onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Válida Hasta</label>
                <input
                  type="date"
                  value={form.valid_until || ''}
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active ?? true}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm font-medium">Promoción activa</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingPromotion(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-semibold hover:shadow-lg"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

