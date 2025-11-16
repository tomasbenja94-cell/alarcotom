import { useState, useEffect } from 'react';

interface PromoCode {
  id?: string;
  code: string;
  type: string;
  value: number;
  description?: string;
  productId?: string;
  levelRestriction?: string[] | null;
  maxTotalUses?: number | null;
  maxUsesPerCustomer: number;
  totalUses: number;
  validFrom: string;
  validUntil: string;
  validHours?: { from: string; to: string } | null;
  isActive: boolean;
}

const CODE_TYPES = [
  { value: 'discount_percent', label: '💰 Descuento %' },
  { value: 'discount_fixed', label: '💵 Descuento Fijo' },
  { value: 'free_product', label: '🎁 Producto Gratis' },
  { value: 'bonus_points', label: '⭐ Puntos Extra' },
  { value: 'level_upgrade', label: '⬆️ Upgrade de Nivel' },
  { value: 'special_gift', label: '🎉 Regalo Especial' }
];

export default function PromoCodeManagement() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null);
  const [formData, setFormData] = useState<PromoCode>({
    code: '',
    type: 'discount_percent',
    value: 10,
    description: '',
    levelRestriction: null,
    maxTotalUses: null,
    maxUsesPerCustomer: 1,
    totalUses: 0,
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    validHours: null,
    isActive: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'https://elbuenmenu.site/api';

  useEffect(() => {
    loadCodes();
  }, []);

  const loadCodes = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/loyalty/promo-codes`);
      if (response.ok) {
        const data = await response.json();
        setCodes(data.codes || []);
      }
    } catch (error) {
      console.error('Error cargando códigos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.code.trim()) {
      alert('El código es requerido');
      return;
    }

    if (formData.value <= 0) {
      alert('El valor debe ser mayor a 0');
      return;
    }

    setIsLoading(true);
    try {
      const url = editingCode 
        ? `${API_URL}/api/loyalty/promo-codes/${editingCode.id}`
        : `${API_URL}/api/loyalty/promo-codes`;
      
      const method = editingCode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await loadCodes();
        setShowModal(false);
        setEditingCode(null);
        setFormData({
          code: '',
          type: 'discount_percent',
          value: 10,
          description: '',
          levelRestriction: null,
          maxTotalUses: null,
          maxUsesPerCustomer: 1,
          totalUses: 0,
          validFrom: new Date().toISOString().split('T')[0],
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          validHours: null,
          isActive: true
        });
        alert(`✅ Código ${editingCode ? 'actualizado' : 'creado'} exitosamente`);
      } else {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        alert(`❌ Error: ${error.error || 'Error al guardar código'}`);
      }
    } catch (error: any) {
      console.error('Error guardando código:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (codeId: string) => {
    if (!confirm('¿Eliminar este código promocional?')) return;

    try {
      const response = await fetch(`${API_URL}/api/loyalty/promo-codes/${codeId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadCodes();
        alert('✅ Código eliminado exitosamente');
      } else {
        alert('❌ Error al eliminar código');
      }
    } catch (error: any) {
      console.error('Error eliminando código:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    }
  };

  const toggleActive = async (code: PromoCode) => {
    try {
      const response = await fetch(`${API_URL}/api/loyalty/promo-codes/${code.id}/active`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !code.isActive })
      });

      if (response.ok) {
        await loadCodes();
      } else {
        alert('❌ Error al cambiar estado del código');
      }
    } catch (error: any) {
      console.error('Error cambiando estado:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    }
  };

  const activeCodes = codes.filter(c => c.isActive).length;
  const expiredCodes = codes.filter(c => new Date(c.validUntil) < new Date()).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">🎟️ CÓDIGOS PROMOCIONALES</h2>
            <p className="text-sm text-[#C7C7C7]">Crea y gestiona códigos promocionales para clientes</p>
          </div>
          <button
            onClick={() => {
              setEditingCode(null);
              setFormData({
                code: '',
                type: 'discount_percent',
                value: 10,
                description: '',
                levelRestriction: null,
                maxTotalUses: null,
                maxUsesPerCustomer: 1,
                totalUses: 0,
                validFrom: new Date().toISOString().split('T')[0],
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                validHours: null,
                isActive: true
              });
              setShowModal(true);
            }}
            className="px-4 py-2 bg-[#111111] text-white border border-[#FFC300] rounded-sm hover:bg-[#1A1A1A] transition-all text-sm font-medium"
          >
            ➕ Crear Código
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
          <p className="text-sm text-[#C7C7C7] mb-1">Total de códigos</p>
          <p className="text-2xl font-bold text-[#111111]">{codes.length}</p>
        </div>
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
          <p className="text-sm text-[#C7C7C7] mb-1">Códigos activos</p>
          <p className="text-2xl font-bold text-[#111111]">{activeCodes}</p>
        </div>
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
          <p className="text-sm text-[#C7C7C7] mb-1">Códigos expirados</p>
          <p className="text-2xl font-bold text-[#111111]">{expiredCodes}</p>
        </div>
      </div>

      {/* Lista de códigos */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm">
        <div className="p-4 border-b border-[#C7C7C7]">
          <h3 className="text-lg font-bold text-[#111111]">Códigos Promocionales</h3>
        </div>
        <div className="divide-y divide-[#C7C7C7]">
          {isLoading ? (
            <div className="p-8 text-center text-[#C7C7C7]">Cargando...</div>
          ) : codes.length === 0 ? (
            <div className="p-8 text-center text-[#C7C7C7]">No hay códigos promocionales</div>
          ) : (
            codes.map((code) => {
              const typeConfig = CODE_TYPES.find(t => t.value === code.type);
              const isExpired = new Date(code.validUntil) < new Date();
              const isActiveNow = code.isActive && !isExpired && 
                new Date(code.validFrom) <= new Date() &&
                (!code.maxTotalUses || code.totalUses < code.maxTotalUses);

              return (
                <div key={code.id || Math.random()} className={`p-4 hover:bg-[#F9F9F9] transition-colors ${!code.isActive || isExpired ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-2xl font-mono font-bold text-[#111111] bg-[#FFC300] px-3 py-1 rounded-sm">
                          {code.code}
                        </span>
                        <span className="px-2 py-1 bg-[#111111] text-white rounded text-xs font-bold">
                          {typeConfig?.label || code.type}
                        </span>
                        {code.type === 'discount_percent' && (
                          <span className="text-sm font-bold text-[#111111]">-{code.value}% OFF</span>
                        )}
                        {code.type === 'discount_fixed' && (
                          <span className="text-sm font-bold text-[#111111]">-${code.value} OFF</span>
                        )}
                        {code.type === 'bonus_points' && (
                          <span className="text-sm font-bold text-[#111111]">+{code.value} puntos</span>
                        )}
                        {isExpired && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">
                            ⏰ Expirado
                          </span>
                        )}
                        {isActiveNow && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                            ✅ Activo
                          </span>
                        )}
                      </div>
                      {code.description && (
                        <p className="text-sm text-[#111111] mb-2">{code.description}</p>
                      )}
                      <div className="grid grid-cols-4 gap-4 text-xs text-[#C7C7C7]">
                        <div>
                          <p>Usos: {code.totalUses} {code.maxTotalUses ? `/ ${code.maxTotalUses}` : ''}</p>
                        </div>
                        <div>
                          <p>Por cliente: {code.maxUsesPerCustomer}</p>
                        </div>
                        <div>
                          <p>Válido desde: {new Date(code.validFrom).toLocaleDateString('es-AR')}</p>
                        </div>
                        <div>
                          <p>Válido hasta: {new Date(code.validUntil).toLocaleDateString('es-AR')}</p>
                        </div>
                      </div>
                      {code.levelRestriction && code.levelRestriction.length > 0 && (
                        <p className="text-xs text-[#C7C7C7] mt-2">
                          Solo para: {code.levelRestriction.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col space-y-2 ml-4">
                      <button
                        onClick={() => {
                          setEditingCode(code);
                          setFormData({
                            ...code,
                            validFrom: code.validFrom.split('T')[0],
                            validUntil: code.validUntil.split('T')[0]
                          });
                          setShowModal(true);
                        }}
                        className="px-3 py-1 text-xs bg-white text-[#111111] border border-[#C7C7C7] rounded-sm hover:bg-[#F9F9F9] transition-all"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => toggleActive(code)}
                        className={`px-3 py-1 text-xs rounded-sm transition-all ${
                          code.isActive
                            ? 'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                        }`}
                      >
                        {code.isActive ? '⛔ Desactivar' : '✅ Activar'}
                      </button>
                      <button
                        onClick={() => code.id && handleDelete(code.id)}
                        className="px-3 py-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded-sm hover:bg-red-200 transition-all"
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal para crear/editar código */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-6 w-full max-w-2xl border border-[#FFC300] max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-[#111111] mb-4">
              {editingCode ? '✏️ Editar Código' : '➕ Crear Nuevo Código'}
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[#111111] font-medium mb-1 block">
                    Código *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="NAVIDAD2025"
                    className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-sm text-[#111111] font-medium mb-1 block">
                    Tipo *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                  >
                    {CODE_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-[#111111] font-medium mb-1 block">
                  Valor * ({formData.type === 'discount_percent' ? '%' : formData.type === 'discount_fixed' ? '$' : 'puntos/unidades'})
                </label>
                <input
                  type="number"
                  min="0"
                  step={formData.type.includes('percent') ? '1' : '0.01'}
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                />
              </div>

              <div>
                <label className="text-sm text-[#111111] font-medium mb-1 block">
                  Descripción
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción del código promocional"
                  rows={2}
                  className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[#111111] font-medium mb-1 block">
                    Válido desde *
                  </label>
                  <input
                    type="date"
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                    className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                  />
                </div>

                <div>
                  <label className="text-sm text-[#111111] font-medium mb-1 block">
                    Válido hasta *
                  </label>
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[#111111] font-medium mb-1 block">
                    Límite total de usos (opcional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.maxTotalUses || ''}
                    onChange={(e) => setFormData({ ...formData, maxTotalUses: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Sin límite"
                    className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                  />
                </div>

                <div>
                  <label className="text-sm text-[#111111] font-medium mb-1 block">
                    Máximo por cliente *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxUsesPerCustomer}
                    onChange={(e) => setFormData({ ...formData, maxUsesPerCustomer: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-[#111111] font-medium mb-1 block">
                  Restricción de nivel (opcional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {['bronze', 'silver', 'gold', 'vip'].map(level => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => {
                        const current = formData.levelRestriction || [];
                        const newRestriction = current.includes(level)
                          ? current.filter(l => l !== level)
                          : [...current, level];
                        setFormData({ ...formData, levelRestriction: newRestriction.length > 0 ? newRestriction : null });
                      }}
                      className={`px-3 py-1 rounded text-xs font-medium transition-all border ${
                        formData.levelRestriction?.includes(level)
                          ? 'bg-[#111111] text-white border-[#FFC300]'
                          : 'bg-white text-[#111111] border-[#C7C7C7] hover:border-[#FFC300]'
                      }`}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, levelRestriction: null })}
                    className="px-3 py-1 rounded text-xs font-medium bg-white text-[#111111] border border-[#C7C7C7] hover:border-[#FFC300] transition-all"
                  >
                    Todos
                  </button>
                </div>
                <p className="text-xs text-[#C7C7C7] mt-1">
                  {formData.levelRestriction && formData.levelRestriction.length > 0
                    ? `Solo para: ${formData.levelRestriction.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')}`
                    : 'Disponible para todos los niveles'}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 border-[#C7C7C7] rounded focus:ring-[#FFC300]"
                />
                <label htmlFor="isActive" className="text-sm text-[#111111]">
                  Código activo
                </label>
              </div>
            </div>

            <div className="flex space-x-4 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingCode(null);
                }}
                className="flex-1 bg-[#F9F9F9] hover:bg-[#E9E9E9] text-[#111111] font-medium py-2 rounded-sm transition-all border border-[#C7C7C7]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading || !formData.code.trim() || formData.value <= 0}
                className="flex-1 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium py-2 rounded-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-[#111111]"
              >
                {isLoading ? 'Guardando...' : editingCode ? 'Actualizar' : 'Crear Código'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

