import { useState, useEffect } from 'react';
import { useToast } from '../../../hooks/useToast';

interface StoreSettingsProps {
  storeId?: string | null;
}

interface StoreSettingsData {
  address?: string;
  hours?: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  cashEnabled: boolean;
  transferEnabled: boolean;
  transferAlias?: string;
  transferCvu?: string;
  transferTitular?: string;
  mercadoPagoEnabled: boolean;
  mercadoPagoToken?: string;
  mercadoPagoKey?: string;
}

export default function StoreSettings({ storeId }: StoreSettingsProps = {}) {
  const { error: showError, success: showSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<StoreSettingsData>({
    deliveryEnabled: true,
    pickupEnabled: true,
    cashEnabled: true,
    transferEnabled: true,
    mercadoPagoEnabled: false
  });

  useEffect(() => {
    if (storeId) {
      loadSettings();
    }
  }, [storeId]);

  const loadSettings = async () => {
    if (!storeId) return;

    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`${apiUrl}/store-settings/${storeId}`, {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      if (showError) showError('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!storeId) {
      if (showError) showError('No hay tienda seleccionada');
      return;
    }

    try {
      setSaving(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`${apiUrl}/store-settings/${storeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        const data = await response.json();
        if (showSuccess) showSuccess('✅ Configuración guardada exitosamente');
        return data;
      } else {
        const error = await response.json().catch(() => ({ error: 'Error al guardar' }));
        throw new Error(error.error || 'Error al guardar');
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      if (showError) showError(error.message || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Configuración de Tienda</h2>
        <p className="text-sm text-gray-600">Configura los datos generales, horarios y métodos de pago/entrega</p>
      </div>

      {/* Datos Generales */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Datos Generales</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dirección del Local
            </label>
            <input
              type="text"
              value={settings.address || ''}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              placeholder="Ej: Av. Rivadavia 2911, Zárate"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FFD523] focus:border-[#FFD523]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Horarios de Atención
            </label>
            <textarea
              value={settings.hours || ''}
              onChange={(e) => setSettings({ ...settings, hours: e.target.value })}
              placeholder="Ej: Lun - Dom: 10:00 - 22:00"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FFD523] focus:border-[#FFD523]"
            />
          </div>
        </div>
      </div>

      {/* Métodos de Entrega */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Métodos de Entrega</h3>
        
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.deliveryEnabled}
              onChange={(e) => setSettings({ ...settings, deliveryEnabled: e.target.checked })}
              className="w-5 h-5 text-[#FFD523] border-gray-300 rounded focus:ring-[#FFD523]"
            />
            <span className="text-sm font-medium text-gray-700">Delivery (Envío a domicilio)</span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.pickupEnabled}
              onChange={(e) => setSettings({ ...settings, pickupEnabled: e.target.checked })}
              className="w-5 h-5 text-[#FFD523] border-gray-300 rounded focus:ring-[#FFD523]"
            />
            <span className="text-sm font-medium text-gray-700">Retiro en Local</span>
          </label>
        </div>
      </div>

      {/* Métodos de Pago */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Métodos de Pago</h3>
        
        <div className="space-y-4">
          {/* Efectivo */}
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.cashEnabled}
              onChange={(e) => setSettings({ ...settings, cashEnabled: e.target.checked })}
              className="w-5 h-5 text-[#FFD523] border-gray-300 rounded focus:ring-[#FFD523]"
            />
            <span className="text-sm font-medium text-gray-700">Efectivo</span>
          </label>

          {/* Transferencia */}
          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center space-x-3 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={settings.transferEnabled}
                onChange={(e) => setSettings({ ...settings, transferEnabled: e.target.checked })}
                className="w-5 h-5 text-[#FFD523] border-gray-300 rounded focus:ring-[#FFD523]"
              />
              <span className="text-sm font-medium text-gray-700">Transferencia Bancaria</span>
            </label>
            
            {settings.transferEnabled && (
              <div className="ml-8 space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Alias</label>
                  <input
                    type="text"
                    value={settings.transferAlias || ''}
                    onChange={(e) => setSettings({ ...settings, transferAlias: e.target.value })}
                    placeholder="Ej: elbuenmenu.mp"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">CVU</label>
                  <input
                    type="text"
                    value={settings.transferCvu || ''}
                    onChange={(e) => setSettings({ ...settings, transferCvu: e.target.value })}
                    placeholder="Ej: 0000003100059183029153"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Titular</label>
                  <input
                    type="text"
                    value={settings.transferTitular || ''}
                    onChange={(e) => setSettings({ ...settings, transferTitular: e.target.value })}
                    placeholder="Ej: El Buen Menú"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Mercado Pago */}
          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center space-x-3 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={settings.mercadoPagoEnabled}
                onChange={(e) => setSettings({ ...settings, mercadoPagoEnabled: e.target.checked })}
                className="w-5 h-5 text-[#FFD523] border-gray-300 rounded focus:ring-[#FFD523]"
              />
              <span className="text-sm font-medium text-gray-700">Mercado Pago</span>
            </label>
            
            {settings.mercadoPagoEnabled && (
              <div className="ml-8 space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Access Token</label>
                  <input
                    type="password"
                    value={settings.mercadoPagoToken || ''}
                    onChange={(e) => setSettings({ ...settings, mercadoPagoToken: e.target.value })}
                    placeholder="APP_USR-..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Public Key</label>
                  <input
                    type="text"
                    value={settings.mercadoPagoKey || ''}
                    onChange={(e) => setSettings({ ...settings, mercadoPagoKey: e.target.value })}
                    placeholder="APP_USR-..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Botón Guardar */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-6 py-3 bg-[#FFD523] text-black rounded-lg font-semibold hover:bg-[#FFE066] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      </div>
    </div>
  );
}

