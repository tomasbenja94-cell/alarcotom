
import { useNavigate } from 'react-router-dom';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <i className="ri-arrow-left-line text-xl text-gray-700"></i>
          </button>
          <h1 className="text-xl font-bold text-gray-800">Política de Privacidad</h1>
        </div>
      </div>

      <div className="p-4 pb-20">
        {/* Última actualización */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex items-center space-x-2 mb-2">
            <i className="ri-calendar-line text-red-500"></i>
            <span className="text-sm font-medium text-gray-600">Última actualización: Diciembre 2024</span>
          </div>
        </div>

        {/* Introducción */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Introducción</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-3">
            En El Buen Menú, nos comprometemos a proteger tu privacidad y manejar tus datos personales de manera responsable. Esta política explica cómo recopilamos, usamos y protegemos tu información.
          </p>
          <p className="text-gray-600 text-sm leading-relaxed">
            Al utilizar nuestros servicios, aceptas las prácticas descritas en esta política de privacidad.
          </p>
        </div>

        {/* Información que recopilamos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Información que Recopilamos</h2>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <i className="ri-user-line text-red-500 mt-1"></i>
              <div>
                <h3 className="font-semibold text-gray-800 text-sm">Datos Personales</h3>
                <p className="text-xs text-gray-600">Nombre, teléfono, dirección de entrega y preferencias alimentarias.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <i className="ri-shopping-cart-line text-red-500 mt-1"></i>
              <div>
                <h3 className="font-semibold text-gray-800 text-sm">Información de Pedidos</h3>
                <p className="text-xs text-gray-600">Historial de pedidos, productos favoritos y métodos de pago.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <i className="ri-smartphone-line text-red-500 mt-1"></i>
              <div>
                <h3 className="font-semibold text-gray-800 text-sm">Datos Técnicos</h3>
                <p className="text-xs text-gray-600">Dirección IP, tipo de dispositivo y ubicación para mejorar el servicio.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Cómo usamos tu información */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Cómo Usamos tu Información</h2>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Procesar y entregar tus pedidos</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Comunicarnos contigo sobre tu pedido</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Mejorar nuestro servicio y menú</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Enviarte ofertas y promociones (opcional)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Cumplir con obligaciones legales</span>
            </div>
          </div>
        </div>

        {/* Protección de datos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Protección de tus Datos</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-3">
            Implementamos medidas de seguridad técnicas y organizativas para proteger tu información personal contra acceso no autorizado, pérdida o alteración.
          </p>
          <div className="flex items-center space-x-2 bg-green-50 p-3 rounded-lg">
            <i className="ri-shield-check-line text-green-600"></i>
            <span className="text-sm text-green-700 font-medium">Tus datos están seguros con nosotros</span>
          </div>
        </div>

        {/* Compartir información */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Compartir Información</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-3">
            No vendemos ni compartimos tu información personal con terceros, excepto:
          </p>
          <div className="space-y-2">
            <div className="flex items-start space-x-2">
              <i className="ri-truck-line text-orange-500 mt-0.5 text-sm"></i>
              <span className="text-sm text-gray-600">Con nuestros repartidores para completar la entrega</span>
            </div>
            <div className="flex items-start space-x-2">
              <i className="ri-bank-card-line text-blue-500 mt-0.5 text-sm"></i>
              <span className="text-sm text-gray-600">Con procesadores de pago seguros</span>
            </div>
            <div className="flex items-start space-x-2">
              <i className="ri-scales-line text-purple-500 mt-0.5 text-sm"></i>
              <span className="text-sm text-gray-600">Cuando sea requerido por ley</span>
            </div>
          </div>
        </div>

        {/* Tus derechos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Tus Derechos</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-3">
            Tienes derecho a:
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 p-3 rounded-lg">
              <i className="ri-eye-line text-blue-500 mb-1 block"></i>
              <span className="text-xs font-medium text-gray-700">Acceder a tus datos</span>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <i className="ri-edit-line text-green-500 mb-1 block"></i>
              <span className="text-xs font-medium text-gray-700">Corregir información</span>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <i className="ri-delete-bin-line text-red-500 mb-1 block"></i>
              <span className="text-xs font-medium text-gray-700">Eliminar tus datos</span>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <i className="ri-mail-unread-line text-purple-500 mb-1 block"></i>
              <span className="text-xs font-medium text-gray-700">Cancelar promociones</span>
            </div>
          </div>
        </div>

        {/* Cookies */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Cookies y Tecnologías Similares</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-3">
            Utilizamos cookies para mejorar tu experiencia, recordar tus preferencias y analizar el uso de nuestro sitio.
          </p>
          <div className="bg-amber-50 p-3 rounded-lg flex items-start space-x-2">
            <i className="ri-information-line text-amber-600 mt-0.5"></i>
            <span className="text-sm text-amber-700">Puedes desactivar las cookies en tu navegador, pero esto puede afectar la funcionalidad del sitio.</span>
          </div>
        </div>

        {/* Contacto */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Contacto</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-3">
            Si tienes preguntas sobre esta política de privacidad o quieres ejercer tus derechos, contáctanos:
          </p>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <i className="ri-whatsapp-line text-green-500"></i>
              <span className="text-sm text-gray-700">WhatsApp: +54 3487 302858</span>
            </div>
            <div className="flex items-center space-x-2">
              <i className="ri-mail-line text-blue-500"></i>
              <span className="text-sm text-gray-700">Email: privacidad@elbuenmenu.com</span>
            </div>
          </div>
        </div>

        {/* Cambios en la política */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Cambios en esta Política</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Podemos actualizar esta política ocasionalmente. Te notificaremos sobre cambios importantes a través de nuestro sitio web o por WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
