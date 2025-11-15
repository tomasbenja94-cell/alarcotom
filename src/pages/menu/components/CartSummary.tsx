import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions?: any;
  optionsText?: string[];
}

interface CartSummaryProps {
  cart: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  totalItems: number;
  totalPrice: number;
  onCheckout: () => void;
  onClose: () => void;
}

export default function CartSummary({
  cart,
  onUpdateQuantity,
  totalItems,
  totalPrice,
  onCheckout,
  onClose,
}: CartSummaryProps) {
  const navigate = useNavigate();
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const playClickSound = () => {
    // Crear sonido usando Web Audio API
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(600, audioContext.currentTime);

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.log('No se pudo reproducir el sonido:', error);
    }
  };

  const handleCheckout = () => {
    navigate('/checkout', { 
      state: { 
        cart: cart,
        total: totalPrice
      }
    });
    onCheckout();
    onClose();
  };

  // Prevenir scroll del body cuando el carrito está abierto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-50 animate-fadeIn"
      onClick={onClose}
      onTouchMove={(e) => {
        const target = e.target as HTMLElement;
        if (target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div 
        className="bg-white rounded-t-[2rem] w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col shadow-elegant-xl animate-slideInBottom"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Header mejorado */}
        <div className="p-5 border-b-2 border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Tu Pedido
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center shadow-sm"
          >
            <i className="ri-close-line text-gray-600 text-xl"></i>
          </button>
        </div>

        {/* Items del carrito mejorados */}
        <div 
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3 overscroll-contain"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {cart.map((item, index) => (
            <div 
              key={item.id} 
              className="flex items-center justify-between p-4 bg-gray-50 rounded-[2rem] border border-gray-200 hover:shadow-md transition-all duration-300 animate-fadeInUpStagger"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="flex-1 mr-3">
                <h4 className="font-bold text-gray-900 text-sm mb-1">{item.name}</h4>
                {/* Mostrar opciones seleccionadas detalladas */}
                {item.selectedOptions && item.selectedOptions.selectedOptions && item.selectedOptions.selectedOptions.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {item.selectedOptions.selectedOptions.map((option: any, optIndex: number) => (
                      <p key={optIndex} className="text-xs text-gray-600 bg-white px-2 py-1 rounded border border-gray-200 inline-block mr-1">
                        • {option.name} {option.price > 0 && <span className="text-orange-600 font-semibold">(+{formatPrice(option.price)})</span>}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-orange-600 font-bold text-base mt-2">{formatPrice(item.price)}</p>
              </div>

              <div className="flex items-center space-x-2 flex-shrink-0">
                <button
                  onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                  className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-300 hover:scale-110 active:scale-95 transition-all duration-200 shadow-sm"
                >
                  <i className="ri-subtract-line text-sm"></i>
                </button>
                <span className="w-8 text-center text-base font-bold text-gray-900">{item.quantity}</span>
                <button
                  onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                  className="w-8 h-8 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center text-white hover:from-orange-600 hover:to-orange-700 hover:scale-110 active:scale-95 transition-all duration-200 shadow-md"
                >
                  <i className="ri-add-line text-sm"></i>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer mejorado */}
        <div className="bg-gradient-to-r from-white to-orange-50/30 border-t-2 border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between p-4 bg-white rounded-[1.5rem] border-2 border-orange-200 shadow-sm">
            <span className="text-lg font-bold text-gray-800">Total:</span>
            <span className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
              {formatPrice(totalPrice)}
            </span>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-[1.5rem] p-4 shadow-sm">
            <div className="flex items-center space-x-3">
              <i className="ri-whatsapp-fill text-green-600 text-2xl"></i>
              <p className="text-sm text-green-800 font-semibold">Tu pedido se enviará por WhatsApp al restaurante</p>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-4 rounded-[1.5rem] font-bold hover:from-orange-600 hover:to-orange-700 transition-all duration-300 flex items-center justify-center space-x-2 text-base shadow-elegant-lg hover:shadow-xl hover:scale-105 active:scale-95"
          >
            <span>Continuar al checkout</span>
            <i className="ri-arrow-right-line text-xl"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
