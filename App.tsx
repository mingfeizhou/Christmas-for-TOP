
import React, { useState, useEffect, useRef } from 'react';
import Scene from './components/Scene';
import { SceneMode } from './types';

const App: React.FC = () => {
  const [appState, setAppState] = useState<'LOADING' | 'READY' | 'STARTED'>('LOADING');
  const [uiVisible, setUiVisible] = useState(true);
  const [mode, setMode] = useState<SceneMode>(SceneMode.TREE);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') {
        setUiVisible(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStart = () => {
    setAppState('STARTED');
    // We notify the Scene component via an event that the user has interacted
    window.dispatchEvent(new CustomEvent('start-experience'));
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          window.dispatchEvent(new CustomEvent('add-photo', { 
            detail: { url: ev.target.result as string } 
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="relative w-full h-screen bg-black select-none overflow-hidden flex flex-col">
      {/* Loader & Start Screen */}
      {appState !== 'STARTED' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-all duration-700">
          <div className="flex flex-col items-center p-8 text-center max-w-md">
            {appState === 'LOADING' ? (
              <>
                <div className="loader-spinner mb-6"></div>
                <p className="cinzel text-[#d4af37] text-sm tracking-[0.2em] animate-pulse">PREPARING HOLIDAY MAGIC</p>
              </>
            ) : (
              <div className="animate-in fade-in zoom-in duration-700">
                <h2 className="cinzel text-[#fceea7] text-2xl mb-8 tracking-widest">FOR MY DEAREST</h2>
                <button 
                  onClick={handleStart}
                  className="glass-btn px-12 py-4 cinzel text-[#d4af37] text-xl tracking-[0.3em] rounded-full shadow-[0_0_30px_rgba(212,175,55,0.3)]"
                >
                  START MAGIC
                </button>
                <p className="mt-8 text-[#d4af37]/40 text-[10px] cinzel tracking-widest leading-relaxed">
                  TIP: ADD TO HOME SCREEN FOR THE BEST EXPERIENCE
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main 3D Canvas */}
      <Scene 
        mode={mode} 
        onModeChange={setMode} 
        onLoadComplete={() => setAppState('READY')} 
      />

      {/* UI Overlay */}
      <div className={`transition-opacity duration-1000 ${uiVisible && appState === 'STARTED' ? 'opacity-100' : 'ui-hidden'}`}>
        <div className="absolute top-12 left-1/2 -translate-x-1/2 text-center w-full px-4 pt-safe">
          <h1 className="cinzel text-4xl md:text-7xl font-bold title-glow whitespace-nowrap">Merry Christmas</h1>
        </div>

        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 upload-wrapper w-full pb-safe">
          <button 
            onClick={handleUploadClick}
            className="glass-btn px-10 py-4 cinzel text-[#fceea7] text-sm md:text-lg tracking-widest rounded-full"
          >
            ADD MEMORIES
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange}
          />
          <p className="text-[#d4af37]/60 text-[10px] tracking-widest uppercase px-6 text-center">
            Use Gestures to Control the Tree
          </p>
        </div>
        
        <div className="absolute bottom-6 right-6 text-[#d4af37]/40 text-[9px] space-y-1 text-right hidden md:block">
          <p>FIST: TREE • OPEN: SCATTER • PINCH: FOCUS</p>
        </div>
      </div>

      {/* MediaPipe Hidden Elements */}
      <div className="opacity-0 pointer-events-none absolute top-0 left-0 overflow-hidden w-0 h-0">
        <video id="webcam" autoPlay playsInline muted width="160" height="120"></video>
      </div>
    </div>
  );
};

export default App;
