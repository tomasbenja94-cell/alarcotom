import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface Coupon {
  id: string;
  code: string;
  discount: string;
  description: string;
  expires: string;
  used: boolean;
  type: 'percent' | 'fixed' | 'shipping';
}

export default function CuponesPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setTimeout(() => setIsLoaded(true), 100);
  }, []);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setMessage(null);
    
    setTimeout(() => {
      setLoading(false);
      setMessage({ type: 'error', text: 'Cupón no válido o expirado' });
    }, 1000);
  };

  const mockCoupons: Coupon[] = [
    { id: '1', code: 'BIENVENIDO10', discount: '10%', description: 'En tu primer pedido', expires: '31/12/2025', used: false, type: 'percent' },
    { id: '2', code: 'ENVIOGRATIS', discount: 'Envío gratis', description: 'En pedidos +$5000', expires: '15/12/2025', used: false, type: 'shipping' },
    { id: '3', code: 'DESCUENTO500', discount: '$500', description: 'En pedidos +$3000', expires: '01/12/2025', used: true, type: 'fixed' },
  ];

  const getTypeIcon = (type: Coupon['type']) => {
    switch (type) {
      case 'percent': return 'ri-percent-fill';
      case 'fixed': return 'ri-money-dollar-circle-fill';
      case 'shipping': return 'ri-truck-fill';
    }
  };

  const getTypeColor = (type: Coupon['type']) => {
    switch (type) {
      case 'percent': return 'from-purple-500 to-indigo-500';
      case 'fixed': return 'from-emerald-500 to-teal-500';
      case 'shipping': return 'from-amber-500 to-orange-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30">
      {/* Header premium */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-orange-500 to-red-500"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.3),transparent_60%)]"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        
        <div className={`relative px-4 pt-6 pb-6 transition-all duration-700 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)} 
              className="w-11 h-11 bg-white/20 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/30 hover:bg-white/30 transition-all"
            >
              <i className="ri-arrow-left-line text-white text-xl"></i>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/30">
                <i className="ri-coupon-3-fill text-white text-2xl"></i>
              </div>
              <div>
                <h1 className="text-xl font-black text-white">Mis Cupones</h1>
                <p className="text-sm text-white/70">{mockCoupons.filter(c => !c.used).length} disponibles</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-5 -mt-2">
        {/* Canjear cupón */}
        <div className={`bg-white/90 backdrop-blur-xl rounded-3xl p-5 shadow-lg border border-white/50 transition-all duration-700 delay-200 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <i className="ri-gift-2-fill text-amber-500"></i>
            Canjear cupón
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ingresá tu código"
              className="flex-1 px-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:outline-none focus:border-amber-500 focus:bg-white transition-all font-mono uppercase"
            />
            <button
              onClick={handleRedeem}
              disabled={loading || !code.trim()}
              className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/30 disabled:opacity-50 disabled:shadow-none hover:shadow-xl transition-all"
            >
              {loading ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                'Canjear'
              )}
            </button>
          </div>
          {message && (
            <div className={`mt-3 p-3 rounded-xl flex items-center gap-2 ${
              message.type === 'success' 
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                : 'bg-red-50 text-red-600 border border-red-200'
            }`}>
              <i className={message.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'}></i>
              <span className="text-sm font-medium">{message.text}</span>
            </div>
          )}
        </div>

        {/* Lista de cupones */}
        {!isAuthenticated ? (
          <div className={`bg-white/90 backdrop-blur-xl rounded-3xl p-8 text-center shadow-lg border border-white/50 transition-all duration-700 delay-300 ${
            isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl flex items-center justify-center">
              <i className="ri-coupon-3-line text-4xl text-amber-400"></i>
            </div>
            <p className="text-gray-900 font-bold text-lg mb-2">Iniciá sesión</p>
            <p className="text-gray-500 text-sm mb-5">Para ver tus cupones disponibles</p>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/30 hover:shadow-xl transition-all"
            >
              Iniciar sesión
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <i className="ri-ticket-2-fill text-amber-500"></i>
              Tus cupones
            </h2>
            {mockCoupons.map((coupon, idx) => (
              <div 
                key={coupon.id}
                className={`relative bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden shadow-lg border border-white/50 animate-fadeInUp ${
                  coupon.used ? 'opacity-60' : ''
                }`}
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {/* Ticket shape */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-gradient-to-br from-slate-50 via-white to-amber-50/30 rounded-r-full"></div>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-gradient-to-br from-slate-50 via-white to-amber-50/30 rounded-l-full"></div>
                
                <div className="flex">
                  {/* Lado izquierdo - descuento */}
                  <div className={`w-24 flex-shrink-0 bg-gradient-to-br ${getTypeColor(coupon.type)} p-4 flex flex-col items-center justify-center text-white`}>
                    <i className={`${getTypeIcon(coupon.type)} text-2xl mb-1`}></i>
                    <span className="text-lg font-black">{coupon.discount}</span>
                  </div>
                  
                  {/* Lado derecho - info */}
                  <div className="flex-1 p-4 pl-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-gray-900">{coupon.description}</p>
                        <p className="text-xs text-gray-500 mt-1 font-mono bg-gray-100 px-2 py-0.5 rounded inline-block">
                          {coupon.code}
                        </p>
                      </div>
                      {coupon.used && (
                        <span className="text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-1 rounded-lg">
                          USADO
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <i className="ri-calendar-line text-gray-400 text-sm"></i>
                      <span className="text-xs text-gray-500">Vence: {coupon.expires}</span>
                    </div>
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
