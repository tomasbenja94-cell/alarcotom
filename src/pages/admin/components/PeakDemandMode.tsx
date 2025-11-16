import { useState, useEffect } from 'react';

interface PeakDemandModeProps {
  onStateChange?: (isActive: boolean) => void;
}

export default function PeakDemandMode({ onStateChange }: PeakDemandModeProps) {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState({
    estimatedTimeMinutes: 20,
    maxOrdersPerHour: null as number | null,
    priceMultiplier: 1.0,
    disabledProductIds: [] as string[]
  });
  const API_URL = import.meta.env.VITE_API_URL || 'https://elbuenmenu.site/api';

  useEffect(() => {
    loadPeakDemandState();
  }, []);

  const loadPeakDemandState = async () => {
    try {
      const response = await fetch(`${API_URL}/api/system/peak-demand-state`);
      if (response.ok) {
        const data = await response.json();
        setIsActive(data.isActive || false);
        if (data.config) {
          setConfig({
            estimatedTimeMinutes: data.config.estimatedTimeMinutes || 20,
            maxOrdersPerHour: data.config.maxOrdersPerHour || null,
            priceMultiplier: data.config.priceMultiplier || 1.0,
            disabledProductIds: data.config.disabledProductIds || []
          });
        }
        if (onStateChange) onStateChange(data.isActive || false);
      }
    } catch (error) {
      console.error('Error cargando modo pico de demanda:', error);
    }
  };

  const togglePeakDemandMode = async () => {
    if (!confirm(
      isActive 
        ? '¿Desactivar Modo Lluvia / Pico de Demanda?\n\nSe restablecerán:\n• Tiempo estimado normal\n• Sin límite de pedidos\n• Precios normales\n• Todos los productos disponibles'
        : '¿Activar Modo Lluvia / Pico de Demanda?\n\nEsto hará:\n• Tiempo estimado +20 min\n• Limitar cantidad de pedidos por hora\n• Elevar precios opcionalmente\n• Deshabilitar productos temporales\n• Avisar automáticamente al cliente'
    )) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/system/peak-demand-mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: !isActive,
          config: isActive ? null : config
        })
      });

      if (response.ok) {
        const data = await response.json();
        setIsActive(data.isActive);
        if (onStateChange) onStateChange(data.isActive);
        
        alert(
          data.isActive
            ? `🌧️ Modo Lluvia / Pico de Demanda ACTIVADO\n\n• Tiempo estimado: +${config.estimatedTimeMinutes} min\n• Límite de pedidos: ${config.maxOrdersPerHour || 'Sin límite'}/hora\n• Multiplicador de precios: ${(config.priceMultiplier * 100).toFixed(0)}%\n• Productos deshabilitados: ${config.disabledProductIds.length}`
            : '✅ Modo Lluvia / Pico de Demanda DESACTIVADO\n\n• Sistema operativo normal'
        );
      } else {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        alert(`❌ Error: ${error.error || 'Error al cambiar modo pico de demanda'}`);
      }
    } catch (error: any) {
      console.error('Error al cambiar modo pico de demanda:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const updateConfig = async (newConfig: Partial<typeof config>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    
    if (isActive) {
      // Si está activo, actualizar inmediatamente
      try {
        await fetch(`${API_URL}/api/system/peak-demand-config`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedConfig)
        });
      } catch (error) {
        console.error('Error actualizando configuración:', error);
      }
    }
  };

  return (
    <div className="relative">
      <button
        onClick={togglePeakDemandMode}
        disabled={isLoading}
        className={`px-4 py-2 text-xs font-medium transition-all border rounded ${
          isActive
            ? 'bg-[#111111] text-white border-[#FFC300] hover:bg-[#1A1A1A]'
            : 'bg-white text-[#111111] border-[#C7C7C7] hover:bg-[#F9F9F9]'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={isActive ? 'Desactivar Modo Lluvia / Pico de Demanda' : 'Activar Modo Lluvia / Pico de Demanda'}
      >
        {isLoading ? (
          <span className="flex items-center space-x-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} fill="none"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Procesando...</span>
          </span>
        ) : (
          <span className="flex items-center space-x-2">
            <span>🌧️</span>
            <span>{isActive ? 'Pico de Demanda ACTIVO' : 'Modo Lluvia'}</span>
          </span>
        )}
      </button>

      {/* Configuración rápida cuando está activo */}
      {isActive && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-[#FFC300] shadow-lg rounded-sm z-50 p-4">
          <h4 className="text-sm font-bold text-[#111111] mb-3">⚙️ Configuración Rápida</h4>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[#111111] font-medium mb-1 block">
                Tiempo adicional (min): {config.estimatedTimeMinutes}
              </label>
              <input
                type="range"
                min="0"
                max="60"
                step="5"
                value={config.estimatedTimeMinutes}
                onChange={(e) => updateConfig({ estimatedTimeMinutes: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-xs text-[#111111] font-medium mb-1 block">
                Límite pedidos/hora: {config.maxOrdersPerHour || 'Sin límite'}
              </label>
              <input
                type="number"
                min="0"
                placeholder="Sin límite"
                value={config.maxOrdersPerHour || ''}
                onChange={(e) => updateConfig({ maxOrdersPerHour: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-2 py-1 border border-[#C7C7C7] rounded-sm text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-[#111111] font-medium mb-1 block">
                Multiplicador de precios: {(config.priceMultiplier * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="1.0"
                max="2.0"
                step="0.05"
                value={config.priceMultiplier}
                onChange={(e) => updateConfig({ priceMultiplier: parseFloat(e.target.value) })}
                className="w-full"
              />
              <p className="text-xs text-[#C7C7C7] mt-1">
                {config.priceMultiplier === 1.0 ? 'Precios normales' : `Precios +${((config.priceMultiplier - 1) * 100).toFixed(0)}%`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

