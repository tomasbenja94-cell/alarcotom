import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function AcercaPage() {
  const navigate = useNavigate();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsLoaded(true), 100);
  }, []);

  const links = [
    { icon: 'ri-shield-check-fill', label: 'Política de privacidad', href: '/privacidad', color: 'from-blue-400 to-indigo-500' },
    { icon: 'ri-file-text-fill', label: 'Términos y condiciones', href: '/terminos', color: 'from-purple-400 to-violet-500' },
    { icon: 'ri-instagram-fill', label: 'Seguinos en Instagram', href: 'https://instagram.com', external: true, color: 'from-pink-400 to-rose-500' },
    { icon: 'ri-facebook-circle-fill', label: 'Facebook', href: 'https://facebook.com', external: true, color: 'from-blue-500 to-blue-600' },
  ];

  const features = [
    { icon: 'ri-truck-fill', label: 'Envío rápido' },
    { icon: 'ri-secure-payment-fill', label: 'Pago seguro' },
    { icon: 'ri-customer-service-2-fill', label: 'Soporte 24/7' },
    { icon: 'ri-gift-fill', label: 'Promociones' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Elementos decorativos */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <div className={`relative px-4 pt-6 pb-4 transition-all duration-700 ${
        isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}>
        <button 
          onClick={() => navigate(-1)} 
          className="w-11 h-11 bg-white/10 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/20 hover:bg-white/20 transition-all"
        >
          <i className="ri-arrow-left-line text-white text-xl"></i>
        </button>
      </div>

      <div className="relative p-4 max-w-md mx-auto space-y-6">
        {/* Logo y versión */}
        <div className={`text-center transition-all duration-700 delay-200 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <div className="relative inline-block mb-5">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF3366] to-rose-500 rounded-3xl blur-2xl opacity-50"></div>
            <div className="relative w-24 h-24 bg-gradient-to-br from-[#FF3366] via-rose-500 to-pink-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-rose-500/30">
              <i className="ri-shopping-bag-3-fill text-white text-5xl"></i>
            </div>
          </div>
          <h1 className="text-3xl font-black text-white mb-1">Negocios App</h1>
          <p className="text-white/50 text-sm font-medium">Versión 1.0.0</p>
          <p className="text-white/70 text-sm mt-3">Tu delivery favorito, ahora más cerca 🚀</p>
        </div>

        {/* Features */}
        <div className={`grid grid-cols-4 gap-3 transition-all duration-700 delay-300 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          {features.map((feature, idx) => (
            <div key={feature.label} className="text-center" style={{ animationDelay: `${idx * 100}ms` }}>
              <div className="w-12 h-12 mx-auto bg-white/10 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/10 mb-2">
                <i className={`${feature.icon} text-white text-xl`}></i>
              </div>
              <p className="text-[10px] text-white/60 font-medium">{feature.label}</p>
            </div>
          ))}
        </div>

        {/* Links */}
        <div className={`bg-white/10 backdrop-blur-xl rounded-3xl overflow-hidden border border-white/10 transition-all duration-700 delay-400 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          {links.map((link, idx) => {
            const Component = link.external ? 'a' : 'button';
            const props = link.external 
              ? { href: link.href, target: '_blank', rel: 'noopener noreferrer' }
              : { onClick: () => navigate(link.href) };
            
            return (
              <Component
                key={link.label}
                {...props as any}
                className={`group w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-all text-left ${
                  idx !== links.length - 1 ? 'border-b border-white/10' : ''
                }`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${link.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                  <i className={`${link.icon} text-white text-lg`}></i>
                </div>
                <span className="flex-1 text-white font-medium text-sm">{link.label}</span>
                <i className="ri-arrow-right-s-line text-white/40 text-xl group-hover:translate-x-1 transition-transform"></i>
              </Component>
            );
          })}
        </div>

        {/* Stats */}
        <div className={`grid grid-cols-3 gap-3 transition-all duration-700 delay-500 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          {[
            { value: '10K+', label: 'Usuarios' },
            { value: '50+', label: 'Locales' },
            { value: '4.9', label: 'Rating' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 text-center border border-white/10">
              <p className="text-2xl font-black text-white">{stat.value}</p>
              <p className="text-xs text-white/50 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Créditos */}
        <div className={`text-center pt-6 transition-all duration-700 delay-600 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}>
          <p className="text-white/40 text-xs mb-2">
            Desarrollado con <span className="text-red-400">❤️</span> en Argentina
          </p>
          <p className="text-white/30 text-xs">
            © 2025 Negocios App. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
