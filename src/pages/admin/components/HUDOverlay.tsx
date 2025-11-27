import { useState, useEffect, useRef } from 'react';

interface HUDOverlayProps {
  children: React.ReactNode;
  showLoading?: boolean;
}

export default function HUDOverlay({ children, showLoading = false }: HUDOverlayProps) {
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showHUD, setShowHUD] = useState(!showLoading); // Mostrar HUD inmediatamente si no hay loading
  const [glitchActive, setGlitchActive] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (showLoading) {
      // Animación de carga
      setLoadingProgress(0);
      setShowHUD(false);
      
      const progressInterval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 100) {
            clearInterval(progressInterval);
            // Efecto glitch antes de mostrar
            setGlitchActive(true);
            setTimeout(() => {
              setGlitchActive(false);
              setShowHUD(true);
            }, 200);
            return 100;
          }
          return prev + 2;
        });
      }, 20);

      // Sonido de inicio (opcional)
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {
        // Ignorar si no hay soporte de audio
      }

      return () => clearInterval(progressInterval);
    } else {
      // Si no hay loading, mostrar HUD inmediatamente
      setShowHUD(true);
    }
  }, [showLoading]);
  
  // Asegurar que el HUD se muestre si no hay loading
  useEffect(() => {
    if (!showLoading && !showHUD) {
      setShowHUD(true);
    }
  }, [showLoading, showHUD]);

  return (
    <>
      <style>{`
        @keyframes scanLine {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        
        @keyframes glitch {
          0%, 100% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes hologramAppear {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
            filter: blur(10px) drop-shadow(0 0 0 rgba(0, 255, 255, 0));
          }
          50% {
            opacity: 0.8;
            filter: blur(5px) drop-shadow(0 0 20px rgba(0, 255, 255, 0.5));
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0) drop-shadow(0 0 10px rgba(0, 255, 255, 0.3));
          }
        }
        
        .hud-grid {
          background-image: 
            linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 50px 50px;
        }
        
        .neon-glow {
          box-shadow: 
            0 0 5px rgba(0, 255, 255, 0.5),
            0 0 10px rgba(0, 255, 255, 0.3),
            0 0 15px rgba(0, 255, 255, 0.2);
        }
      `}</style>

      {/* Loading Screen */}
      {showLoading && loadingProgress < 100 && (
        <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center">
          <div className="w-full max-w-2xl px-8">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-cyan-400 font-mono text-sm">INITIALIZING SYSTEM...</span>
                <span className="text-cyan-400 font-mono text-sm">{loadingProgress}%</span>
              </div>
              <div className="h-2 bg-black border border-cyan-500/50 rounded overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-100 ease-out relative"
                  style={{ width: `${loadingProgress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
                </div>
              </div>
            </div>
            <div className="text-cyan-400/50 font-mono text-xs space-y-1">
              <div>▸ Loading core modules...</div>
              <div>▸ Establishing connections...</div>
              <div>▸ Initializing HUD interface...</div>
            </div>
          </div>
        </div>
      )}

      {/* HUD Overlay - Siempre mostrar el contenido, con o sin efectos HUD */}
      <div className={`relative min-h-screen ${glitchActive ? 'animate-glitch' : ''}`} style={{ backgroundColor: showHUD ? 'rgba(0, 0, 0, 0.3)' : 'transparent' }}>
        {/* Grid Background - Solo si showHUD es true */}
        {showHUD && (
          <div className="fixed inset-0 pointer-events-none z-[100] hud-grid opacity-20"></div>
        )}
        
        {/* Scan Line Effect - Solo si showHUD es true */}
        {showHUD && (
          <div 
            className="fixed inset-0 pointer-events-none z-[101] opacity-10"
            style={{
              background: 'linear-gradient(to bottom, transparent 0%, rgba(0, 255, 255, 0.3) 50%, transparent 100%)',
              animation: 'scanLine 3s linear infinite',
              height: '2px'
            }}
          ></div>
        )}
        
        {/* Corner Brackets - Solo si showHUD es true */}
        {showHUD && (
          <>
            <div className="fixed top-0 left-0 w-32 h-32 pointer-events-none z-[102] border-t-2 border-l-2 border-cyan-400 neon-glow"></div>
            <div className="fixed top-0 right-0 w-32 h-32 pointer-events-none z-[102] border-t-2 border-r-2 border-cyan-400 neon-glow"></div>
            <div className="fixed bottom-0 left-0 w-32 h-32 pointer-events-none z-[102] border-b-2 border-l-2 border-cyan-400 neon-glow"></div>
            <div className="fixed bottom-0 right-0 w-32 h-32 pointer-events-none z-[102] border-b-2 border-r-2 border-cyan-400 neon-glow"></div>
          </>
        )}
        
        {/* Animated Numbers (Decorativos) - Solo si showHUD es true */}
        {showHUD && [...Array(8)].map((_, i) => (
          <div
            key={i}
            className="fixed pointer-events-none z-[103] text-cyan-400/30 font-mono text-xs"
            style={{
              top: `${10 + i * 12}%`,
              left: `${5 + (i % 3) * 30}%`,
              animation: `float ${2 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`
            }}
          >
            {Math.floor(Math.random() * 10000).toString().padStart(4, '0')}
          </div>
        ))}
        
        {/* Circular Progress Indicators - Solo si showHUD es true */}
        {showHUD && (
          <div className="fixed top-4 right-4 w-16 h-16 pointer-events-none z-[103]">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="rgba(0, 255, 255, 0.2)"
                strokeWidth="2"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="rgba(0, 255, 255, 0.6)"
                strokeWidth="2"
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * 0.7}`}
                className="animate-pulse"
              />
            </svg>
          </div>
        )}
        
        {/* Hologram Effect on Content - Solo si showHUD es true */}
        {showHUD && (
          <>
            <div 
              className="absolute inset-0 pointer-events-none z-[1]"
              style={{
                background: `
                  repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(0, 255, 255, 0.03) 2px,
                    rgba(0, 255, 255, 0.03) 4px
                  )
                `,
                mixBlendMode: 'screen'
              }}
            ></div>
            
            {/* Additional Hologram Lines */}
            <div 
              className="absolute inset-0 pointer-events-none z-[1] opacity-30"
              style={{
                background: `
                  linear-gradient(90deg, transparent 0%, rgba(0, 255, 255, 0.1) 50%, transparent 100%),
                  linear-gradient(0deg, transparent 0%, rgba(0, 255, 255, 0.1) 50%, transparent 100%)
                `,
                backgroundSize: '200px 200px',
                animation: 'pulse 3s ease-in-out infinite'
              }}
            ></div>
          </>
        )}
        
        {/* Content with Hologram Effect */}
        <div 
          className="relative z-10"
          style={{
            filter: showHUD ? 'drop-shadow(0 0 10px rgba(0, 255, 255, 0.3))' : 'none',
            transition: 'filter 0.5s ease-in-out',
            animation: (showHUD && !showLoading) ? 'hologramAppear 0.8s ease-out' : 'none'
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
