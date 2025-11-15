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
  const [redirecting, setRedirecting] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
          
          // Iniciar aviso de redirección después de 1.5 segundos
          setTimeout(() => {
            setRedirecting(true);
            setCountdown(3);
            
            // Contador regresivo de 3 segundos
            countdownIntervalRef.current = setInterval(() => {
              setCountdown((prev) => {
                const newCount = prev - 1;
                
                if (newCount <= 0) {
                  if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                  }
                  // Redirigir a WhatsApp
                  if (whatsappUrl) {
                    window.open(whatsappUrl, '_blank');
                  }
                  return 0;
                }
                
                return newCount;
              });
            }, 1000);
          }, 1500);
        }, 200);
      }
    }, interval);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [whatsappUrl]);

  const handleOpenWhatsApp = () => {
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center transform transition-all duration-500 animate-fadeInUp">
        {/* Estado de carga */}
        {loading && (
          <div className="space-y-6 animate-fadeIn">
            {/* Spinner animado con progreso circular */}
            <div className="relative w-40 h-40 mx-auto">
              {/* Círculo de fondo */}
              <div className="absolute inset-0 border-8 border-gray-100 rounded-full shadow-inner"></div>
              {/* Círculo de progreso SVG */}
              <svg className="absolute inset-0 transform -rotate-90 w-40 h-40">
                <circle
                  cx="80"
                  cy="80"
                  r="72"
                  fill="none"
                  stroke="rgb(34, 197, 94)"
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 72}`}
                  strokeDashoffset={`${2 * Math.PI * 72 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-100 ease-out drop-shadow-lg"
                  style={{ filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.5))' }}
                />
              </svg>
              {/* Icono de carga */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-5xl animate-spin" style={{ animationDuration: '1s' }}>🔄</div>
              </div>
              {/* Porcentaje */}
              <div className="absolute inset-0 flex items-end justify-center pb-10">
                <span className="text-2xl font-extrabold text-green-600 drop-shadow-md">{Math.round(progress)}%</span>
              </div>
            </div>
            
            {/* Barra de progreso adicional */}
            <div className="space-y-3">
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
                <div 
                  className="bg-gradient-to-r from-green-400 via-green-500 to-green-600 h-full rounded-full transition-all duration-100 ease-out shadow-lg flex items-center justify-end pr-3"
                  style={{ width: `${progress}%` }}
                >
                  {progress > 15 && (
                    <span className="text-xs font-bold text-white drop-shadow-md">Procesando...</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-600 font-semibold animate-pulse">
                Creando tu pedido...
              </p>
            </div>
            
            <div className="space-y-2 pt-4">
              <h3 className="text-2xl font-extrabold text-gray-800 animate-pulse">Procesando pedido</h3>
              <p className="text-sm text-gray-500">
                Por favor espera mientras registramos tu pedido...
              </p>
            </div>
          </div>
        )}

        {/* Estado de confirmación */}
        {!loading && confirmed && (
          <div className="space-y-6 animate-scaleIn">
            {/* Icono de confirmación animado con efecto de ondas */}
            <div className="relative w-40 h-40 mx-auto">
              {/* Ondas de pulso */}
              <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-75" style={{ animationDuration: '2s' }}></div>
              <div className="absolute inset-0 bg-green-200 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
              <div className="absolute inset-0 bg-green-300 rounded-full animate-pulse" style={{ animationDelay: '1s', opacity: 0.5 }}></div>
              
              {/* Círculo principal con gradiente */}
              <div className="relative w-40 h-40 bg-gradient-to-br from-green-400 via-green-500 to-green-600 rounded-full flex items-center justify-center shadow-2xl transform transition-all duration-500">
                {/* Checkmark animado */}
                <svg 
                  className="w-20 h-20 text-white" 
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
                    strokeWidth={4} 
                    d="M5 13l4 4L19 7" 
                  />
                </svg>
              </div>
            </div>
            
            {/* Mensaje de confirmación con animación progresiva */}
            <div className="space-y-4 animate-fadeInUp">
              <h2 className="text-4xl font-extrabold text-gray-800 animate-slideDown bg-gradient-to-r from-green-600 to-green-800 bg-clip-text text-transparent">
                ¡Pedido Confirmado!
              </h2>
              
              {/* Código de pedido destacado */}
              <div className="bg-gradient-to-r from-orange-100 via-red-100 to-orange-100 border-3 border-orange-400 rounded-2xl p-6 animate-scaleIn shadow-xl">
                <p className="text-sm text-gray-700 mb-2 font-semibold uppercase tracking-wide">Código de pedido</p>
                <p className="text-4xl font-extrabold text-orange-600 animate-pulse tracking-wider">
                  {orderNumber}
                </p>
              </div>
              
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                <p className="text-gray-700 font-semibold">
                  ✅ Tu pedido ha sido registrado correctamente
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Está listo para ser procesado y preparado
                </p>
              </div>
              
              {/* Aviso importante sobre el mensaje */}
              <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 mt-4">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl flex-shrink-0">⚠️</span>
                  <div>
                    <p className="text-gray-800 font-bold text-sm mb-2">
                      IMPORTANTE: Enviá el mensaje EXACTO
                    </p>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      Al abrir WhatsApp, enviá el mensaje <strong>tal como aparece</strong> sin agregar o quitar ningún dígito.
                      <br />
                      Si modificás el formato, el bot no podrá procesar tu consulta.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Información de WhatsApp con diseño mejorado */}
            <div className="bg-gradient-to-r from-green-50 via-green-100 to-blue-50 border-3 border-green-300 rounded-2xl p-6 animate-fadeIn shadow-lg">
              <div className="flex items-start space-x-4">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-xl animate-pulse">
                  <i className="ri-whatsapp-fill text-white text-3xl"></i>
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-extrabold text-green-800 mb-2 text-lg">Continuar por WhatsApp</h3>
                  <p className="text-sm text-green-700 mb-3 leading-relaxed">
                    El bot verificará tu pedido automáticamente y te mostrará los métodos de pago disponibles.
                  </p>
                  <div className="flex items-center space-x-2 text-xs text-green-600 bg-green-50 rounded-lg p-2">
                    <i className="ri-check-line text-green-600 font-bold"></i>
                    <span className="font-semibold">Verificación automática activada</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Aviso de redirección */}
            {redirecting && (
              <div className="bg-gradient-to-r from-green-100 via-green-50 to-blue-50 border-3 border-green-400 rounded-2xl p-6 animate-fadeIn shadow-lg mb-4">
                <div className="flex items-center justify-center space-x-4 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-xl animate-pulse">
                    <i className="ri-whatsapp-fill text-white text-3xl"></i>
                  </div>
                  <div className="text-center flex-1">
                    <h3 className="font-extrabold text-green-800 text-xl mb-2">
                      Redirigiendo a WhatsApp...
                    </h3>
                    <div className="flex items-center justify-center space-x-2 mb-2">
                      <span className="text-5xl font-extrabold text-green-600 animate-pulse drop-shadow-lg">
                        {countdown}
                      </span>
                      <span className="text-xl text-gray-600 font-semibold">
                        {countdown === 1 ? 'segundo' : 'segundos'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-full bg-green-200 rounded-full h-4 overflow-hidden shadow-inner mb-4">
                  <div 
                    className="bg-gradient-to-r from-green-500 via-green-600 to-green-700 h-full rounded-full transition-all duration-1000 ease-out shadow-lg"
                    style={{ width: `${((3 - countdown) / 3) * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 text-center mb-4 font-semibold">
                  Te redirigiremos automáticamente a WhatsApp
                </p>
                <button
                  onClick={() => {
                    if (countdownIntervalRef.current) {
                      clearInterval(countdownIntervalRef.current);
                    }
                    setRedirecting(false);
                  }}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-md border-2 border-gray-200 text-sm"
                >
                  Cancelar redirección
                </button>
              </div>
            )}

            {/* Botones de acción con animaciones */}
            {!redirecting && (
              <div className="space-y-4 animate-slideUp pt-2">
                <button
                  onClick={handleOpenWhatsApp}
                  className="w-full bg-gradient-to-r from-green-500 via-green-600 to-green-700 hover:from-green-600 hover:via-green-700 hover:to-green-800 text-white font-extrabold py-5 px-6 rounded-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-2xl hover:shadow-green-500/50 flex items-center justify-center space-x-3 text-lg animate-glow"
                >
                  <i className="ri-whatsapp-fill text-3xl"></i>
                  <span>Abrir WhatsApp</span>
                  <i className="ri-arrow-right-line text-2xl animate-pulse"></i>
                </button>

                <button
                  onClick={() => {
                    if (onBackToMenu) {
                      onBackToMenu();
                    } else {
                      navigate('/menu');
                    }
                  }}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-md border-2 border-gray-200"
                >
                  Volver al Menú
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

