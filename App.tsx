
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Experience } from './components/Experience';
import { mediaPipeService } from './services/MediaPipeService';
import { AppMode, AppState } from './types';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [uiVisible, setUiVisible] = useState(true);
  const [state, setState] = useState<AppState>({
    mode: AppMode.TREE,
    handX: 0,
    handY: 0,
    gesture: "NONE",
    isUILayerVisible: true,
    isLoading: true,
    focusTarget: null
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const cvCanvasRef = useRef<HTMLCanvasElement>(null);
  const experienceRef = useRef<Experience | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Experience
  useEffect(() => {
    const experience = new Experience();
    experienceRef.current = experience;
    experience.init().then(() => {
      setLoading(false);
      // Keyboard hide toggle
      window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'h') {
          setUiVisible(prev => !prev);
        }
      });
    });

    return () => experience.dispose();
  }, []);

  // Initialize MediaPipe
  useEffect(() => {
    if (videoRef.current && cvCanvasRef.current) {
      mediaPipeService.init(videoRef.current, cvCanvasRef.current);
    }
  }, []);

  // Detect gestures loop
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      mediaPipeService.detectGestures((results) => {
        if (results) {
          const { gesture, center } = results;
          
          // Map center to rotation
          // center x/y are 0-1
          const targetRotX = (center.y - 0.5) * 0.5;
          const targetRotY = (center.x - 0.5) * 1.5;

          experienceRef.current?.updateHandData(targetRotX, targetRotY);

          // State Machine Triggers
          if (gesture === "PINCH") experienceRef.current?.setMode(AppMode.FOCUS);
          if (gesture === "FIST") experienceRef.current?.setMode(AppMode.TREE);
          if (gesture === "OPEN") experienceRef.current?.setMode(AppMode.SCATTER);
        }
      });
      frameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        new THREE.TextureLoader().load(ev.target.result as string, (t) => {
          t.colorSpace = THREE.SRGBColorSpace; // Specified color space
          experienceRef.current?.addPhotoToScene(t);
        });
      }
    };
    reader.readAsDataURL(file);
  }, []);

  return (
    <div className="relative w-full h-screen bg-black">
      {/* Three.js Canvas Container */}
      <div id="experience-container" className="w-full h-full" />

      {/* Loading Screen */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-1000">
          <div className="w-10 h-10 spinner rounded-full mb-4"></div>
          <p className="cinzel text-sm tracking-[0.3em] text-[#d4af37]">LOADING HOLIDAY MAGIC</p>
        </div>
      )}

      {/* UI Overlay */}
      <div className={`fixed inset-0 z-40 flex flex-col items-center pointer-events-none transition-opacity duration-500 ${uiVisible ? '' : 'ui-hidden'}`}>
        <h1 className="cinzel text-5xl md:text-7xl mt-20 gold-glow gradient-text font-bold text-center drop-shadow-lg">
          Merry Christmas
        </h1>

        <div className="flex-1" />

        <div className="mb-20 flex flex-col items-center space-y-4 pointer-events-auto">
          <div className="upload-wrapper">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="glass-btn cinzel px-8 py-3 tracking-widest text-sm"
            >
              ADD MEMORIES
            </button>
          </div>
          <p className="text-[#fceea7]/60 text-xs tracking-widest">
            Press 'H' to Hide Controls
          </p>
        </div>
      </div>

      {/* MediaPipe Hidden Elements */}
      <div id="video-container">
        <video ref={videoRef} className="w-full h-full object-cover" />
        <canvas ref={cvCanvasRef} width="160" height="120" />
      </div>
    </div>
  );
};

export default App;
