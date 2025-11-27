import { useState, useEffect } from 'react';

interface TutorialStep {
  title: string;
  description: string;
  image: string; // Emoji o descripción visual
  highlight?: string; // Qué elemento destacar
}

const tutorialSteps: TutorialStep[] = [
  {
    title: '¡Bienvenido al Panel de Administración!',
    description: 'Este es tu centro de control para gestionar todos los aspectos de tu negocio. Te guiaremos por las principales funciones.',
    image: '👋',
  },
  {
    title: '📦 Gestión de Pedidos',
    description: 'En la sección PEDIDOS puedes ver, aceptar, rechazar y gestionar todos los pedidos en tiempo real. Aquí verás el estado de cada pedido y podrás notificar a los clientes.',
    image: '📦',
    highlight: 'orders',
  },
  {
    title: '💳 Transferencias Pendientes',
    description: 'Revisa y confirma las transferencias bancarias de los clientes. Marca como pagadas cuando recibas el comprobante.',
    image: '💳',
    highlight: 'transfers',
  },
  {
    title: '👥 Gestión de Clientes',
    description: 'Administra la información de tus clientes, restricciones y preferencias. Puedes buscar, editar y gestionar restricciones de pago.',
    image: '👥',
    highlight: 'customers',
  },
  {
    title: '⚙️ Menú de Opciones Avanzadas',
    description: 'Haz clic en "MÁS" para acceder a funciones avanzadas como Dashboard, Ventas, Menú, Stock, Caja diaria, Reportes y más.',
    image: '⚙️',
    highlight: 'menu-admin',
  },
  {
    title: '📊 Dashboard y Reportes',
    description: 'Visualiza métricas de ventas, ingresos, tendencias y análisis en tiempo real. Accede desde el menú "MÁS" > Dashboard.',
    image: '📊',
  },
  {
    title: '🍽️ Gestión de Menú y Stock',
    description: 'Administra productos, categorías, recetas, ingredientes y controla el stock. Todo desde "MÁS" > Menú, Stock & Insumos.',
    image: '🍽️',
  },
  {
    title: '🛵 Repartidores y Empleados',
    description: 'Gestiona repartidores, sus balances y entregas. También administra empleados y sus permisos desde las opciones avanzadas.',
    image: '🛵',
  },
  {
    title: '🔔 Herramientas Rápidas',
    description: 'Usa los botones del header: Checklist diario, Sin Stock, Horario Especial, Modo Lluvia y Notificaciones para acceso rápido a funciones importantes.',
    image: '🔔',
  },
  {
    title: '✅ ¡Listo para comenzar!',
    description: 'Ya conoces las funciones principales. Puedes volver a ver este tutorial desde cualquier momento. ¡Empieza a gestionar tu negocio!',
    image: '✅',
  },
];

interface AdminTutorialProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function AdminTutorial({ onComplete, onSkip }: AdminTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showTutorial, setShowTutorial] = useState(true);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('admin_tutorial_completed', 'true');
    setShowTutorial(false);
    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem('admin_tutorial_completed', 'true');
    setShowTutorial(false);
    onSkip();
  };

  if (!showTutorial) return null;

  const step = tutorialSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tutorialSteps.length - 1;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scaleIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">Tutorial del Panel</h2>
              <p className="text-orange-100 text-sm">
                Paso {currentStep + 1} de {tutorialSteps.length}
              </p>
            </div>
            <button
              onClick={handleSkip}
              className="text-white hover:text-orange-200 transition-colors text-2xl font-bold"
              title="Saltar tutorial"
            >
              ×
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-gray-200">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / tutorialSteps.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Image/Icon */}
          <div className="text-center mb-6">
            <div className="text-8xl mb-4 animate-bounce">{step.image}</div>
            <h3 className="text-3xl font-bold text-gray-800 mb-3">{step.title}</h3>
            <p className="text-lg text-gray-600 leading-relaxed">{step.description}</p>
          </div>

          {/* Visual Guide */}
          {step.highlight && (
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-orange-800 font-medium">
                💡 <strong>Tip:</strong> Busca esta sección en el menú superior: <strong>{step.highlight === 'orders' ? 'PEDIDOS' : step.highlight === 'transfers' ? 'TRANSFERENCIAS' : step.highlight === 'customers' ? 'CLIENTES' : 'MÁS'}</strong>
              </p>
            </div>
          )}

          {/* Step Indicators */}
          <div className="flex justify-center space-x-2 mt-8 mb-6">
            {tutorialSteps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'bg-orange-500 w-8'
                    : index < currentStep
                    ? 'bg-orange-300 w-2'
                    : 'bg-gray-300 w-2'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="bg-gray-50 p-6 rounded-b-2xl flex items-center justify-between">
          <button
            onClick={handlePrevious}
            disabled={isFirstStep}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              isFirstStep
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            ← Anterior
          </button>

          <div className="flex space-x-3">
            <button
              onClick={handleSkip}
              className="px-6 py-3 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
            >
              Saltar
            </button>
            <button
              onClick={isLastStep ? handleComplete : handleNext}
              className="px-6 py-3 rounded-lg font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-all shadow-md"
            >
              {isLastStep ? '¡Comenzar!' : 'Siguiente →'}
            </button>
          </div>
        </div>
      </div>

      {/* Styles */}
      <style>{`
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

