import { useState, useEffect } from 'react';

interface SpecialHours {
  isActive: boolean;
  startTime?: string;
  endTime?: string;
  expiresAt?: string;
}

export default function SpecialHoursButton() {
  const [specialHours, setSpecialHours] = useState<SpecialHours | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('00:00');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // Cargar estado actual al montar
  useEffect(() => {
    loadSpecialHours();
    // Verificar cada minuto si expiró
    const interval = setInterval(loadSpecialHours, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadSpecialHours = async () => {
    try {
      const response = await fetch(`${API_URL}/api/system/special-hours`);
      if (response.ok) {
        const data = await response.json();
        setSpecialHours(data);
      }
    } catch (error) {
      console.error('Error cargando horarios especiales:', error);
    }
  };

  const activateSpecialHours = async () => {
    if (!startTime || !endTime) {
      alert('❌ Por favor, completá los horarios de inicio y fin.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/system/special-hours`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startTime,
          endTime
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSpecialHours(data);
        setShowModal(false);
        alert(
          `✅ Horario Especial ACTIVADO\n\n` +
          `⏰ Horario: ${startTime} a ${endTime} (${formatTime24To12(startTime)} - ${formatTime24To12(endTime)})\n\n` +
          `📅 Válido por 1 día\n` +
          `🔄 Se reseteará automáticamente mañana`
        );
      } else {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        alert(`❌ Error: ${error.error || 'Error al activar horario especial'}`);
      }
    } catch (error: any) {
      console.error('Error al activar horario especial:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const deactivateSpecialHours = async () => {
    if (!confirm('¿Desactivar Horario Especial?\n\nVolverá al horario normal (18:00 - 00:00).')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/system/special-hours`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSpecialHours(null);
        alert('✅ Horario Especial DESACTIVADO\n\n• Sistema operativo con horario normal');
      } else {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        alert(`❌ Error: ${error.error || 'Error al desactivar horario especial'}`);
      }
    } catch (error: any) {
      console.error('Error al desactivar horario especial:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatExpiresAt = (expiresAt?: string) => {
    if (!expiresAt) return '';
    const date = new Date(expiresAt);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime24To12 = (time24: string) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={isLoading}
        className={`px-4 py-2 text-xs font-medium transition-all border rounded ${
          specialHours?.isActive
            ? 'bg-[#111111] text-white border-[#FFC300] hover:bg-[#1A1A1A]'
            : 'bg-white text-[#111111] border-[#C7C7C7] hover:bg-[#F9F9F9]'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={specialHours?.isActive ? 'Horario Especial Activo' : 'Configurar Horario Especial'}
      >
        <span className="flex items-center space-x-2">
          <span>🕐</span>
          <span>
            {specialHours?.isActive 
              ? `Horario: ${specialHours.startTime} - ${specialHours.endTime}`
              : 'Horario Especial'
            }
          </span>
        </span>
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 border border-[#FFC300]">
            <h2 className="text-xl font-bold text-[#111111] mb-4">
              {specialHours?.isActive ? 'Horario Especial Activo' : 'Configurar Horario Especial'}
            </h2>

            {specialHours?.isActive ? (
              <div className="space-y-4">
                <div className="bg-[#F9F9F9] border border-[#C7C7C7] rounded p-4">
                  <p className="text-sm text-[#111111] mb-2">
                    <strong>Horario especial activo:</strong>
                  </p>
                  <p className="text-lg font-semibold text-[#111111] mb-1">
                    {specialHours.startTime} - {specialHours.endTime}
                  </p>
                  <p className="text-xs text-[#C7C7C7] mb-2">
                    ({formatTime24To12(specialHours.startTime || '')} - {formatTime24To12(specialHours.endTime || '')})
                  </p>
                  {specialHours.expiresAt && (
                    <p className="text-xs text-[#C7C7C7] mt-2">
                      ⏰ Expira: {formatExpiresAt(specialHours.expiresAt)}
                    </p>
                  )}
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={deactivateSpecialHours}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-white text-[#111111] border border-[#C7C7C7] rounded hover:bg-[#F9F9F9] transition-all disabled:opacity-50"
                  >
                    Desactivar
                  </button>
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 bg-[#111111] text-white border border-[#FFC300] rounded hover:bg-[#1A1A1A] transition-all"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-[#C7C7C7] mb-4">
                  Configurá un horario especial para hoy. Se reseteará automáticamente mañana.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-[#111111] mb-1">
                      Hora de inicio (formato 24 horas)
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 border border-[#C7C7C7] rounded focus:outline-none focus:ring-2 focus:ring-[#FFC300] focus:border-transparent"
                    />
                    {startTime && (
                      <p className="text-xs text-[#C7C7C7] mt-1">
                        {formatTime24To12(startTime)} - Formato 24h: {startTime}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#111111] mb-1">
                      Hora de fin (formato 24 horas)
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3 py-2 border border-[#C7C7C7] rounded focus:outline-none focus:ring-2 focus:ring-[#FFC300] focus:border-transparent"
                    />
                    {endTime && (
                      <p className="text-xs text-[#C7C7C7] mt-1">
                        {formatTime24To12(endTime)} - Formato 24h: {endTime}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 bg-white text-[#111111] border border-[#C7C7C7] rounded hover:bg-[#F9F9F9] transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={activateSpecialHours}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-[#111111] text-white border border-[#FFC300] rounded hover:bg-[#1A1A1A] transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Activando...' : 'Activar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

