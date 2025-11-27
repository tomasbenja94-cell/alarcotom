import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function CuponesPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setMessage(null);
    
    // Simular validación
    setTimeout(() => {
      setLoading(false);
      setMessage({ type: 'error', text: 'Cupón no válido o expirado' });
    }, 1000);
  };

  const mockCoupons = [
    { id: '1', code: 'BIENVENIDO10', discount: '10%', description: 'Primer pedido', expires: '31/12/2025', used: false },
    { id: '2', code: 'ENVIOGRATIS', discount: 'Envío gratis', description: 'Pedidos +$5000', expires: '15/12/2025', used: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100">
            <i className="ri-arrow-left-line text-gray-600"></i>
          </button>
          <h1 className="text-lg font-bold text-gray-800">Mis Cupones</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Canjear cupón */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-3">Canjear cupón</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ingresá tu código"
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <button
              onClick={handleRedeem}
              disabled={loading || !code.trim()}
              className="px-6 py-3 bg-rose-500 text-white font-medium rounded-xl disabled:opacity-50"
            >
              {loading ? '...' : 'Canjear'}
            </button>
          </div>
          {message && (
            <p className={`mt-2 text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </p>
          )}
        </div>

        {/* Lista de cupones */}
        {!isAuthenticated ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <i className="ri-coupon-3-line text-4xl text-gray-300 mb-3"></i>
            <p className="text-gray-500 mb-4">Iniciá sesión para ver tus cupones</p>
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-2 bg-rose-500 text-white rounded-xl"
            >
              Iniciar sesión
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-800">Tus cupones</h2>
            {mockCoupons.map(coupon => (
              <div 
                key={coupon.id} 
                className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 ${
                  coupon.used ? 'border-gray-300 opacity-60' : 'border-rose-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-rose-500 text-lg">{coupon.discount}</p>
                    <p className="text-sm text-gray-600">{coupon.description}</p>
                    <p className="text-xs text-gray-400 mt-1">Código: {coupon.code}</p>
                  </div>
                  <div className="text-right">
                    {coupon.used ? (
                      <span className="text-xs text-gray-400">Usado</span>
                    ) : (
                      <span className="text-xs text-gray-500">Vence: {coupon.expires}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

