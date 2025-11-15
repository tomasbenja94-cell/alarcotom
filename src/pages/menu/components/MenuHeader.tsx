
import { useEffect, useState } from 'react';

interface MenuHeaderProps {
  cartItemsCount: number;
  onCartClick: () => void;
}

export default function MenuHeader({ cartItemsCount, onCartClick }: MenuHeaderProps) {
  const [isShaking, setIsShaking] = useState(false);
  const [prevCount, setPrevCount] = useState(0);

  useEffect(() => {
    // Si el contador aumentó, activar animación de sacudida
    if (cartItemsCount > prevCount && cartItemsCount > 0) {
      setIsShaking(true);
      
      // Quitar la animación después de 600ms
      setTimeout(() => {
        setIsShaking(false);
      }, 600);
    }
    
    setPrevCount(cartItemsCount);
  }, [cartItemsCount, prevCount]);

  const playClickSound = () => {
    // Crear y reproducir el sonido de clic del mouse
    const audio = new Audio('https://www.myinstants.com/media/sounds/mouse-click-sound-effect.mp3');
    audio.volume = 0.3; // Volumen al 30%
    audio.play().catch(error => {
      console.log('No se pudo reproducir el sonido:', error);
    });
  };

  const handleCartClick = () => {
    playClickSound();
    onCartClick();
  };

  return (
    <div className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-md shadow-elegant-lg border-b border-gray-100 z-40 animate-slideDown">
      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full overflow-hidden shadow-elegant border-2 border-orange-200 hover:scale-110 transition-transform duration-300">
              <img 
                src="https://static.readdy.ai/image/579dc380da62aab76f072e02550f7c3a/332b1be8324fefebf657042245060b3e.png"
                alt="El Buen Menú Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
                El Buen Menú
              </h1>
              <p className="text-xs text-gray-500 font-medium">Comida casera deliciosa</p>
            </div>
          </div>
          
          <button
            onClick={handleCartClick}
            className={`relative bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3.5 rounded-full hover:from-orange-600 hover:to-orange-700 transition-all duration-300 shadow-elegant-lg hover:shadow-xl hover:scale-110 active:scale-95 ${
              isShaking ? 'animate-shake' : ''
            }`}
          >
            <i className="ri-shopping-cart-2-line text-xl"></i>
            {cartItemsCount > 0 && (
              <span className={`absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs rounded-full w-7 h-7 flex items-center justify-center font-bold transition-all duration-300 shadow-lg border-2 border-white ${
                isShaking ? 'scale-125 animate-pulse' : 'scale-100'
              }`}>
                {cartItemsCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
