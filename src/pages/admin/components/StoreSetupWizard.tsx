import { useState, useEffect } from 'react';
import { useToast } from '../../../hooks/useToast';
import StoreSettings from './StoreSettings';

interface StoreSetupWizardProps {
  storeId?: string | null;
  onComplete: () => void;
}

export default function StoreSetupWizard({ storeId, onComplete }: StoreSetupWizardProps) {
  const { error: showError } = useToast();
  const [step, setStep] = useState(1);
  const [isEmpty, setIsEmpty] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (storeId) {
      checkIfEmpty();
    }
  }, [storeId]);

  const checkIfEmpty = async () => {
    if (!storeId) return;

    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`${apiUrl}/store-settings/${storeId}/is-empty`, {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });

      if (response.ok) {
        const data = await response.json();
        setIsEmpty(data.isEmpty);
        if (!data.isEmpty) {
          // Si la tienda ya está configurada, no mostrar wizard
          onComplete();
        }
      }
    } catch (error) {
      console.error('Error checking if store is empty:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Verificando configuración...</p>
        </div>
      </div>
    );
  }

  if (!isEmpty) {
    return null; // No mostrar wizard si la tienda ya está configurada
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#FFD523] to-[#FFE066] p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-black mb-1">Configuración Inicial</h2>
              <p className="text-black/70 text-sm">Completa la configuración de tu tienda</p>
            </div>
            <div className="text-4xl">🎉</div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center space-x-2">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`flex-1 h-2 rounded-full ${
                    s <= step ? 'bg-black' : 'bg-black/20'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-black/70 mt-2">Paso {step} de 4</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">🏪</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Bienvenido a tu Panel de Administración</h3>
                <p className="text-gray-600">
                  Tu tienda está vacía. Vamos a configurarla paso a paso para que puedas empezar a recibir pedidos.
                </p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-gray-900">En este wizard configurarás:</p>
                <ul className="text-sm text-gray-600 space-y-1 ml-4 list-disc">
                  <li>Datos generales y horarios</li>
                  <li>Métodos de entrega y pago</li>
                  <li>Tu primera categoría</li>
                  <li>Tu primer producto</li>
                </ul>
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full px-6 py-3 bg-[#FFD523] text-black rounded-lg font-semibold hover:bg-[#FFE066] transition-all"
              >
                Comenzar Configuración
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">⚙️</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Configuración General</h3>
                <p className="text-gray-600">
                  Configura los datos básicos, horarios y métodos de pago/entrega
                </p>
              </div>
              
              <div className="mb-4">
                <StoreSettings storeId={storeId} />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
                >
                  Atrás
                </button>
                <button
                  onClick={() => {
                    // Esperar un momento para que StoreSettings guarde los cambios
                    setTimeout(() => {
                      setStep(3);
                    }, 500);
                  }}
                  className="flex-1 px-6 py-3 bg-[#FFD523] text-black rounded-lg font-semibold hover:bg-[#FFE066] transition-all"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">📁</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Crea tu Primera Categoría</h3>
                <p className="text-gray-600">
                  Organiza tus productos en categorías (ej: Hamburguesas, Bebidas, Postres)
                </p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  💡 <strong>Tip:</strong> Puedes crear más categorías después desde la sección "Menú"
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
                >
                  Atrás
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 px-6 py-3 bg-[#FFD523] text-black rounded-lg font-semibold hover:bg-[#FFE066] transition-all"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">¡Configuración Completa!</h3>
                <p className="text-gray-600">
                  Ya puedes empezar a recibir pedidos. Recuerda crear productos desde la sección "Menú"
                </p>
              </div>
              
              <button
                onClick={async () => {
                  // Marcar wizard como completado creando settings básico si no existe
                  const currentStoreId = storeId || localStorage.getItem('adminStoreId');
                  if (currentStoreId) {
                    try {
                      const apiUrl = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
                      const token = localStorage.getItem('adminToken');
                      // Crear settings básico si no existe
                      const response = await fetch(`${apiUrl}/store-settings/${currentStoreId}`, {
                        method: 'PUT',
                        headers: {
                          'Content-Type': 'application/json',
                          ...(token && { 'Authorization': `Bearer ${token}` })
                        },
                        body: JSON.stringify({
                          deliveryEnabled: true,
                          pickupEnabled: true,
                          cashEnabled: true,
                          transferEnabled: false,
                          mercadoPagoEnabled: false
                        })
                      });
                      if (response.ok) {
                        console.log('✅ Settings creados/actualizados');
                      }
                    } catch (error) {
                      console.error('Error marking as configured:', error);
                    }
                  }
                  onComplete();
                }}
                className="w-full px-6 py-3 bg-[#FFD523] text-black rounded-lg font-semibold hover:bg-[#FFE066] transition-all"
              >
                Ir al Panel Principal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

