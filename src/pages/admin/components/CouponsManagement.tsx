import { useState, useEffect } from 'react';

interface Coupon {
  id: string;
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_purchase?: number;
  max_discount?: number;
  valid_from: string;
  valid_until: string;
  usage_limit?: number;
  usage_count: number;
  is_active: boolean;
}

export default function CouponsManagement() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<Partial<Coupon>>({
    code: '',
    description: '',
    discount_type: 'percentage',
    discount_value: 0,
    is_active: true,
  });

  useEffect(() => {
    loadCoupons();
  }, []);

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setForm({ ...form, code });
  };

  const loadCoupons = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/coupons?storeId=${storeId}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCoupons(data || []);
      }
    } catch (error) {
      console.error('Error loading coupons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.code || !form.code.trim()) {
      alert('El código del cupón es requerido');
      return;
    }

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const url = editingCoupon 
        ? `${API_URL}/coupons/${editingCoupon.id}`
        : `${API_URL}/coupons`;
      
      const response = await fetch(url, {
        method: editingCoupon ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ ...form, store_id: storeId })
      });
      
      if (response.ok) {
        await loadCoupons();
        setShowModal(false);
        setEditingCoupon(null);
        setForm({
          code: '',
          description: '',
          discount_type: 'percentage',
          discount_value: 0,
          is_active: true,
        });
      } else {
        const error = await response.json();
        alert(error.error || 'Error al guardar el cupón');
      }
    } catch (error) {
      console.error('Error saving coupon:', error);
      alert('Error al guardar el cupón');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este cupón?')) return;
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`${API_URL}/coupons/${id}`, {
        method: 'DELETE',
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        await loadCoupons();
      }
    } catch (error) {
      console.error('Error deleting coupon:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  const activeCoupons = coupons.filter(c => c.is_active);
  const expiredCoupons = coupons.filter(c => new Date(c.valid_until) < new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Gestión de Cupones</h2>
        <button
          onClick={() => {
            setEditingCoupon(null);
            setForm({
              code: '',
              description: '',
              discount_type: 'percentage',
              discount_value: 0,
              is_active: true,
            });
            generateCode();
            setShowModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
        >
          <i className="ri-add-line mr-2"></i>
          Nuevo Cupón
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
          <p className="text-xs text-amber-600 mb-1">Total</p>
          <p className="text-2xl font-bold text-amber-700">{coupons.length}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-xs text-green-600 mb-1">Activos</p>
          <p className="text-2xl font-bold text-green-700">{activeCoupons.length}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 mb-1">Usados</p>
          <p className="text-2xl font-bold text-blue-700">
            {coupons.reduce((sum, c) => sum + (c.usage_count || 0), 0)}
          </p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-xs text-red-600 mb-1">Vencidos</p>
          <p className="text-2xl font-bold text-red-700">{expiredCoupons.length}</p>
        </div>
      </div>

      {/* Lista de Cupones */}
      <div className="space-y-3">
        {coupons.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl">
            <i className="ri-coupon-3-line text-4xl text-slate-400 mb-3 block"></i>
            <p className="text-slate-500">No hay cupones creados</p>
          </div>
        ) : (
          coupons.map((coupon) => {
            const isExpired = new Date(coupon.valid_until) < new Date();
            const isUsedUp = coupon.usage_limit && coupon.usage_count >= coupon.usage_limit;
            
            return (
              <div
                key={coupon.id}
                className={`p-4 rounded-xl border-2 ${
                  !coupon.is_active || isExpired || isUsedUp
                    ? 'bg-slate-50 border-slate-200 opacity-60'
                    : 'bg-white border-amber-200 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-black text-xl text-amber-600">{coupon.code}</h3>
                      {coupon.is_active && !isExpired && !isUsedUp ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                          ACTIVO
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-600">
                          {isExpired ? 'VENCIDO' : isUsedUp ? 'AGOTADO' : 'INACTIVO'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{coupon.description}</p>
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span className="font-bold text-amber-600">
                        {coupon.discount_type === 'percentage'
                          ? `${coupon.discount_value}% OFF`
                          : `$${coupon.discount_value.toLocaleString('es-AR')} OFF`}
                      </span>
                      {coupon.min_purchase && (
                        <span>Mín: ${coupon.min_purchase.toLocaleString('es-AR')}</span>
                      )}
                      <span>
                        Usado: {coupon.usage_count || 0}
                        {coupon.usage_limit && ` / ${coupon.usage_limit}`}
                      </span>
                      <span>
                        Válido hasta: {new Date(coupon.valid_until).toLocaleDateString('es-AR')}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingCoupon(coupon);
                        setForm(coupon);
                        setShowModal(true);
                      }}
                      className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(coupon.id)}
                      className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingCoupon ? 'Editar Cupón' : 'Nuevo Cupón'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Código</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.code || ''}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg font-bold text-lg"
                    placeholder="CÓDIGO123"
                    maxLength={20}
                  />
                  {!editingCoupon && (
                    <button
                      onClick={generateCode}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium"
                      title="Generar código aleatorio"
                    >
                      <i className="ri-refresh-line"></i>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Descripción</label>
                <input
                  type="text"
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  placeholder="Ej: Descuento del 15% en tu primera compra"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Tipo de Descuento</label>
                <select
                  value={form.discount_type || 'percentage'}
                  onChange={(e) => setForm({ ...form, discount_type: e.target.value as any })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="percentage">Porcentaje (%)</option>
                  <option value="fixed">Monto Fijo ($)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Valor del Descuento
                  {form.discount_type === 'percentage' ? ' (%)' : ' ($)'}
                </label>
                <input
                  type="number"
                  value={form.discount_value || 0}
                  onChange={(e) =>
                    setForm({ ...form, discount_value: parseFloat(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  min="0"
                  max={form.discount_type === 'percentage' ? 100 : undefined}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Compra Mínima (opcional)
                </label>
                <input
                  type="number"
                  value={form.min_purchase || ''}
                  onChange={(e) =>
                    setForm({ ...form, min_purchase: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Límite de Usos (opcional)
                </label>
                <input
                  type="number"
                  value={form.usage_limit || ''}
                  onChange={(e) =>
                    setForm({ ...form, usage_limit: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Válido Desde</label>
                <input
                  type="date"
                  value={form.valid_from || ''}
                  onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Válido Hasta</label>
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
                <label className="text-sm font-medium">Cupón activo</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingCoupon(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-semibold hover:shadow-lg"
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

