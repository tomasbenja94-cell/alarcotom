import { useState, useEffect } from 'react';

interface Settings {
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
    order_alerts: boolean;
    stock_alerts: boolean;
  };
  business: {
    auto_approve_orders: boolean;
    require_payment_confirmation: boolean;
    delivery_enabled: boolean;
    pickup_enabled: boolean;
  };
  integrations: {
    whatsapp_enabled: boolean;
    mercado_pago_enabled: boolean;
  };
  appearance: {
    theme: 'light' | 'dark' | 'auto';
    primary_color: string;
  };
}

export default function AdvancedSettings() {
  const [settings, setSettings] = useState<Settings>({
    notifications: {
      email: true,
      push: true,
      sms: false,
      order_alerts: true,
      stock_alerts: true,
    },
    business: {
      auto_approve_orders: false,
      require_payment_confirmation: true,
      delivery_enabled: true,
      pickup_enabled: true,
    },
    integrations: {
      whatsapp_enabled: true,
      mercado_pago_enabled: true,
    },
    appearance: {
      theme: 'light',
      primary_color: '#f97316',
    },
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/settings?storeId=${storeId}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSettings(data || settings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ ...settings, storeId })
      });
      
      if (response.ok) {
        alert('Configuración guardada exitosamente');
        // Aplicar tema
        if (settings.appearance.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (section: keyof Settings, key: string, value: any) => {
    setSettings({
      ...settings,
      [section]: {
        ...settings[section],
        [key]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Configuración Avanzada</h2>
          <p className="text-sm text-slate-500 mt-1">Personaliza tu panel administrativo</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      {/* Notificaciones */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <i className="ri-notification-line text-blue-500"></i>
          Notificaciones
        </h3>
        <div className="space-y-4">
          {Object.entries(settings.notifications).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 capitalize">
                {key.replace(/_/g, ' ')}
              </label>
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => updateSetting('notifications', key, e.target.checked)}
                className="w-5 h-5"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Negocio */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <i className="ri-store-line text-green-500"></i>
          Configuración del Negocio
        </h3>
        <div className="space-y-4">
          {Object.entries(settings.business).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-700 capitalize">
                  {key.replace(/_/g, ' ')}
                </label>
                <p className="text-xs text-slate-500 mt-1">
                  {key === 'auto_approve_orders' && 'Aprobar pedidos automáticamente'}
                  {key === 'require_payment_confirmation' && 'Requiere confirmación de pago'}
                  {key === 'delivery_enabled' && 'Habilitar entregas a domicilio'}
                  {key === 'pickup_enabled' && 'Habilitar retiro en local'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => updateSetting('business', key, e.target.checked)}
                className="w-5 h-5"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Integraciones */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <i className="ri-plug-line text-purple-500"></i>
          Integraciones
        </h3>
        <div className="space-y-4">
          {Object.entries(settings.integrations).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 capitalize">
                {key.replace(/_/g, ' ')}
              </label>
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => updateSetting('integrations', key, e.target.checked)}
                className="w-5 h-5"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Apariencia */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <i className="ri-palette-line text-amber-500"></i>
          Apariencia
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tema</label>
            <select
              value={settings.appearance.theme}
              onChange={(e) => updateSetting('appearance', 'theme', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            >
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
              <option value="auto">Automático</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Color Principal</label>
            <input
              type="color"
              value={settings.appearance.primary_color}
              onChange={(e) => updateSetting('appearance', 'primary_color', e.target.value)}
              className="w-full h-12 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

