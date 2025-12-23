
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { SceneMode } from '../types';

interface SceneProps {
  mode: SceneMode;
  onModeChange: (mode: SceneMode) => void;
  onLoadComplete: () => void;
}

class ParticleItem {
  mesh: THREE.Mesh;
  targetPos: THREE.Vector3;
  targetRot: THREE.Euler;
  targetScale: THREE.Vector3;
  velocity: THREE.Vector3;
  type: 'DECOR' | 'PHOTO' | 'DUST';
  randomOffset: number;
  rotationSpeed: THREE.Vector3;

  constructor(mesh: THREE.Mesh, type: 'DECOR' | 'PHOTO' | 'DUST') {
    this.mesh = mesh;
    this.type = type;
    this.targetPos = new THREE.Vector3();
    this.targetRot = new THREE.Euler();
    this.targetScale = new THREE.Vector3(1, 1, 1);
    this.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.05);
    this.randomOffset = Math.random() * Math.PI * 2;
    this.rotationSpeed = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.02);
  }

  update(mode: SceneMode, isTarget: boolean = false) {
    this.mesh.position.lerp(this.targetPos, 0.08);
    this.mesh.quaternion.slerp(new THREE.Quaternion().setFromEuler(this.targetRot), 0.1);
    this.mesh.scale.lerp(this.targetScale, 0.08);

    if (mode === SceneMode.SCATTER) {
      this.mesh.rotation.x += this.rotationSpeed.x;
      this.mesh.rotation.y += this.rotationSpeed.y;
      this.mesh.rotation.z += this.rotationSpeed.z;
    }
  }
}

