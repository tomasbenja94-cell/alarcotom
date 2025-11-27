import { useState, useEffect } from 'react';

interface DeliveryZone {
  id: string;
  name: string;
  description?: string;
  polygon: Array<{ lat: number; lng: number }>;
  delivery_fee: number;
  estimated_time: number;
  is_active: boolean;
}

export default function DeliveryZonesManagement() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [form, setForm] = useState<Partial<DeliveryZone>>({
    name: '',
    description: '',
    delivery_fee: 4000, // Tarifa fija según requerimiento
    estimated_time: 45,
    is_active: true,
  });

  useEffect(() => {
    loadZones();
  }, []);

  const loadZones = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/delivery-zones?storeId=${storeId}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setZones(data || []);
      }
    } catch (error) {
      console.error('Error loading zones:', error);
      // Mock data para desarrollo
      setZones([
        {
          id: '1',
          name: 'Zona Centro',
          description: 'Centro de la ciudad',
          polygon: [],
          delivery_fee: 4000,
          estimated_time: 30,
          is_active: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.name.trim()) {
      alert('El nombre de la zona es requerido');
      return;
    }

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const url = editingZone 
        ? `${API_URL}/delivery-zones/${editingZone.id}`
        : `${API_URL}/delivery-zones`;
      
      const response = await fetch(url, {
        method: editingZone ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ ...form, store_id: storeId, delivery_fee: 4000 })
      });
      
      if (response.ok) {
        await loadZones();
        setShowModal(false);
        setEditingZone(null);
        setForm({
          name: '',
          description: '',
          delivery_fee: 4000,
          estimated_time: 45,
          is_active: true,
        });
      }
    } catch (error) {
      console.error('Error saving zone:', error);
      alert('Error al guardar la zona');
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
        <div>
          <h2 className="text-xl font-bold text-slate-800">Zonas de Delivery</h2>
          <p className="text-sm text-slate-500 mt-1">
            Tarifa fija: $4.000 (independiente de la distancia)
          </p>
        </div>
        <button
          onClick={() => {
            setEditingZone(null);
            setForm({
              name: '',
              description: '',
              delivery_fee: 4000,
              estimated_time: 45,
              is_active: true,
            });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
        >
          <i className="ri-add-line mr-2"></i>
          Nueva Zona
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <i className="ri-information-line text-blue-600 text-xl mt-0.5"></i>
          <div>
            <p className="font-semibold text-blue-800 mb-1">Tarifa de Delivery Fija</p>
            <p className="text-sm text-blue-700">
              Todas las zonas tienen una tarifa fija de <strong>$4.000</strong>, sin importar la distancia.
              Esto garantiza transparencia y simplicidad para los clientes.
            </p>
          </div>
        </div>
      </div>

      {/* Lista de Zonas */}
      <div className="space-y-3">
        {zones.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl">
            <i className="ri-map-pin-range-line text-4xl text-slate-400 mb-3 block"></i>
            <p className="text-slate-500">No hay zonas configuradas</p>
          </div>
        ) : (
          zones.map((zone) => (
            <div
              key={zone.id}
              className={`p-4 rounded-xl border-2 ${
                zone.is_active
                  ? 'bg-white border-blue-200 shadow-sm'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-bold text-slate-800">{zone.name}</h3>
                    {zone.is_active ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        ACTIVA
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-600">
                        INACTIVA
                      </span>
                    )}
                  </div>
                  {zone.description && (
                    <p className="text-sm text-slate-600 mb-2">{zone.description}</p>
                  )}
                  <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <i className="ri-money-dollar-circle-line text-blue-500"></i>
                      <span className="font-bold text-slate-800">
                        Tarifa: ${zone.delivery_fee.toLocaleString('es-AR')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="ri-time-line text-amber-500"></i>
                      <span className="text-slate-600">
                        Tiempo: {zone.estimated_time} min
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingZone(zone);
                      setForm(zone);
                      setShowModal(true);
                    }}
                    className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Editar
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
              {editingZone ? 'Editar Zona' : 'Nueva Zona de Delivery'}
            </h3>
            
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  <strong>Nota:</strong> La tarifa de delivery está fijada en $4.000 para todas las zonas.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Nombre de la Zona</label>
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  placeholder="Ej: Zona Centro"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Descripción (opcional)</label>
                <textarea
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  rows={3}
                  placeholder="Descripción de la zona"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Tiempo Estimado de Entrega (minutos)
                </label>
                <input
                  type="number"
                  value={form.estimated_time || 45}
                  onChange={(e) =>
                    setForm({ ...form, estimated_time: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  min="10"
                  max="120"
                />
              </div>

              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Tarifa de Delivery</span>
                  <span className="text-lg font-bold text-slate-800">
                    $4.000
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Tarifa fija para todas las zonas</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active ?? true}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm font-medium">Zona activa</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingZone(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg font-semibold hover:shadow-lg"
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

