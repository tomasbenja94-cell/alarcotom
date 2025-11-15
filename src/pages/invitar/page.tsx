import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function InvitarPage() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref');
  const [isRegistered, setIsRegistered] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    // Guardar referencia pendiente cuando alguien entra al link
    if (ref && ref.includes('@lid')) {
      // Registrar referencia pendiente en el backend
      registerPendingReferral(ref);
      setIsRegistered(true);
    }
  }, [ref]);

  const registerPendingReferral = async (referrerId: string) => {
    try {
      // Obtener el ID del visitante (si está disponible)
      // Por ahora guardamos en localStorage y el backend lo procesará cuando hagan el pedido
      localStorage.setItem('pending_referrer', referrerId);
      
      // Intentar registrar en el backend si tenemos el ID del visitante
      // Esto se completará cuando el cliente haga su primer pedido desde WhatsApp
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      
      // Nota: El backend registrará el referido cuando se cree el pedido
      // usando el customerPhone del pedido como referredId
      
    } catch (error) {
      console.error('Error registrando referencia pendiente:', error);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-[#FFC300] rounded-sm shadow-lg p-8 text-center">
        {!ref ? (
          <>
            <div className="text-6xl mb-4">🎁</div>
            <h1 className="text-2xl font-bold text-[#111111] mb-4">Sistema de Referidos</h1>
            <p className="text-sm text-[#C7C7C7] mb-6">
              Este link debe contener una referencia válida
            </p>
          </>
        ) : !ref.includes('@lid') ? (
          <>
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-[#111111] mb-4">Referencia Inválida</h1>
            <p className="text-sm text-[#C7C7C7] mb-6">
              La referencia proporcionada no es válida
            </p>
          </>
        ) : isRegistered ? (
          <>
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-[#111111] mb-4">¡Bienvenido!</h1>
            <p className="text-sm text-[#C7C7C7] mb-2">
              Has sido referido por un cliente de El Buen Menú
            </p>
            <p className="text-xs text-[#C7C7C7] mb-6 font-mono">
              Ref: {ref}
            </p>
            <div className="bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm p-4 mb-6">
              <p className="text-sm text-[#111111] mb-2">
                🎉 Al realizar tu primer pedido válido recibirás:
              </p>
              <p className="text-lg font-bold text-[#111111] mb-2">+5 puntos</p>
              <p className="text-xs text-[#C7C7C7]">
                Y quien te invitó recibirá +100 puntos
              </p>
            </div>
            <p className="text-sm text-[#111111] mb-4">
              Escribe a nuestro WhatsApp para hacer tu pedido:
            </p>
            <a
              href="https://wa.me/5493487207406"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 bg-[#111111] text-white border border-[#FFC300] rounded-sm hover:bg-[#1A1A1A] transition-all font-medium"
            >
              💬 Ir a WhatsApp
            </a>
          </>
        ) : (
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#111111]"></div>
            <p className="mt-4 text-sm text-[#C7C7C7]">Registrando referencia...</p>
          </div>
        )}
      </div>
    </div>
  );
}

