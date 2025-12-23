
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
  type: 'DECOR' | 'PHOTO' | 'DUST';
  randomOffset: number;
  rotationSpeed: THREE.Vector3;
  scatterPos: THREE.Vector3;
  slotIndex: number;

  constructor(mesh: THREE.Mesh, type: 'DECOR' | 'PHOTO' | 'DUST', index: number) {
    this.mesh = mesh;
    this.type = type;
    this.slotIndex = index;
    this.targetPos = new THREE.Vector3();
    this.targetRot = new THREE.Euler();
    this.targetScale = new THREE.Vector3(1, 1, 1);
    this.randomOffset = Math.random() * Math.PI * 2;
    this.rotationSpeed = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.02);
    this.scatterPos = new THREE.Vector3();
    this.updateScatterPos(index, 4000); // 预设一个较大的总数基准
  }

  // 使用黄金螺旋算法均匀分布在球面上，防止重叠
  updateScatterPos(index: number, total: number) {
    let radius = 12 + Math.random() * 8;
    
    if (this.type === 'PHOTO') {
      // 照片放在更远的外层轨道，半径范围更大 (22-38)
      radius = 22 + (index % 15) * 1.2; 
      // 黄金螺旋采样
      const phi = Math.acos(1 - 2 * (index / 50)); // 假设最多50张照片
      const theta = Math.PI * (1 + Math.sqrt(5)) * index;
      
      this.scatterPos.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      );
    } else {
      const phi = Math.acos(1 - 2 * (index / total));
      const theta = Math.PI * (1 + Math.sqrt(5)) * index;
      if (this.type === 'DUST') radius = 30 + Math.random() * 10;
      
      this.scatterPos.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      );
    }
  }

  update(mode: SceneMode) {
    this.mesh.position.lerp(this.targetPos, 0.08);
    this.mesh.quaternion.slerp(new THREE.Quaternion().setFromEuler(this.targetRot), 0.1);
    this.mesh.scale.lerp(this.targetScale, 0.08);

    if (mode === SceneMode.SCATTER) {
      this.mesh.rotation.x += this.rotationSpeed.x;
      this.mesh.rotation.y += this.rotationSpeed.y;
    }
  }
}

