import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const faqs = [
  {
    question: '¿Cómo hago un pedido?',
    answer: 'Elegí un local, seleccioná los productos que quieras, agregalos al carrito y completá el checkout. Podés pagar con efectivo, transferencia o Mercado Pago.'
  },
  {
    question: '¿Cuánto tarda el envío?',
    answer: 'El tiempo de entrega varía según el local y tu ubicación. Generalmente entre 30 y 60 minutos. Podés seguir tu pedido en tiempo real desde el tracking.'
  },
  {
    question: '¿Puedo cancelar mi pedido?',
    answer: 'Podés cancelar tu pedido antes de que el local comience a prepararlo. Una vez en preparación, contactá al local directamente.'
  },
  {
    question: '¿Cómo funcionan los cupones?',
    answer: 'Ingresá el código del cupón en la sección "Cupones" o durante el checkout. Los descuentos se aplican automáticamente si el cupón es válido.'
  },
  {
    question: '¿Qué métodos de pago aceptan?',
    answer: 'Aceptamos efectivo, transferencia bancaria y Mercado Pago. Los métodos disponibles pueden variar según el local.'
  },
  {
    question: '¿Cómo contacto al local?',
    answer: 'Desde el detalle de tu pedido podés ver el número de WhatsApp del local para comunicarte directamente.'
  }
];

export default function AyudaPage() {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100">
            <i className="ri-arrow-left-line text-gray-600"></i>
          </button>
          <h1 className="text-lg font-bold text-gray-800">Ayuda</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Contacto rápido */}
        <div className="bg-gradient-to-r from-rose-500 to-orange-500 rounded-2xl p-4 text-white">
          <h2 className="font-semibold mb-2">¿Necesitás ayuda urgente?</h2>
          <p className="text-sm opacity-90 mb-3">Contactanos por WhatsApp y te respondemos al instante</p>
          <a
            href="https://wa.me/5491100000000?text=Hola, necesito ayuda con mi pedido"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white text-rose-500 px-4 py-2 rounded-xl font-medium text-sm"
          >
            <i className="ri-whatsapp-line text-lg"></i>
            Escribinos
          </a>
        </div>

        {/* FAQs */}
        <div>
          <h2 className="font-semibold text-gray-800 mb-3">Preguntas frecuentes</h2>
          <div className="space-y-2">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                >
                  <span className="font-medium text-gray-800 text-sm">{faq.question}</span>
                  <i className={`ri-arrow-down-s-line text-gray-400 transition-transform ${openIndex === index ? 'rotate-180' : ''}`}></i>
                </button>
                {openIndex === index && (
                  <div className="px-4 pb-4">
                    <p className="text-sm text-gray-600">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Otras opciones */}
        <div className="space-y-2">
          <h2 className="font-semibold text-gray-800 mb-3">Más opciones</h2>
          <a
            href="mailto:soporte@negociosapp.com"
            className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <i className="ri-mail-line text-gray-600"></i>
            </div>
            <div>
              <p className="font-medium text-gray-800 text-sm">Enviar email</p>
              <p className="text-xs text-gray-500">soporte@negociosapp.com</p>
            </div>
          </a>
          <button
            onClick={() => navigate('/acerca')}
            className="w-full bg-white rounded-xl p-4 flex items-center gap-3 shadow-sm text-left"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <i className="ri-information-line text-gray-600"></i>
            </div>
            <div>
              <p className="font-medium text-gray-800 text-sm">Acerca de la app</p>
              <p className="text-xs text-gray-500">Versión, términos y más</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

