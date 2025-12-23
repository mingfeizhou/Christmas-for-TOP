import React, { useState, useEffect, useRef } from 'react';
import Scene from './components/Scene';
import { SceneMode } from './types';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const reader = new FileReader();
      // Precise implementation as requested
      reader.onload = (ev: any) => {
        import('three').then((THREE) => {
          new THREE.TextureLoader().load(ev.target.result, (t) => {
            t.colorSpace = THREE.SRGBColorSpace; // Critical: Specify color space
            window.dispatchEvent(new CustomEvent('add-photo', { detail: { texture: t } }));
          });
        });
      }
      reader.readAsDataURL(f);
    }
  };

  return (
    <div className="relative w-full h-screen bg-black select-none overflow-hidden">
      {/* Full-screen Loader */}
      <div className={`fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center transition-all duration-1000 ${!loading ? 'fade-out' : ''}`}>
        <div className="loader-spinner mb-6"></div>
        <p className="cinzel text-[#d4af37] text-xs tracking-[0.4em] uppercase">Loading Holiday Magic</p>
      </div>

      <Scene 
        mode={mode} 
        onModeChange={setMode} 
        onLoadComplete={() => setTimeout(() => setLoading(false), 500)} 
      />

      {/* Main UI */}
      <div className={`absolute inset-0 flex flex-col items-center pointer-events-none transition-opacity duration-700 ${uiVisible ? 'opacity-100' : 'ui-hidden'}`}>
        <div className="mt-16 text-center pt-safe px-4">
          <h1 className="cinzel title-glow font-bold md:text-7xl text-4xl">Merry Christmas</h1>
        </div>

        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 upload-wrapper pointer-events-auto">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="glass-btn px-10 py-3 cinzel text-sm tracking-[0.2em] rounded-sm uppercase"
          >
            Add Memories
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange}
          />
          <p className="cinzel text-[#d4af37]/60 text-[10px] tracking-[0.1em]">Press 'H' to Hide Controls</p>
        </div>
      </div>

      {/* Hidden Webcam for CV */}
      <div className="opacity-0 pointer-events-none absolute bottom-0 right-0 w-[160px] h-[120px] overflow-hidden">
        <video id="webcam" autoPlay playsInline muted width="160" height="120"></video>
        <canvas id="cv-canvas" width="160" height="120"></canvas>
      </div>
    </div>
  );
};

export default App;