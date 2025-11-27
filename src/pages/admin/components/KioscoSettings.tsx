import { useState, useEffect } from 'react';
import { storesApi } from '../../../lib/api';
import { useToast } from '../../../hooks/useToast';

interface KioscoSettingsProps {
  storeId: string | null;
}

export default function KioscoSettings({ storeId }: KioscoSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeData, setStoreData] = useState({
    name: '',
    hours: '',
    is_active: true,
    description: ''
  });
  const { error: showError, success: showSuccess } = useToast();

  useEffect(() => {
    if (storeId) {
      loadStoreData();
    }
  }, [storeId]);

  const loadStoreData = async () => {
    try {
      setLoading(true);
      const data = await storesApi.getById(storeId!);
      setStoreData({
        name: data.name || '',
        hours: data.hours || '',
        is_active: data.is_active !== false,
        description: data.description || ''
      });
    } catch (error) {
      console.error('Error loading store data:', error);
      showError('Error al cargar datos del local');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!storeData.name.trim()) {
      showError('El nombre es requerido');
      return;
    }

    try {
      setSaving(true);
      await storesApi.update(storeId!, {
        name: storeData.name.trim(),
        hours: storeData.hours.trim() || null,
        description: storeData.description.trim() || null,
        is_active: storeData.is_active
      });
      showSuccess('Configuración guardada');
    } catch (error: any) {
      showError(error.message || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FFD523]/20 border-t-[#FFD523]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Configuración del Local</h2>
        <p className="text-sm text-gray-500 mt-1">Ajusta la información básica de tu kiosco</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Local *</label>
          <input
            type="text"
            value={storeData.name}
            onChange={(e) => setStoreData({ ...storeData, name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FFD523] focus:border-[#FFD523]"
            placeholder="Ej: Kiosco Av. Anta"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea
            value={storeData.description}
            onChange={(e) => setStoreData({ ...storeData, description: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FFD523] focus:border-[#FFD523]"
            rows={3}
            placeholder="Descripción del kiosco"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Horarios</label>
          <input
            type="text"
            value={storeData.hours}
            onChange={(e) => setStoreData({ ...storeData, hours: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FFD523] focus:border-[#FFD523]"
            placeholder="Ej: Lun - Dom: 08:00 - 20:00"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="is_active"
            checked={storeData.is_active}
            onChange={(e) => setStoreData({ ...storeData, is_active: e.target.checked })}
            className="h-4 w-4 text-[#FFD523] focus:ring-[#FFD523] border-gray-300 rounded"
          />
          <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">
            Local abierto (visible para clientes)
          </label>
        </div>

        <div className="pt-4 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-[#FFD523] text-black font-medium rounded-lg hover:bg-[#FFE066] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

