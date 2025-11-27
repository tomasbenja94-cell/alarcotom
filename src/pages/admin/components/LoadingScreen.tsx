import { useEffect, useState } from 'react';

interface LoadingScreenProps {
  onComplete: () => void;
}

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [showGlitch, setShowGlitch] = useState(false);

  useEffect(() => {
    // Reproducir sonido de inicio (si está disponible)
    const playSound = () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {
        // Silenciar si no se puede reproducir sonido
      }
    };

    playSound();

    // Animación de progreso
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setShowGlitch(true);
          setTimeout(() => {
            onComplete();
          }, 200);
          return 100;
        }
        return prev + 2;
      });
    }, 20);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
      <div className="w-full max-w-2xl px-8">
        {/* Título del sistema */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-mono text-cyan-400 mb-2" style={{ textShadow: '0 0 20px #00ffff' }}>
            SYSTEM INITIALIZING
          </h1>
          <p className="text-cyan-300 text-sm font-mono opacity-80">El Buen Menú - Admin Panel</p>
        </div>

        {/* Barra de progreso futurista */}
        <div className="relative">
          {/* Fondo de la barra */}
          <div className="h-8 bg-gray-900 border-2 border-cyan-500 rounded-sm overflow-hidden relative">
            {/* Barra de progreso con efecto neón */}
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400 relative"
              style={{
                width: `${progress}%`,
                boxShadow: '0 0 20px #00ffff, inset 0 0 20px rgba(0, 255, 255, 0.5)',
                transition: 'width 0.02s linear'
              }}
            >
              {/* Efecto de brillo animado */}
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-50"
                style={{
                  animation: 'shimmer 1s infinite',
                  transform: 'translateX(-100%)'
                }}
              />
            </div>
            
            {/* Texto de porcentaje */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-cyan-400 font-bold text-sm" style={{ textShadow: '0 0 10px #00ffff' }}>
                {progress}%
              </span>
            </div>
          </div>

          {/* Líneas decorativas */}
          <div className="absolute -top-1 left-0 w-full h-1 bg-cyan-400 opacity-50" style={{ boxShadow: '0 0 10px #00ffff' }} />
          <div className="absolute -bottom-1 left-0 w-full h-1 bg-cyan-400 opacity-50" style={{ boxShadow: '0 0 10px #00ffff' }} />
        </div>

        {/* Información del sistema */}
        <div className="mt-6 text-center">
          <div className="font-mono text-xs text-cyan-400 space-y-1">
            <div className="flex justify-between">
              <span>LOADING CORE MODULES...</span>
              <span className="text-green-400">✓</span>
            </div>
            <div className="flex justify-between">
              <span>INITIALIZING DATABASE...</span>
              <span className={progress > 50 ? 'text-green-400' : 'text-cyan-400'}>{progress > 50 ? '✓' : '...'}</span>
            </div>
            <div className="flex justify-between">
              <span>ESTABLISHING CONNECTION...</span>
              <span className={progress > 80 ? 'text-green-400' : 'text-cyan-400'}>{progress > 80 ? '✓' : '...'}</span>
            </div>
          </div>
        </div>

        {/* Efecto de glitch al finalizar */}
        {showGlitch && (
          <div
            className="absolute inset-0 bg-cyan-400 opacity-20"
            style={{
              animation: 'glitch 0.2s',
              pointerEvents: 'none'
            }}
          />
        )}

        {/* Estilos CSS */}
        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          @keyframes glitch {
            0% { transform: translate(0); opacity: 0; }
            25% { transform: translate(-5px, 5px); opacity: 0.3; }
            50% { transform: translate(5px, -5px); opacity: 0.3; }
            75% { transform: translate(-5px, -5px); opacity: 0.3; }
            100% { transform: translate(0); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}