const Scene: React.FC<SceneProps> = ({ mode, onModeChange, onLoadComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    particles: ParticleItem[];
    mainGroup: THREE.Group;
    handLandmarker: HandLandmarker | null;
    video: HTMLVideoElement | null;
    composer: EffectComposer;
  } | null>(null);

  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const isMobile = window.innerWidth < 768;
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 2, isMobile ? 65 : 50);

    const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 2.2;
    containerRef.current.appendChild(renderer.domElement);

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const goldSpot = new THREE.SpotLight(0xd4af37, 1200);
    goldSpot.position.set(30, 40, 40);
    scene.add(goldSpot);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.4, 0.7));
    composer.addPass(new OutputPass());

    const particles: ParticleItem[] = [];

    const addPhotoToScene = (tex: THREE.Texture) => {
      const geo = new THREE.BoxGeometry(4, 4, 0.2);
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.1 });
      const photoMat = new THREE.MeshBasicMaterial({ map: tex });
      const mesh = new THREE.Mesh(geo, [frameMat, frameMat, frameMat, frameMat, photoMat, frameMat]);
      
      const photoCount = particles.filter(p => p.type === 'PHOTO').length;
      const p = new ParticleItem(mesh, 'PHOTO', photoCount);
      p.mesh.position.set(0, -100, 0); // 从下方飞入
      mainGroup.add(mesh);
      particles.push(p);
    };

    // 默认照片
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,512,512);
    ctx.fillStyle = '#d4af37'; ctx.font = 'bold 60px Cinzel'; ctx.textAlign = 'center';
    ctx.fillText("JOYEUX NOEL", 256, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    addPhotoToScene(tex);

    // 装饰粒子
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.2 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x013220, roughness: 0.8 });
    const particleCount = isMobile ? 800 : 1500;
    for (let i = 0; i < particleCount; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), Math.random() > 0.5 ? goldMat : greenMat);
      particles.push(new ParticleItem(mesh, 'DECOR', i));
      mainGroup.add(mesh);
    }

    // 尘埃
    const dustCount = isMobile ? 1000 : 2000;
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xfceea7 });
    for (let i = 0; i < dustCount; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), dustMat);
      particles.push(new ParticleItem(mesh, 'DUST', i));
      mainGroup.add(mesh);
    }

    let handLandmarker: HandLandmarker | null = null;
    let video: HTMLVideoElement | null = null;

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
      } catch (e) { onLoadComplete(); }
    };
    initMP();

    sceneRef.current = { particles, mainGroup, handLandmarker, video: null, composer };

    let focusedPhotoIndex = -1;

    const calculateTargets = (currentMode: SceneMode) => {
      const time = performance.now() * 0.001;
      
      if (currentMode === SceneMode.FOCUS && focusedPhotoIndex === -1) {
        const photos = particles.filter(p => p.type === 'PHOTO');
        focusedPhotoIndex = particles.indexOf(photos[Math.floor(Math.random() * photos.length)]);
      } else if (currentMode !== SceneMode.FOCUS) {
        focusedPhotoIndex = -1;
      }

      particles.forEach((p, idx) => {
        if (currentMode === SceneMode.TREE) {
          if (p.type === 'PHOTO') {
            // 照片在树周围环绕，避免重叠
            const angle = (p.slotIndex * 1.5) + time * 0.5;
            const radius = 18 + Math.sin(p.slotIndex) * 2;
            const y = (p.slotIndex % 5) * 6 - 8;
            p.targetPos.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
            p.targetRot.set(0, -angle + Math.PI/2, 0);
            p.targetScale.set(1, 1, 1);
          } else if (p.type === 'DECOR') {
            const t = p.slotIndex / particleCount;
            const radius = 13 * (1 - t);
            const angle = t * 50 * Math.PI + time * 0.2;
            p.targetPos.set(Math.cos(angle) * radius, (t * 32) - 12, Math.sin(angle) * radius);
            p.targetRot.set(0, angle, 0);
            p.targetScale.set(1, 1, 1);
          } else {
            const angle = idx * 0.1 + time;
            p.targetPos.set(Math.cos(angle) * 22, Math.sin(idx) * 15, Math.sin(angle) * 22);
          }
        } else if (currentMode === SceneMode.SCATTER) {
          p.targetPos.copy(p.scatterPos);
          p.targetScale.set(p.type === 'PHOTO' ? 1.2 : 1, p.type === 'PHOTO' ? 1.2 : 1, 1);
        } else if (currentMode === SceneMode.FOCUS) {
          if (idx === focusedPhotoIndex) {
            p.targetPos.set(0, 2, isMobile ? 40 : 35);
            p.targetRot.set(0, 0, 0);
            p.targetScale.set(isMobile ? 3.5 : 4.5, isMobile ? 3.5 : 4.5, 1);
          } else {
            p.targetPos.copy(p.scatterPos).multiplyScalar(2.5);
            p.targetScale.set(0.1, 0.1, 0.1);
          }
        }
      });
    };

    const animate = () => {
      requestAnimationFrame(animate);
      const sceneData = sceneRef.current;
      if (!sceneData) return;

      const { handLandmarker, video, composer, mainGroup, particles } = sceneData;
      if (handLandmarker && video && video.readyState === 4) {
        const results = handLandmarker.detectForVideo(video, performance.now());
        if (results.landmarks && results.landmarks.length > 0) {
          const hand = results.landmarks[0];
          mainGroup.rotation.y = THREE.MathUtils.lerp(mainGroup.rotation.y, (hand[9].x - 0.5) * 4, 0.1);
          mainGroup.rotation.x = THREE.MathUtils.lerp(mainGroup.rotation.x, (hand[9].y - 0.5) * 2, 0.1);
          
          const pinch = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);
          const ext = (Math.hypot(hand[8].x - hand[0].x, hand[8].y - hand[0].y) + Math.hypot(hand[12].x - hand[0].x, hand[12].y - hand[0].y)) / 2;
          
          if (pinch < 0.04) onModeChange(SceneMode.FOCUS);
          else if (ext < 0.2) onModeChange(SceneMode.TREE);
          else if (ext > 0.35) onModeChange(SceneMode.SCATTER);
        } else {
          mainGroup.rotation.y += 0.005;
        }
      } else {
        mainGroup.rotation.y += 0.005;
      }

      calculateTargets(modeRef.current);
      particles.forEach(p => p.update(modeRef.current));
      composer.render();
    };
    animate();

    const handleStart = async () => {
      const vid = document.getElementById("webcam") as HTMLVideoElement;
      if (vid && sceneRef.current) {
        sceneRef.current.video = vid;
        try {
          vid.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 160, height: 120 } });
        } catch (e) {}
      }
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
      window.removeEventListener('start-experience', handleStart);
      window.removeEventListener('add-photo', handleAddPhoto);
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default Scene;
