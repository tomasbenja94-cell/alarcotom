import { useState, useEffect } from 'react';

interface NoStockButtonProps {
  onStateChange?: (isActive: boolean) => void;
}

export default function NoStockButton({ onStateChange }: NoStockButtonProps) {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // Cargar estado actual al montar
  useEffect(() => {
    loadNoStockState();
  }, []);

  const loadNoStockState = async () => {
    try {
      const response = await fetch(`${API_URL}/api/system/no-stock-state`);
      if (response.ok) {
        const data = await response.json();
        setIsActive(data.noStockMode || false);
        if (onStateChange) onStateChange(data.noStockMode || false);
      }
    } catch (error) {
      console.error('Error cargando estado sin stock:', error);
    }
  };

  const toggleNoStockMode = async () => {
    if (!confirm(
      isActive 
        ? '¿Desactivar "Sin Stock"?\n\nEsto permitirá recibir pedidos nuevamente.'
        : '¿Activar "Sin Stock"?\n\nEsto hará:\n• Bloquear pedidos nuevos\n• Avisar globalmente que no hay stock\n• Se reseteará automáticamente a las 00:00'
    )) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/system/no-stock-mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: !isActive
        })
      });

      if (response.ok) {
        const data = await response.json();
        setIsActive(data.noStockMode);
        if (onStateChange) onStateChange(data.noStockMode);
        
        alert(
          data.noStockMode
            ? '⚠️ Sin Stock ACTIVADO\n\n• Pedidos nuevos bloqueados\n• Aviso global activo\n• Reset automático a las 00:00'
            : '✅ Sin Stock DESACTIVADO\n\n• Sistema operativo normal'
        );
      } else {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        alert(`❌ Error: ${error.error || 'Error al cambiar estado sin stock'}`);
      }
    } catch (error: any) {
      console.error('Error al cambiar estado sin stock:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={toggleNoStockMode}
      disabled={isLoading}
      className={`px-4 py-2 text-xs font-medium transition-all border rounded ${
        isActive
          ? 'bg-[#111111] text-white border-[#FFC300] hover:bg-[#1A1A1A]'
          : 'bg-white text-[#111111] border-[#C7C7C7] hover:bg-[#F9F9F9]'
      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={isActive ? 'Desactivar Sin Stock' : 'Activar Sin Stock'}
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
          <span>⚠️</span>
          <span>{isActive ? 'Sin Stock ACTIVO' : 'Sin Stock'}</span>
        </span>
      )}
    </button>
  );
}

