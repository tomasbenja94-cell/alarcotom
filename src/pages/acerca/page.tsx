import { useNavigate } from 'react-router-dom';

export default function AcercaPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100">
            <i className="ri-arrow-left-line text-gray-600"></i>
          </button>
          <h1 className="text-lg font-bold text-gray-800">Acerca de</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Logo y versión */}
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-rose-500 to-orange-500 rounded-2xl flex items-center justify-center">
            <i className="ri-shopping-bag-3-fill text-white text-3xl"></i>
          </div>
          <h2 className="text-xl font-bold text-gray-800">Negocios App</h2>
          <p className="text-sm text-gray-500 mt-1">Versión 1.0.0</p>
          <p className="text-xs text-gray-400 mt-2">Tu delivery favorito, ahora más cerca</p>
        </div>

        {/* Info */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <a
            href="/privacidad"
            className="flex items-center justify-between p-4 border-b border-gray-100"
          >
            <div className="flex items-center gap-3">
              <i className="ri-shield-check-line text-gray-500 text-xl"></i>
              <span className="text-sm text-gray-800">Política de privacidad</span>
            </div>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
          </a>
          <a
            href="/terminos"
            className="flex items-center justify-between p-4 border-b border-gray-100"
          >
            <div className="flex items-center gap-3">
              <i className="ri-file-text-line text-gray-500 text-xl"></i>
              <span className="text-sm text-gray-800">Términos y condiciones</span>
            </div>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
          </a>
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <i className="ri-instagram-line text-gray-500 text-xl"></i>
              <span className="text-sm text-gray-800">Seguinos en Instagram</span>
            </div>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
          </a>
        </div>

        {/* Créditos */}
        <div className="text-center text-xs text-gray-400 space-y-1">
          <p>Desarrollado con ❤️</p>
          <p>© 2025 Negocios App. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  );
}

