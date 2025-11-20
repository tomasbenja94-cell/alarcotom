import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface CheckoutConfirmationProps {
  orderNumber: string;
  whatsappUrl: string;
  onBackToMenu?: () => void;
}

export default function CheckoutConfirmation({ orderNumber, whatsappUrl, onBackToMenu }: CheckoutConfirmationProps) {
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Animación de carga de 3 segundos
    const loadingDuration = 3000; // 3 segundos
    const interval = 100; // Actualizar cada 100ms
    const increment = 100 / (loadingDuration / interval);
    
    let currentProgress = 0;
    
    progressIntervalRef.current = setInterval(() => {
      currentProgress += increment;
      setProgress(Math.min(currentProgress, 100));
      
      if (currentProgress >= 100) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        setLoading(false);
        
        // Mostrar confirmación verde progresiva
        setTimeout(() => {
          setConfirmed(true);
        }, 200);
      }
    }, interval);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const handleCompletePayment = () => {
    if (whatsappUrl) {
      try {
        window.open(whatsappUrl, '_blank');
      } catch (error) {
        console.error('Error al abrir WhatsApp:', error);
        // Fallback: copiar URL al portapapeles o mostrar mensaje
        alert('Por favor, abre WhatsApp manualmente y envía el código de pedido.');
      }
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-green-50 flex items-center justify-center p-3 overflow-hidden">
      <div className="bg-white rounded-2xl shadow-xl p-4 max-w-md w-full text-center transform transition-all duration-500 animate-fadeInUp max-h-[95vh] flex flex-col">
        {/* Estado de carga */}
        {loading && (
          <div className="space-y-3 animate-fadeIn flex-1 flex flex-col items-center justify-center">
            {/* Spinner animado con progreso circular - más pequeño */}
            <div className="relative w-24 h-24 mx-auto">
              {/* Círculo de fondo */}
              <div className="absolute inset-0 border-4 border-gray-100 rounded-full shadow-inner"></div>
              {/* Círculo de progreso SVG */}
              <svg className="absolute inset-0 transform -rotate-90 w-24 h-24">
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="none"
                  stroke="rgb(34, 197, 94)"
                  strokeWidth="6"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-100 ease-out"
                />
              </svg>
              {/* Icono de carga */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-3xl animate-spin" style={{ animationDuration: '1s' }}>🔄</div>
              </div>
              {/* Porcentaje */}
              <div className="absolute inset-0 flex items-end justify-center pb-6">
                <span className="text-lg font-bold text-green-600">{Math.round(progress)}%</span>
              </div>
            </div>
            
            {/* Barra de progreso adicional - más pequeña */}
            <div className="space-y-2 w-full max-w-xs">
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-green-400 to-green-600 h-full rounded-full transition-all duration-100 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 font-medium">
                Creando tu pedido...
              </p>
            </div>
            
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-800">Procesando pedido</h3>
              <p className="text-xs text-gray-500">
                Por favor espera mientras registramos tu pedido...
              </p>
            </div>
          </div>
        )}

        {/* Estado de confirmación - compacto, sin scroll */}
        {!loading && confirmed && (
          <div className="space-y-3 animate-scaleIn flex-1 flex flex-col justify-between overflow-hidden">
            {/* Icono de confirmación - más pequeño */}
            <div className="relative w-20 h-20 mx-auto">
              {/* Ondas de pulso - más pequeñas */}
              <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-75" style={{ animationDuration: '2s' }}></div>
              
              {/* Círculo principal con gradiente - más pequeño */}
              <div className="relative w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                {/* Checkmark animado - más pequeño */}
                <svg 
                  className="w-10 h-10 text-white" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  style={{ 
                    strokeDasharray: 24, 
                    strokeDashoffset: 24,
                    animation: 'checkMarkDraw 0.8s ease-out 0.3s forwards'
                  }}
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={3} 
                    d="M5 13l4 4L19 7" 
                  />
                </svg>
              </div>
            </div>
            
            {/* Mensaje de confirmación - compacto */}
            <div className="space-y-2 animate-fadeInUp">
              <h2 className="text-2xl font-bold text-gray-800 bg-gradient-to-r from-green-600 to-green-800 bg-clip-text text-transparent">
                ¡Pedido Confirmado!
              </h2>
              
              {/* Código de pedido destacado - más compacto */}
              <div className="bg-gradient-to-r from-orange-100 to-orange-50 border-2 border-orange-300 rounded-xl p-3">
                <p className="text-xs text-gray-700 mb-1 font-semibold uppercase tracking-wide">Código de pedido</p>
                <p className="text-2xl font-bold text-orange-600 tracking-wider">
                  {orderNumber}
                </p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                <p className="text-sm text-gray-700 font-medium">
                  ✅ Tu pedido ha sido registrado correctamente
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Está listo para ser procesado y preparado
                </p>
              </div>
            </div>
            
            {/* Información de WhatsApp - compacta, sin mencionar bot */}
            <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-xl p-3">
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                  <i className="ri-whatsapp-fill text-white text-xl"></i>
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-bold text-green-800 text-sm mb-0.5">Continuar por WhatsApp</h3>
                  <p className="text-xs text-green-700 leading-tight">
                    Te mostraremos los métodos de pago disponibles para completar tu pedido.
                  </p>
                </div>
              </div>
            </div>

            {/* Botones de acción - más pequeños */}
            <div className="space-y-2 animate-slideUp pt-1">
              <button
                onClick={handleCompletePayment}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-2.5 px-4 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-green-500/50 flex items-center justify-center space-x-2 text-sm"
              >
                <i className="ri-whatsapp-fill text-lg"></i>
                <span>Continuar con el Pago</span>
                <i className="ri-arrow-right-line text-base"></i>
              </button>

              <button
                onClick={() => {
                  if (onBackToMenu) {
                    onBackToMenu();
                  } else {
                    navigate('/menu');
                  }
                }}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm border border-gray-200 text-sm"
              >
                Volver al Menú
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

