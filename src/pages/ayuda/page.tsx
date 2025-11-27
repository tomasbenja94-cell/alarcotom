import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const faqs = [
  {
    question: '¿Cómo hago un pedido?',
    answer: 'Elegí un local, seleccioná los productos que quieras, agregalos al carrito y completá el checkout. Podés pagar con efectivo, transferencia o Mercado Pago.',
    icon: 'ri-shopping-cart-2-line'
  },
  {
    question: '¿Cuánto tarda el envío?',
    answer: 'El tiempo de entrega varía según el local y tu ubicación. Generalmente entre 30 y 60 minutos. Podés seguir tu pedido en tiempo real desde el tracking.',
    icon: 'ri-time-line'
  },
  {
    question: '¿Puedo cancelar mi pedido?',
    answer: 'Podés cancelar tu pedido antes de que el local comience a prepararlo. Una vez en preparación, contactá al local directamente.',
    icon: 'ri-close-circle-line'
  },
  {
    question: '¿Cómo funcionan los cupones?',
    answer: 'Ingresá el código del cupón en la sección "Cupones" o durante el checkout. Los descuentos se aplican automáticamente si el cupón es válido.',
    icon: 'ri-coupon-line'
  },
  {
    question: '¿Qué métodos de pago aceptan?',
    answer: 'Aceptamos efectivo, transferencia bancaria y Mercado Pago. Los métodos disponibles pueden variar según el local.',
    icon: 'ri-bank-card-line'
  },
  {
    question: '¿Cómo contacto al local?',
    answer: 'Desde el detalle de tu pedido podés ver el número de WhatsApp del local para comunicarte directamente.',
    icon: 'ri-whatsapp-line'
  }
];

export default function AyudaPage() {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsLoaded(true), 100);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* Header premium */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600"></div>
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
                <i className="ri-customer-service-2-fill text-white text-2xl"></i>
              </div>
              <div>
                <h1 className="text-xl font-black text-white">Centro de Ayuda</h1>
                <p className="text-sm text-white/70">Estamos para ayudarte</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-5 -mt-2">
        {/* Contacto rápido */}
        <div className={`relative overflow-hidden bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-5 text-white shadow-xl shadow-green-500/20 transition-all duration-700 delay-200 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <i className="ri-whatsapp-fill text-2xl"></i>
              </div>
              <div>
                <h2 className="font-bold text-lg">¿Necesitás ayuda?</h2>
                <p className="text-sm text-white/80">Respondemos al instante</p>
              </div>
            </div>
            <a
              href="https://wa.me/5491100000000?text=Hola, necesito ayuda con mi pedido"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 bg-white text-green-600 px-5 py-3 rounded-xl font-bold text-sm shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              <i className="ri-whatsapp-line text-lg"></i>
              Escribinos por WhatsApp
              <i className="ri-arrow-right-line group-hover:translate-x-1 transition-transform"></i>
            </a>
          </div>
        </div>

        {/* FAQs */}
        <div className={`transition-all duration-700 delay-300 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <i className="ri-question-answer-fill text-blue-500"></i>
            Preguntas frecuentes
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className="bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden shadow-lg border border-white/50 animate-fadeInUp"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full px-4 py-4 flex items-center gap-3 text-left hover:bg-gray-50/50 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    openIndex === index 
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white' 
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    <i className={faq.icon}></i>
                  </div>
                  <span className="flex-1 font-semibold text-gray-900 text-sm">{faq.question}</span>
                  <i className={`ri-arrow-down-s-line text-gray-400 text-xl transition-transform duration-300 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}></i>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                }`}>
                  <div className="px-4 pb-4 pl-[68px]">
                    <p className="text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Más opciones */}
        <div className={`space-y-3 transition-all duration-700 delay-400 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <i className="ri-more-2-fill text-blue-500"></i>
            Más opciones
          </h2>
          
          <a
            href="mailto:soporte@negociosapp.com"
            className="group bg-white/90 backdrop-blur-xl rounded-2xl p-4 flex items-center gap-4 shadow-lg border border-white/50 hover:shadow-xl transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center shadow-lg shadow-rose-500/20 group-hover:scale-110 transition-transform">
              <i className="ri-mail-fill text-white text-xl"></i>
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900">Enviar email</p>
              <p className="text-xs text-gray-500">soporte@negociosapp.com</p>
            </div>
            <i className="ri-arrow-right-s-line text-gray-400 text-xl group-hover:translate-x-1 transition-transform"></i>
          </a>
          
          <button
            onClick={() => navigate('/acerca')}
            className="group w-full bg-white/90 backdrop-blur-xl rounded-2xl p-4 flex items-center gap-4 shadow-lg border border-white/50 text-left hover:shadow-xl transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-400 to-slate-500 flex items-center justify-center shadow-lg shadow-gray-500/20 group-hover:scale-110 transition-transform">
              <i className="ri-information-fill text-white text-xl"></i>
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900">Acerca de la app</p>
              <p className="text-xs text-gray-500">Versión, términos y más</p>
            </div>
            <i className="ri-arrow-right-s-line text-gray-400 text-xl group-hover:translate-x-1 transition-transform"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