const Scene: React.FC<SceneProps> = ({ mode, onModeChange, onLoadComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    composer: EffectComposer;
    particles: ParticleItem[];
    mainGroup: THREE.Group;
    handLandmarker: HandLandmarker | null;
    video: HTMLVideoElement | null;
  } | null>(null);

  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- SETUP ---
    const scene = new THREE.Scene();
    const isMobile = window.innerWidth < 768;
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 2, isMobile ? 65 : 50);

    const renderer = new THREE.WebGLRenderer({ 
      antialias: !isMobile, // Disable antialias on mobile for performance
      powerPreference: 'high-performance',
      alpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 2.2;
    containerRef.current.appendChild(renderer.domElement);

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // Environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const pointLight = new THREE.PointLight(0xffaa00, 2, 50);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);

    const goldSpot = new THREE.SpotLight(0xd4af37, 1200);
    goldSpot.position.set(30, 40, 40);
    scene.add(goldSpot);

    const blueSpot = new THREE.SpotLight(0x00aaff, 600);
    blueSpot.position.set(-30, 20, -30);
    scene.add(blueSpot);

    // Post-Processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Bloom Pass optimized for iOS
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 
      0.45, 
      0.4, 
      0.7
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const particles: ParticleItem[] = [];

    // --- TEXTURES & HELPERS ---
    const createCandyTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = '#cc0000';
      ctx.lineWidth = 15;
      for (let i = -128; i < 256; i += 30) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 128, 128);
        ctx.stroke();
      }
      return new THREE.CanvasTexture(canvas);
    };

    const createPhotoTexture = (text: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#d4af37';
      ctx.font = 'bold 60px Cinzel';
      ctx.textAlign = 'center';
      ctx.fillText(text, 256, 256);
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 20;
      ctx.strokeRect(40, 40, 432, 432);
      return new THREE.CanvasTexture(canvas);
    };

    const addPhotoToScene = (tex: THREE.Texture) => {
      const geo = new THREE.BoxGeometry(4, 4, 0.2);
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.1 });
      const photoMat = new THREE.MeshBasicMaterial({ map: tex });
      const mesh = new THREE.Mesh(geo, [frameMat, frameMat, frameMat, frameMat, photoMat, frameMat]);
      
      const p = new ParticleItem(mesh, 'PHOTO');
      p.mesh.position.set(0, -50, 0);
      mainGroup.add(mesh);
      particles.push(p);
    };

    // --- INITIAL GENERATION ---
    const initialPhotoTex = createPhotoTexture("JOYEUX NOEL");
    initialPhotoTex.colorSpace = THREE.SRGBColorSpace;
    addPhotoToScene(initialPhotoTex);

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.2 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x013220, roughness: 0.8 });
    const redMat = new THREE.MeshPhysicalMaterial({ color: 0xaa0000, clearcoat: 1, clearcoatRoughness: 0.1 });
    const candyMat = new THREE.MeshStandardMaterial({ map: createCandyTexture() });

    const particleCount = isMobile ? 800 : 1500;
    for (let i = 0; i < particleCount; i++) {
      let geo;
      let mat;
      const rand = Math.random();
      if (rand < 0.35) {
        geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        mat = Math.random() > 0.5 ? goldMat : greenMat;
      } else if (rand < 0.7) {
        geo = new THREE.SphereGeometry(0.3, 12, 12);
        mat = Math.random() > 0.5 ? goldMat : redMat;
      } else {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0.5, 0),
          new THREE.Vector3(0.1, 0.6, 0),
          new THREE.Vector3(0.2, 0.5, 0),
        ]);
        geo = new THREE.TubeGeometry(curve, 6, 0.05, 6, false);
        mat = candyMat;
      }
      const mesh = new THREE.Mesh(geo, mat);
      const p = new ParticleItem(mesh, 'DECOR');
      mainGroup.add(mesh);
      particles.push(p);
    }

    const dustCount = isMobile ? 1200 : 2500;
    const dustGeo = new THREE.SphereGeometry(0.04, 4, 4);
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xfceea7 });
    for (let i = 0; i < dustCount; i++) {
      const mesh = new THREE.Mesh(dustGeo, dustMat);
      const p = new ParticleItem(mesh, 'DUST');
      mainGroup.add(mesh);
      particles.push(p);
    }

    // --- MEDIAPIPE & CAMERA (iOS Optimized) ---
    let handLandmarker: HandLandmarker | null = null;
    let video: HTMLVideoElement | null = null;

    const setupCamera = async () => {
      video = document.getElementById("webcam") as HTMLVideoElement;
      if (!video) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'user',
            width: { ideal: 160 },
            height: { ideal: 120 }
          } 
        });
        video.srcObject = stream;
        await video.play();
      } catch (err) {
        console.warn("Camera access denied or failed", err);
      }
    };

    const initMP = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { 
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", 
            delegate: "GPU" 
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        onLoadComplete();
      } catch (e) {
        console.error("MediaPipe Load Failed", e);
        onLoadComplete();
      }
    };
    initMP();

    sceneRef.current = { scene, camera, renderer, composer, particles, mainGroup, handLandmarker, video };

    // --- ANIMATION ENGINE ---
    let focusedPhotoIndex = -1;

    const calculateTargets = (currentMode: SceneMode) => {
      const time = performance.now() * 0.001;
      
      if (currentMode === SceneMode.FOCUS && focusedPhotoIndex === -1) {
        const photos = particles.filter(p => p.type === 'PHOTO');
        focusedPhotoIndex = particles.indexOf(photos[Math.floor(Math.random() * photos.length)]);
      } else if (currentMode !== SceneMode.FOCUS) {
        focusedPhotoIndex = -1;
      }

      particles.forEach((p, i) => {
        if (currentMode === SceneMode.TREE) {
          if (p.type === 'DUST') {
            const angle = i * 0.1 + time * 0.2;
            const radius = 22 + Math.sin(i) * 6;
            p.targetPos.set(Math.cos(angle) * radius, Math.sin(i * 0.5) * 18, Math.sin(angle) * radius);
            p.targetScale.set(1, 1, 1);
          } else {
            const treeT = (i % particleCount) / particleCount;
            const radius = 13 * (1 - treeT);
            const angle = treeT * 50 * Math.PI;
            p.targetPos.set(Math.cos(angle) * radius, (treeT * 32) - 12, Math.sin(angle) * radius);
            p.targetRot.set(0, angle, 0);
            p.targetScale.set(1, 1, 1);
          }
        } else if (currentMode === SceneMode.SCATTER) {
          const radius = isMobile ? 12 + (i % 8) : 8 + (i % 12);
          const phi = Math.acos(-1 + (2 * i) / particles.length);
          const theta = Math.sqrt(particles.length * Math.PI) * phi;
          p.targetPos.set(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.sin(phi) * Math.sin(theta),
            radius * Math.cos(phi)
          );
          p.targetScale.set(1, 1, 1);
        } else if (currentMode === SceneMode.FOCUS) {
          if (i === focusedPhotoIndex) {
            p.targetPos.set(0, 2, isMobile ? 40 : 35);
            p.targetRot.set(0, 0, 0);
            p.targetScale.set(isMobile ? 3.5 : 4.5, isMobile ? 3.5 : 4.5, isMobile ? 3.5 : 4.5);
          } else {
            const radius = 35 + (i % 15);
            const phi = Math.acos(-1 + (2 * i) / particles.length);
            const theta = Math.sqrt(particles.length * Math.PI) * phi;
            p.targetPos.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi));
            p.targetScale.set(0.15, 0.15, 0.15);
          }
        }
      });
    };

    const processHand = () => {
      if (!handLandmarker || !video || video.readyState !== 4) return;
      
      const results = handLandmarker.detectForVideo(video, performance.now());
      if (results.landmarks && results.landmarks.length > 0) {
        const hand = results.landmarks[0];
        const wrist = hand[0];
        const thumbTip = hand[4];
        const indexTip = hand[8];
        const midTip = hand[12];
        const ringTip = hand[16];
        const pinkyTip = hand[20];

        const palmCenter = hand[9];
        mainGroup.rotation.y = THREE.MathUtils.lerp(mainGroup.rotation.y, (palmCenter.x - 0.5) * 4.5, 0.1);
        mainGroup.rotation.x = THREE.MathUtils.lerp(mainGroup.rotation.x, (palmCenter.y - 0.5) * 2.5, 0.1);

        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        
        let avgDist = (
          Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y) +
          Math.hypot(midTip.x - wrist.x, midTip.y - wrist.y) +
          Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y) +
          Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y)
        ) / 4;

        if (pinchDist < 0.04) {
          if (modeRef.current !== SceneMode.FOCUS) onModeChange(SceneMode.FOCUS);
        } else if (avgDist < 0.2) {
          if (modeRef.current !== SceneMode.TREE) onModeChange(SceneMode.TREE);
        } else if (avgDist > 0.35) {
          if (modeRef.current !== SceneMode.SCATTER) onModeChange(SceneMode.SCATTER);
        }
      } else {
        mainGroup.rotation.y += 0.006;
        mainGroup.rotation.x = THREE.MathUtils.lerp(mainGroup.rotation.x, 0, 0.05);
      }
    };

    const animate = () => {
      requestAnimationFrame(animate);
      processHand();
      calculateTargets(modeRef.current);
      particles.forEach((p, i) => p.update(modeRef.current, i === focusedPhotoIndex));
      composer.render();
    };
    animate();

    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.position.z = width < 768 ? 65 : 50;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    const handleStart = () => {
      setupCamera();
    };
    window.addEventListener('start-experience', handleStart);

    const handleAddPhoto = (e: Event) => {
      const { url } = (e as CustomEvent).detail;
      new THREE.TextureLoader().load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        addPhotoToScene(t);
        onModeChange(SceneMode.FOCUS);
      });
    };
    window.addEventListener('add-photo', handleAddPhoto);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('start-experience', handleStart);
      window.removeEventListener('add-photo', handleAddPhoto);
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default Scene;
