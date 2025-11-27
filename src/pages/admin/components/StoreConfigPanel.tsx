import { useState, useEffect } from 'react';
import { whatsappTemplates } from '../../../constants/whatsappTemplates';
import type { WhatsappTemplateKey } from '../../../constants/whatsappTemplates';

interface StoreSettings {
  // Datos básicos
  commercialName: string;
  logoUrl: string;
  shortDescription: string;
  longDescription: string;
  storeType: string;
  address: string;
  phone: string;
  whatsappNumber: string;
  
  // Horarios y estado
  hours: Record<string, { open: string; close: string; enabled: boolean }>;
  deliveryHours: Record<string, { open: string; close: string; enabled: boolean }>;
  isOpen: boolean;
  closedMessage: string;
  
  // Envíos
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryPrice: number;
  deliveryTimeMin: number;
  deliveryTimeMax: number;
  deliveryZoneInfo: string;
  deliveryTempDisabled: boolean;
  
  // Pagos
  cashEnabled: boolean;
  transferEnabled: boolean;
  transferAlias: string;
  transferCvu: string;
  transferTitular: string;
  transferNotes: string;
  mercadoPagoEnabled: boolean;
  mercadoPagoLink: string;
  paymentNotes: string;
  
  // Bot WhatsApp
  whatsappBotEnabled: boolean;
  whatsappBotNumber: string;
  welcomeMessage: string;
  orderConfirmMessage: string;
  orderOnWayMessage: string;
  
  // Otros
  acceptScheduledOrders: boolean;
  promotionsEnabled: boolean;
  minOrderAmount: number;
  maxOrdersPerHour: number;
}

const DAYS = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

const STORE_TYPES = [
  { value: 'kiosco', label: 'Kiosco' },
  { value: 'tragos', label: 'Bar / Tragos' },
  { value: 'rotiseria', label: 'Rotisería' },
  { value: 'restaurante', label: 'Restaurante' },
  { value: 'pizzeria', label: 'Pizzería' },
  { value: 'heladeria', label: 'Heladería' },
  { value: 'panaderia', label: 'Panadería' },
  { value: 'supermercado', label: 'Supermercado' },
  { value: 'otro', label: 'Otro' },
];

const defaultHours = DAYS.reduce((acc, day) => {
  acc[day.key] = { open: '09:00', close: '22:00', enabled: true };
  return acc;
}, {} as Record<string, { open: string; close: string; enabled: boolean }>);

const defaultSettings: StoreSettings = {
  commercialName: '',
  logoUrl: '',
  shortDescription: '',
  longDescription: '',
  storeType: 'kiosco',
  address: '',
  phone: '',
  whatsappNumber: '',
  hours: defaultHours,
  deliveryHours: defaultHours,
  isOpen: true,
  closedMessage: 'Este local está cerrado, vuelve más tarde',
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryPrice: 0,
  deliveryTimeMin: 30,
  deliveryTimeMax: 45,
  deliveryZoneInfo: '',
  deliveryTempDisabled: false,
  cashEnabled: true,
  transferEnabled: false,
  transferAlias: '',
  transferCvu: '',
  transferTitular: '',
  transferNotes: '',
  mercadoPagoEnabled: false,
  mercadoPagoLink: '',
  paymentNotes: '',
  whatsappBotEnabled: false,
  whatsappBotNumber: '',
  welcomeMessage: '👋 ¡Hola! Somos {{storeName}}. Hacé tu pedido en {{storeUrl}} y seguimos por acá.',
  orderConfirmMessage: '✅ Pedido {{orderNumber}} confirmado. Código repartidor: {{deliveryCode}}. Seguimiento: {{trackingUrl}}',
  orderOnWayMessage: '🚗 Pedido {{orderNumber}} en camino. Código: {{deliveryCode}}. Tracking: {{trackingUrl}}',
  acceptScheduledOrders: false,
  promotionsEnabled: true,
  minOrderAmount: 0,
  maxOrdersPerHour: 0,
};

