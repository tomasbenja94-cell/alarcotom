
import { useNavigate } from 'react-router-dom';
import Button from '../../components/base/Button';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex flex-col items-center justify-center p-4">
      {/* Logo y Hero */}
      <div className="text-center mb-12">
        <div className="w-32 h-32 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl">
          <i className="ri-restaurant-fill text-white text-5xl"></i>
        </div>
        <h1 className="text-4xl font-bold text-gray-800 mb-2" style={{ fontFamily: '"Pacifico", serif' }}>
          El Buen Menú
        </h1>
        <p className="text-gray-600 text-lg mb-2">Comida casera deliciosa a domicilio</p>
        <p className="text-gray-500 text-sm">📍 Zona Norte • ⏱️ 30-45 min • 🚚 Envío gratis</p>
      </div>

      {/* Características destacadas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-4xl w-full">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 text-center shadow-lg border border-white/20">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-timer-line text-green-600 text-2xl"></i>
          </div>
          <h3 className="font-bold text-gray-800 mb-2">Entrega Rápida</h3>
          <p className="text-gray-600 text-sm">Tu pedido listo en 30-45 minutos</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 text-center shadow-lg border border-white/20">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-heart-fill text-blue-600 text-2xl"></i>
          </div>
          <h3 className="font-bold text-gray-800 mb-2">Comida Casera</h3>
          <p className="text-gray-600 text-sm">Cocinado con amor y tradicion</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 text-center shadow-lg border border-white/20">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-smartphone-line text-yellow-600 text-2xl"></i>
          </div>
          <h3 className="font-bold text-gray-800 mb-2">Pedí por WhatsApp</h3>
          <p className="text-gray-600 text-sm">Fácil, rápido y directo</p>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="space-y-4 w-full max-w-md">
        <Button
          onClick={() => navigate('/menu')}
          variant="primary"
          size="lg"
          icon="ri-restaurant-line"
          className="w-full"
        >
          Ver Menú Completo
        </Button>

        <div className="text-center">
          <p className="text-gray-500 text-sm mb-2">¿Necesitás ayuda?</p>
          <a
            href="https://wa.me/5493487207406"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 text-green-600 hover:text-green-700 font-medium"
          >
            <i className="ri-whatsapp-fill text-lg"></i>
            <span>Contactanos por WhatsApp</span>
          </a>
        </div>
      </div>

      {/* Información adicional */}
      <div className="mt-12 text-center">
        <div className="flex items-center justify-center space-x-6 text-gray-500 text-sm">
          <div className="flex items-center space-x-2">
            <i className="ri-time-line"></i>
            <span>Lun-Dom 11:00-23:00</span>
          </div>
          <div className="flex items-center space-x-2">
            <i className="ri-phone-line"></i>
            <span>+54 9 348 720-7406</span>
          </div>
        </div>
      </div>
    </div>
  );
}
