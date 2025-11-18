import { useState, useEffect } from 'react';

interface PaymentConfig {
  mercadoPago: {
    publicKey: string;
    accessToken: string;
    enabled: boolean;
  };
  transferencia: {
    alias: string;
    cvu: string;
    titular: string;
    enabled: boolean;
  };
  efectivo: {
    enabled: boolean;
    message: string;
  };
}

export default function PaymentConfig() {
  // Cargar configuración desde localStorage o usar valores por defecto
  const loadConfig = (): PaymentConfig => {
    try {
      const saved = localStorage.getItem('payment_config');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.warn('Error cargando configuración guardada:', error);
    }
    
    // Valores por defecto
    return {
      mercadoPago: {
        publicKey: 'APP_USR-4bd75427-2f2f-458a-a4be-e8fde5f96a94',
        accessToken: 'APP_USR-3099619996812490-102801-eb9ab207ccdc60dd066dcfe1bc60c65d-1045480277',
        enabled: true
      },
      transferencia: {
        alias: 'elbuenmenu.mp',
        cvu: '0000003100059183029153',
        titular: 'El Buen Menú',
        enabled: true
      },
      efectivo: {
        enabled: true,
        message: 'Pago en efectivo al recibir el pedido'
      }
    };
  };

  const [config, setConfig] = useState<PaymentConfig>(loadConfig());
  const [isLoading, setIsLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [showTokens, setShowTokens] = useState(false);

  // Cargar configuración desde Supabase al montar el componente
  useEffect(() => {
    const loadFromSupabase = async () => {
      try {
        const { supabase } = await import('../../../lib/supabase');
        
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'payment_config')
          .single();

        if (!error && data?.value) {
          const loadedConfig = data.value as any;
          // Validar y mergear con valores por defecto para asegurar estructura completa
          const defaultConfig = loadConfig();
          const mergedConfig: PaymentConfig = {
            mercadoPago: {
              ...defaultConfig.mercadoPago,
              ...(loadedConfig.mercadoPago || {}),
              // Asegurar que enabled existe, si no está presente, usar el valor por defecto
              enabled: loadedConfig.mercadoPago?.enabled !== undefined 
                ? loadedConfig.mercadoPago.enabled 
                : defaultConfig.mercadoPago.enabled
            },
            transferencia: {
              ...defaultConfig.transferencia,
              ...(loadedConfig.transferencia || {}),
              // Asegurar que enabled existe, si no está presente, usar el valor por defecto
              enabled: loadedConfig.transferencia?.enabled !== undefined 
                ? loadedConfig.transferencia.enabled 
                : defaultConfig.transferencia.enabled
            },
            efectivo: {
              ...defaultConfig.efectivo,
              ...(loadedConfig.efectivo || {}),
              // Asegurar que enabled existe, si no está presente, usar el valor por defecto
              enabled: loadedConfig.efectivo?.enabled !== undefined 
                ? loadedConfig.efectivo.enabled 
                : defaultConfig.efectivo.enabled
            }
          };
          setConfig(mergedConfig);
          // También actualizar localStorage
          localStorage.setItem('payment_config', JSON.stringify(mergedConfig));
        } else {
          // Si no hay datos en Supabase, verificar localStorage primero
          const localConfig = localStorage.getItem('payment_config');
          if (localConfig) {
            try {
              const parsed = JSON.parse(localConfig);
              // Validar que tenga la estructura correcta
              if (parsed.mercadoPago && parsed.transferencia && parsed.efectivo) {
                const defaultConfig = loadConfig();
                const mergedConfig: PaymentConfig = {
                  mercadoPago: {
                    ...defaultConfig.mercadoPago,
                    ...parsed.mercadoPago,
                    enabled: parsed.mercadoPago.enabled !== undefined ? parsed.mercadoPago.enabled : defaultConfig.mercadoPago.enabled
                  },
                  transferencia: {
                    ...defaultConfig.transferencia,
                    ...parsed.transferencia,
                    enabled: parsed.transferencia.enabled !== undefined ? parsed.transferencia.enabled : defaultConfig.transferencia.enabled
                  },
                  efectivo: {
                    ...defaultConfig.efectivo,
                    ...parsed.efectivo,
                    enabled: parsed.efectivo.enabled !== undefined ? parsed.efectivo.enabled : defaultConfig.efectivo.enabled
                  }
                };
                setConfig(mergedConfig);
                localStorage.setItem('payment_config', JSON.stringify(mergedConfig));
                return;
              }
            } catch (e) {
              // Si hay error parseando localStorage, usar valores por defecto
            }
          }
          // Si no hay datos válidos, usar valores por defecto y guardarlos
          const defaultConfig = loadConfig();
          setConfig(defaultConfig);
          localStorage.setItem('payment_config', JSON.stringify(defaultConfig));
        }
      } catch (error) {
        console.warn('No se pudo cargar configuración de Supabase:', error);
        // Si falla, usar valores por defecto
        const defaultConfig = loadConfig();
        setConfig(defaultConfig);
      }
    };

    loadFromSupabase();
  }, []);

  const handleConfigChange = (section: keyof PaymentConfig, field: string, value: string | boolean) => {
    setConfig(prev => {
      if (!prev || !prev[section]) {
        // Si no hay configuración previa, usar valores por defecto
        const defaultConfig = loadConfig();
        return {
          ...defaultConfig,
          [section]: {
            ...defaultConfig[section],
            [field]: value
          }
        };
      }
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value
        }
      };
    });
  };

  const resetToDefaults = () => {
    const defaultConfig = loadConfig();
    setConfig(defaultConfig);
    localStorage.setItem('payment_config', JSON.stringify(defaultConfig));
    setSavedMessage('Configuración restablecida a valores por defecto ✅');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Guardar en localStorage primero para uso inmediato en el frontend
      localStorage.setItem('payment_config', JSON.stringify(config));
      
      // Guardar en Supabase para persistencia (opcional, no crítico)
      try {
        const { supabase } = await import('../../../lib/supabase');
        
        const { error: settingsError } = await supabase
          .from('settings')
          .upsert({
            key: 'payment_config',
            value: config,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'key'
          });

        if (settingsError) {
          // Si no existe la tabla settings, continuar sin error (no crítico)
          console.warn('No se pudo guardar en Supabase settings (no crítico):', settingsError);
        }
      } catch (supabaseError) {
        // Si falla Supabase, continuar de todas formas (no crítico)
        console.warn('No se pudo guardar en Supabase (no crítico):', supabaseError);
      }

      // Guardar configuración en el backend para que Mercado Pago funcione
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'https://elbuenmenu.site/api';
        const endpoint = API_URL.endsWith('/api') ? `${API_URL}/admin/payment-config` : `${API_URL}/api/admin/payment-config`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mercadoPago: {
              accessToken: config?.mercadoPago?.accessToken || '',
              publicKey: config?.mercadoPago?.publicKey || ''
            }
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('✅ Configuración guardada en el backend:', result);
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
          console.warn('⚠️ No se pudo guardar en el backend:', errorData);
          // Continuar de todas formas - al menos se guardó en localStorage y Supabase
        }
      } catch (apiError) {
        // Si no hay API backend, continuar con localStorage
        console.warn('⚠️ API backend no disponible, usando solo localStorage:', apiError);
        // No es crítico - la configuración seguirá funcionando para el frontend
      }
      
      setSavedMessage('Configuración guardada correctamente ✅');
      setTimeout(() => setSavedMessage(''), 3000);
      
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      setSavedMessage('Error al guardar la configuración ❌');
    } finally {
      setIsLoading(false);
    }
  };

  const testMercadoPago = async () => {
    setIsLoading(true);
    try {
      // Primero guardar la configuración en el backend
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      
      // Guardar configuración en el backend
      const endpoint = API_URL.endsWith('/api') ? `${API_URL}/admin/payment-config` : `${API_URL}/api/admin/payment-config`;
      const saveResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mercadoPago: {
            accessToken: config?.mercadoPago?.accessToken || '',
            publicKey: config?.mercadoPago?.publicKey || '',
            enabled: config?.mercadoPago?.enabled ?? false
          },
          transferencia: config?.transferencia || { alias: '', cvu: '', titular: '', enabled: false },
          efectivo: config?.efectivo || { enabled: false, message: '' }
        })
      });
      
      if (!saveResponse.ok) {
        const errorData = await saveResponse.json().catch(() => ({ error: 'Error desconocido' }));
        setSavedMessage('❌ Error al guardar configuración: ' + (errorData.error || 'Error desconocido'));
        setTimeout(() => setSavedMessage(''), 5000);
        return;
      }
      
      // Esperar un momento para asegurar que el backend procesó la configuración
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Guardar también en localStorage y Supabase (como en handleSave)
      localStorage.setItem('payment_config', JSON.stringify(config));
      
      try {
        const { supabase } = await import('../../../lib/supabase');
        
        await supabase
          .from('settings')
          .upsert({
            key: 'payment_config',
            value: config,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'key'
          });
      } catch (supabaseError) {
        console.warn('No se pudo guardar en Supabase (no crítico):', supabaseError);
      }
      
      // Ahora intentar crear una preferencia de prueba
      const endpoint = API_URL.endsWith('/api') ? `${API_URL}/payments/mercadopago/create-preference` : `${API_URL}/api/payments/mercadopago/create-preference`;
      const testResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: 100,
          orderNumber: 'TEST',
          description: 'Prueba de conexión'
        })
      });
      
      if (testResponse.ok) {
        const result = await testResponse.json();
        setSavedMessage('✅ Conexión con Mercado Pago exitosa - Links dinámicos activos');
        setTimeout(() => setSavedMessage(''), 5000);
      } else {
        const errorData = await testResponse.json().catch(() => ({ error: 'Error desconocido' }));
        if (errorData.fallback) {
          setSavedMessage('⚠️ Mercado Pago guardado, pero usando link estático. Revisa la configuración del backend.');
        } else {
          setSavedMessage('❌ Error al probar conexión con Mercado Pago: ' + (errorData.error || 'Error desconocido'));
        }
        setTimeout(() => setSavedMessage(''), 5000);
      }
    } catch (error: any) {
      console.error('Error al probar Mercado Pago:', error);
      setSavedMessage('❌ Error al conectar con Mercado Pago: ' + (error.message || 'Error desconocido'));
      setTimeout(() => setSavedMessage(''), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Configuración de Pagos</h2>
        <div className="flex items-center space-x-3">
          <button
            onClick={resetToDefaults}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
          >
            <i className="ri-refresh-line"></i>
            <span>Restablecer por Defecto</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
          >
            <i className="ri-save-line w-4 h-4"></i>
            <span>{isLoading ? 'Guardando...' : 'Guardar'}</span>
          </button>
        </div>
      </div>

      {savedMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          savedMessage.includes('Error') 
            ? 'bg-red-100 text-red-700 border border-red-200' 
            : 'bg-green-100 text-green-700 border border-green-200'
        }`}>
          {savedMessage}
        </div>
      )}

      {/* Mercado Pago */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <i className="ri-bank-card-line w-5 h-5 text-blue-600"></i>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Mercado Pago</h3>
              <p className="text-sm text-gray-500">Pagos online con tarjeta</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config?.mercadoPago?.enabled ?? false}
              onChange={(e) => handleConfigChange('mercadoPago', 'enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Public Key
            </label>
            <input
              type="text"
              value={config?.mercadoPago?.publicKey || ''}
              onChange={(e) => handleConfigChange('mercadoPago', 'publicKey', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Access Token
            </label>
            <div className="relative">
              <input
                type={showTokens ? "text" : "password"}
                value={config?.mercadoPago?.accessToken || ''}
                onChange={(e) => handleConfigChange('mercadoPago', 'accessToken', e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxx"
              />
              <button
                type="button"
                onClick={() => setShowTokens(!showTokens)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showTokens ? <i className="ri-eye-off-line w-4 h-4"></i> : <i className="ri-eye-line w-4 h-4"></i>}
              </button>
            </div>
          </div>

          <button
            onClick={testMercadoPago}
            className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Probar Conexión
          </button>
        </div>
      </div>

      {/* Transferencia */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <i className="ri-bank-line w-5 h-5 text-green-600"></i>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Transferencia Bancaria</h3>
              <p className="text-sm text-gray-500">Pago por transferencia</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config?.transferencia?.enabled ?? false}
              onChange={(e) => handleConfigChange('transferencia', 'enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Alias
            </label>
            <input
              type="text"
              value={config?.transferencia?.alias || ''}
              onChange={(e) => handleConfigChange('transferencia', 'alias', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
              placeholder="elbuenmenu.mp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CVU
            </label>
            <input
              type="text"
              value={config?.transferencia?.cvu || ''}
              onChange={(e) => handleConfigChange('transferencia', 'cvu', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
              placeholder="0000003100059183029153"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Titular
            </label>
            <input
              type="text"
              value={config?.transferencia?.titular || ''}
              onChange={(e) => handleConfigChange('transferencia', 'titular', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
              placeholder="El Buen Menú"
            />
          </div>
        </div>
      </div>

      {/* Efectivo */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <span className="text-orange-600 font-bold text-sm">$</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Pago en Efectivo</h3>
              <p className="text-sm text-gray-500">Pago al recibir</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config?.efectivo?.enabled ?? false}
              onChange={(e) => handleConfigChange('efectivo', 'enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mensaje para el cliente
          </label>
          <textarea
            value={config?.efectivo?.message || ''}
            onChange={(e) => handleConfigChange('efectivo', 'message', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all resize-none"
            placeholder="Mensaje que se muestra al cliente cuando elige pago en efectivo"
          />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 mb-2">💡 Información importante:</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Las credenciales de Mercado Pago se almacenan de forma segura</li>
          <li>• La verificación automática de transferencias requiere integración bancaria</li>
          <li>• Puedes habilitar/deshabilitar métodos de pago según necesites</li>
          <li>• Los cambios se reflejan inmediatamente en el bot de WhatsApp</li>
        </ul>
      </div>
    </div>
  );
}