interface Props {
  storeId: string;
}

type TabKey = 'basic' | 'hours' | 'delivery' | 'payments' | 'whatsapp' | 'other';

export default function StoreConfigPanel({ storeId }: Props) {
  const [settings, setSettings] = useState<StoreSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('basic');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const apiUrl = (import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api').replace(/\/$/, '');
  const baseUrl = apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;

  useEffect(() => {
    fetchSettings();
  }, [storeId]);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${baseUrl}/store-settings/${storeId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Parsear JSON strings
        const parsed = {
          ...defaultSettings,
          ...data,
          hours: data.hours ? JSON.parse(data.hours) : defaultHours,
          deliveryHours: data.deliveryHours ? JSON.parse(data.deliveryHours) : defaultHours,
        };
        setSettings(parsed);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      const token = localStorage.getItem('adminToken');
      const payload = {
        ...settings,
        hours: JSON.stringify(settings.hours),
        deliveryHours: JSON.stringify(settings.deliveryHours),
      };
      
      const response = await fetch(`${baseUrl}/store-settings/${storeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Configuración guardada correctamente' });
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al guardar la configuración' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const updateSettings = (updates: Partial<StoreSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const updateHours = (day: string, field: 'open' | 'close' | 'enabled', value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      hours: {
        ...prev.hours,
        [day]: { ...prev.hours[day], [field]: value }
      }
    }));
  };

  const updateDeliveryHours = (day: string, field: 'open' | 'close' | 'enabled', value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      deliveryHours: {
        ...prev.deliveryHours,
        [day]: { ...prev.deliveryHours[day], [field]: value }
      }
    }));
  };

  const handleApplyTemplate = (templateKey: WhatsappTemplateKey) => {
    const template = whatsappTemplates.find(t => t.key === templateKey);
    if (!template) return;
    updateSettings({
      welcomeMessage: template.welcome,
      orderConfirmMessage: template.orderConfirm,
      orderOnWayMessage: template.orderOnWay
    });
    setMessage({ type: 'success', text: `Plantilla ${template.label} aplicada` });
    setTimeout(() => setMessage(null), 2500);
  };

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'basic', label: 'Datos básicos', icon: 'ri-store-2-line' },
    { key: 'hours', label: 'Horarios', icon: 'ri-time-line' },
    { key: 'delivery', label: 'Envíos', icon: 'ri-truck-line' },
    { key: 'payments', label: 'Pagos', icon: 'ri-bank-card-line' },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'ri-whatsapp-line' },
    { key: 'other', label: 'Otros', icon: 'ri-settings-3-line' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FF3366] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Configuración del local</h2>
          <p className="text-sm text-gray-500">Configura todos los aspectos de tu local</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-[#FF3366] text-white font-semibold rounded-xl hover:bg-[#E62E5C] disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          ) : (
            <i className="ri-save-line"></i>
          )}
          Guardar cambios
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-xl ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <i className={`${message.type === 'success' ? 'ri-check-line' : 'ri-error-warning-line'} mr-2`}></i>
          {message.text}
        </div>
      )}

      {/* Estado del local - Siempre visible */}
      <div className={`mb-6 p-4 rounded-xl border-2 ${settings.isOpen ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${settings.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <div>
              <p className={`font-bold ${settings.isOpen ? 'text-green-700' : 'text-red-700'}`}>
                {settings.isOpen ? 'Local ABIERTO' : 'Local CERRADO'}
              </p>
              <p className="text-xs text-gray-600">
                {settings.isOpen ? 'Los clientes pueden hacer pedidos' : 'No se aceptan pedidos'}
              </p>
            </div>
          </div>
          <button
            onClick={() => updateSettings({ isOpen: !settings.isOpen })}
            className={`px-4 py-2 rounded-lg font-semibold text-sm ${
              settings.isOpen 
                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {settings.isOpen ? 'Cerrar local' : 'Abrir local'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1 mb-6 bg-gray-100 p-1 rounded-xl">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? 'bg-white text-[#FF3366] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className={tab.icon}></i>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {/* TAB: Datos básicos */}
        {activeTab === 'basic' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <i className="ri-store-2-line text-[#FF3366]"></i>
              Datos básicos del local
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre comercial</label>
                <input
                  type="text"
                  value={settings.commercialName}
                  onChange={(e) => updateSettings({ commercialName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  placeholder="Mi Kiosco"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de local</label>
                <select
                  value={settings.storeType}
                  onChange={(e) => updateSettings({ storeType: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                >
                  {STORE_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL del logo/foto</label>
              <input
                type="url"
                value={settings.logoUrl}
                onChange={(e) => updateSettings({ logoUrl: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                placeholder="https://..."
              />
              {settings.logoUrl && (
                <div className="mt-2">
                  <img src={settings.logoUrl} alt="Logo" className="w-20 h-20 object-cover rounded-xl border" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción corta</label>
              <input
                type="text"
                value={settings.shortDescription}
                onChange={(e) => updateSettings({ shortDescription: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                placeholder="Kiosco con delivery 24hs"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción larga</label>
              <textarea
                value={settings.longDescription}
                onChange={(e) => updateSettings({ longDescription: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                placeholder="Descripción detallada del local..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección física</label>
                <input
                  type="text"
                  value={settings.address}
                  onChange={(e) => updateSettings({ address: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  placeholder="Av. Rivadavia 1234"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono de contacto</label>
                <input
                  type="tel"
                  value={settings.phone}
                  onChange={(e) => updateSettings({ phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  placeholder="011-1234-5678"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp visible para clientes</label>
              <input
                type="tel"
                value={settings.whatsappNumber}
                onChange={(e) => updateSettings({ whatsappNumber: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                placeholder="5491112345678"
              />
              <p className="text-xs text-gray-500 mt-1">Formato: código país + número sin espacios ni guiones</p>
            </div>
          </div>
        )}

        {/* TAB: Horarios */}
        {activeTab === 'hours' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <i className="ri-time-line text-[#FF3366]"></i>
              Horarios del local
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje cuando está cerrado</label>
              <input
                type="text"
                value={settings.closedMessage}
                onChange={(e) => updateSettings({ closedMessage: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                placeholder="Este local está cerrado, vuelve más tarde"
              />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Horarios de atención</p>
              {DAYS.map(day => (
                <div key={day.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <label className="flex items-center gap-2 min-w-[120px]">
                    <input
                      type="checkbox"
                      checked={settings.hours[day.key]?.enabled ?? true}
                      onChange={(e) => updateHours(day.key, 'enabled', e.target.checked)}
                      className="w-4 h-4 text-[#FF3366] rounded focus:ring-[#FF3366]"
                    />
                    <span className="text-sm font-medium">{day.label}</span>
                  </label>
                  {settings.hours[day.key]?.enabled && (
                    <>
                      <input
                        type="time"
                        value={settings.hours[day.key]?.open || '09:00'}
                        onChange={(e) => updateHours(day.key, 'open', e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      />
                      <span className="text-gray-400">a</span>
                      <input
                        type="time"
                        value={settings.hours[day.key]?.close || '22:00'}
                        onChange={(e) => updateHours(day.key, 'close', e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      />
                    </>
                  )}
                  {!settings.hours[day.key]?.enabled && (
                    <span className="text-sm text-gray-400">Cerrado</span>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t pt-6 space-y-3">
              <p className="text-sm font-medium text-gray-700">Horarios de envío (si son distintos)</p>
              <p className="text-xs text-gray-500">Deja igual que arriba si los envíos tienen el mismo horario</p>
              {DAYS.map(day => (
                <div key={`delivery-${day.key}`} className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                  <label className="flex items-center gap-2 min-w-[120px]">
                    <input
                      type="checkbox"
                      checked={settings.deliveryHours[day.key]?.enabled ?? true}
                      onChange={(e) => updateDeliveryHours(day.key, 'enabled', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium">{day.label}</span>
                  </label>
                  {settings.deliveryHours[day.key]?.enabled && (
                    <>
                      <input
                        type="time"
                        value={settings.deliveryHours[day.key]?.open || '09:00'}
                        onChange={(e) => updateDeliveryHours(day.key, 'open', e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      />
                      <span className="text-gray-400">a</span>
                      <input
                        type="time"
                        value={settings.deliveryHours[day.key]?.close || '22:00'}
                        onChange={(e) => updateDeliveryHours(day.key, 'close', e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      />
                    </>
                  )}
                  {!settings.deliveryHours[day.key]?.enabled && (
                    <span className="text-sm text-gray-400">Sin envíos</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: Envíos */}
        {activeTab === 'delivery' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <i className="ri-truck-line text-[#FF3366]"></i>
              Configuración de envíos
            </h3>

            {/* Toggle temporal */}
            {settings.deliveryTempDisabled && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <div className="flex items-center gap-2 text-orange-700">
                  <i className="ri-error-warning-line text-xl"></i>
                  <span className="font-medium">Envíos deshabilitados temporalmente</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl cursor-pointer">
                <div className="flex items-center gap-3">
                  <i className="ri-truck-line text-xl text-gray-600"></i>
                  <div>
                    <p className="font-medium">Envío a domicilio</p>
                    <p className="text-xs text-gray-500">Permitir delivery</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.deliveryEnabled}
                  onChange={(e) => updateSettings({ deliveryEnabled: e.target.checked })}
                  className="w-5 h-5 text-[#FF3366] rounded focus:ring-[#FF3366]"
                />
              </label>

              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl cursor-pointer">
                <div className="flex items-center gap-3">
                  <i className="ri-store-2-line text-xl text-gray-600"></i>
                  <div>
                    <p className="font-medium">Retiro en local</p>
                    <p className="text-xs text-gray-500">Permitir pickup</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.pickupEnabled}
                  onChange={(e) => updateSettings({ pickupEnabled: e.target.checked })}
                  className="w-5 h-5 text-[#FF3366] rounded focus:ring-[#FF3366]"
                />
              </label>
            </div>

            <label className="flex items-center justify-between p-4 bg-orange-50 border border-orange-200 rounded-xl cursor-pointer">
              <div className="flex items-center gap-3">
                <i className="ri-pause-circle-line text-xl text-orange-600"></i>
                <div>
                  <p className="font-medium text-orange-700">Deshabilitar envíos temporalmente</p>
                  <p className="text-xs text-orange-600">Solo retiro en local por hoy</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.deliveryTempDisabled}
                onChange={(e) => updateSettings({ deliveryTempDisabled: e.target.checked })}
                className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500"
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio del envío ($)</label>
                <input
                  type="number"
                  value={settings.deliveryPrice}
                  onChange={(e) => updateSettings({ deliveryPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiempo mínimo (min)</label>
                <input
                  type="number"
                  value={settings.deliveryTimeMin}
                  onChange={(e) => updateSettings({ deliveryTimeMin: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiempo máximo (min)</label>
                <input
                  type="number"
                  value={settings.deliveryTimeMax}
                  onChange={(e) => updateSettings({ deliveryTimeMax: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  min="0"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Información de zona de envío</label>
              <input
                type="text"
                value={settings.deliveryZoneInfo}
                onChange={(e) => updateSettings({ deliveryZoneInfo: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                placeholder="Ej: Envíos solo en Zárate centro"
              />
            </div>
          </div>
        )}

        {/* TAB: Pagos */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <i className="ri-bank-card-line text-[#FF3366]"></i>
              Métodos de pago
            </h3>

            {/* Efectivo */}
            <div className="p-4 bg-gray-50 rounded-xl space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <i className="ri-money-dollar-circle-line text-2xl text-green-600"></i>
                  <div>
                    <p className="font-medium">Efectivo</p>
                    <p className="text-xs text-gray-500">Pago en efectivo al recibir</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.cashEnabled}
                  onChange={(e) => updateSettings({ cashEnabled: e.target.checked })}
                  className="w-5 h-5 text-[#FF3366] rounded focus:ring-[#FF3366]"
                />
              </label>
            </div>

            {/* Transferencia */}
            <div className="p-4 bg-gray-50 rounded-xl space-y-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <i className="ri-bank-line text-2xl text-blue-600"></i>
                  <div>
                    <p className="font-medium">Transferencia bancaria</p>
                    <p className="text-xs text-gray-500">Pago por alias o CVU</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.transferEnabled}
                  onChange={(e) => updateSettings({ transferEnabled: e.target.checked })}
                  className="w-5 h-5 text-[#FF3366] rounded focus:ring-[#FF3366]"
                />
              </label>

              {settings.transferEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Alias</label>
                    <input
                      type="text"
                      value={settings.transferAlias}
                      onChange={(e) => updateSettings({ transferAlias: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl"
                      placeholder="mi.alias.mp"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CVU</label>
                    <input
                      type="text"
                      value={settings.transferCvu}
                      onChange={(e) => updateSettings({ transferCvu: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl"
                      placeholder="0000003100..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Titular de la cuenta</label>
                    <input
                      type="text"
                      value={settings.transferTitular}
                      onChange={(e) => updateSettings({ transferTitular: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl"
                      placeholder="Juan Pérez"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notas de transferencia</label>
                    <input
                      type="text"
                      value={settings.transferNotes}
                      onChange={(e) => updateSettings({ transferNotes: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl"
                      placeholder="Ej: Enviar comprobante por WhatsApp"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Mercado Pago */}
            <div className="p-4 bg-gray-50 rounded-xl space-y-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#00B1EA] rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-xs">MP</span>
                  </div>
                  <div>
                    <p className="font-medium">Mercado Pago</p>
                    <p className="text-xs text-gray-500">Link de pago o integración</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.mercadoPagoEnabled}
                  onChange={(e) => updateSettings({ mercadoPagoEnabled: e.target.checked })}
                  className="w-5 h-5 text-[#FF3366] rounded focus:ring-[#FF3366]"
                />
              </label>

              {settings.mercadoPagoEnabled && (
                <div className="pt-3 border-t">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link de pago de Mercado Pago</label>
                  <input
                    type="url"
                    value={settings.mercadoPagoLink}
                    onChange={(e) => updateSettings({ mercadoPagoLink: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl"
                    placeholder="https://link.mercadopago.com.ar/..."
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas generales de pago</label>
              <textarea
                value={settings.paymentNotes}
                onChange={(e) => updateSettings({ paymentNotes: e.target.value })}
                rows={2}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                placeholder="Ej: Mostrar comprobante al repartidor, Pagar antes de preparar el pedido..."
              />
            </div>
          </div>
        )}

        {/* TAB: WhatsApp */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <i className="ri-whatsapp-line text-[#25D366]"></i>
              Bot de WhatsApp
            </h3>

            <label className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl cursor-pointer">
              <div className="flex items-center gap-3">
                <i className="ri-robot-line text-2xl text-green-600"></i>
                <div>
                  <p className="font-medium text-green-700">Activar bot de WhatsApp</p>
                  <p className="text-xs text-green-600">Respuestas automáticas y notificaciones</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.whatsappBotEnabled}
                onChange={(e) => updateSettings({ whatsappBotEnabled: e.target.checked })}
                className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
              />
            </label>

            {settings.whatsappBotEnabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número que recibe los mensajes</label>
                  <input
                    type="tel"
                    value={settings.whatsappBotNumber}
                    onChange={(e) => updateSettings({ whatsappBotNumber: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                    placeholder="5491112345678"
                  />
                </div>

                {/* Vincular WhatsApp con QR */}
                <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">Vincular WhatsApp</p>
                      <p className="text-xs text-gray-500">Escanea el código QR para conectar tu WhatsApp a este local</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.open(`/admin/whatsapp-qr/${storeId}`, '_blank')}
                      className="px-4 py-2 bg-[#25D366] text-white text-sm font-medium rounded-xl hover:bg-[#128C7E] transition-colors flex items-center gap-2"
                    >
                      <i className="ri-qr-code-line"></i>
                      Ver QR
                    </button>
                  </div>
                  <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
                    <i className="ri-information-line mr-1"></i>
                    Cada local tiene su propio WhatsApp. Puedes vincular hasta 3 números diferentes en tu servidor.
                  </p>
                </div>

                <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">Plantillas rápidas</p>
                      <p className="text-xs text-gray-500">Aplica textos recomendados según el tipo de local</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {whatsappTemplates.map(template => (
                      <button
                        key={template.key}
                        type="button"
                        onClick={() => handleApplyTemplate(template.key)}
                        className="px-3 py-1.5 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-100"
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Placeholders disponibles: {'{{storeName}}'}, {'{{storeUrl}}'}, {'{{orderNumber}}'}, {'{{deliveryCode}}'}, {'{{trackingUrl}}'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje de bienvenida</label>
                  <textarea
                    value={settings.welcomeMessage}
                    onChange={(e) => updateSettings({ welcomeMessage: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje de confirmación de pedido</label>
                  <textarea
                    value={settings.orderConfirmMessage}
                    onChange={(e) => updateSettings({ orderConfirmMessage: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  />
                  <p className="text-xs text-gray-500 mt-1">Usa {'{orderNumber}'} para insertar el número de pedido</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje de pedido en camino</label>
                  <textarea
                    value={settings.orderOnWayMessage}
                    onChange={(e) => updateSettings({ orderOnWayMessage: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB: Otros */}
        {activeTab === 'other' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <i className="ri-settings-3-line text-[#FF3366]"></i>
              Otros ajustes
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl cursor-pointer">
                <div className="flex items-center gap-3">
                  <i className="ri-calendar-schedule-line text-xl text-gray-600"></i>
                  <div>
                    <p className="font-medium">Pedidos programados</p>
                    <p className="text-xs text-gray-500">Permitir agendar para después</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.acceptScheduledOrders}
                  onChange={(e) => updateSettings({ acceptScheduledOrders: e.target.checked })}
                  className="w-5 h-5 text-[#FF3366] rounded focus:ring-[#FF3366]"
                />
              </label>

              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl cursor-pointer">
                <div className="flex items-center gap-3">
                  <i className="ri-price-tag-3-line text-xl text-gray-600"></i>
                  <div>
                    <p className="font-medium">Promociones activas</p>
                    <p className="text-xs text-gray-500">Mostrar promos del local</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.promotionsEnabled}
                  onChange={(e) => updateSettings({ promotionsEnabled: e.target.checked })}
                  className="w-5 h-5 text-[#FF3366] rounded focus:ring-[#FF3366]"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto mínimo de pedido ($)</label>
                <input
                  type="number"
                  value={settings.minOrderAmount}
                  onChange={(e) => updateSettings({ minOrderAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  min="0"
                  placeholder="0 = sin mínimo"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Máximo pedidos por hora</label>
                <input
                  type="number"
                  value={settings.maxOrdersPerHour}
                  onChange={(e) => updateSettings({ maxOrdersPerHour: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF3366] focus:border-[#FF3366]"
                  min="0"
                  placeholder="0 = sin límite"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

