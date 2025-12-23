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
  rotationSpeed: THREE.Vector3;
  scatterPos: THREE.Vector3;
  slotIndex: number;
  // Specific randoms for photos to prevent overlap
  photoConfig?: {
    orbitRadius: number;
    orbitY: number;
    orbitPhase: number;
  };

  constructor(mesh: THREE.Mesh, type: 'DECOR' | 'PHOTO' | 'DUST', index: number) {
    this.mesh = mesh;
    this.type = type;
    this.slotIndex = index;
    this.targetPos = new THREE.Vector3();
    this.targetRot = new THREE.Euler();
    this.targetScale = new THREE.Vector3(1, 1, 1);
    this.rotationSpeed = new THREE.Vector3(
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.05
    );
    
    // Scatter position in a larger shell to avoid clustering
    const radius = type === 'PHOTO' ? 12 + Math.random() * 15 : 8 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    this.scatterPos = new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );

    if (type === 'PHOTO') {
      this.photoConfig = {
        orbitRadius: 18 + Math.random() * 10,
        orbitY: -12 + Math.random() * 28,
        orbitPhase: Math.random() * Math.PI * 2
      };
    }
  }

  update(mode: SceneMode) {
    this.mesh.position.lerp(this.targetPos, 0.07);
    this.mesh.quaternion.slerp(new THREE.Quaternion().setFromEuler(this.targetRot), 0.07);
    this.mesh.scale.lerp(this.targetScale, 0.07);

    if (mode === SceneMode.SCATTER) {
      this.mesh.rotation.x += this.rotationSpeed.x;
      this.mesh.rotation.y += this.rotationSpeed.y;
      this.mesh.rotation.z += this.rotationSpeed.z;
    }
  }
}

const Scene: React.FC<SceneProps> = ({ mode, onModeChange, onLoadComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ mode, particles: [] as ParticleItem[], focusedPhotoIndex: -1 });

  useEffect(() => {
    stateRef.current.mode = mode;
  }, [mode]);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 2.2;
    containerRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 50);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const pointLight = new THREE.PointLight(0xff9900, 2);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);

    const goldSpot = new THREE.SpotLight(0xd4af37, 1200);
    goldSpot.position.set(30, 40, 40);
    scene.add(goldSpot);

    const blueSpot = new THREE.SpotLight(0x3366ff, 600);
    blueSpot.position.set(-30, 20, -30);
    scene.add(blueSpot);

    // Procedural Texture for Candy Canes
    const createCandyTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = '#cc0000';
      ctx.lineWidth = 15;
      for (let i = -128; i < 256; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(4, 1);
      return tex;
    };
    const candyTex = createCandyTexture();

    // Materials & Geometries Caching
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.1 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x013220, roughness: 0.8 });
    const redMat = new THREE.MeshPhysicalMaterial({ color: 0xcc0000, metalness: 0.1, roughness: 0.1, clearcoat: 1.0, clearcoatRoughness: 0.1 });
    const candyMat = new THREE.MeshStandardMaterial({ map: candyTex });
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xfceea7, transparent: true, opacity: 0.6 });
    
    const photoGeo = new THREE.BoxGeometry(4, 5, 0.2);
    const photoFrameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.2 });

    const particles: ParticleItem[] = [];

    const addPhotoToScene = (tex: THREE.Texture) => {
      const photoMat = new THREE.MeshBasicMaterial({ map: tex });
      const mesh = new THREE.Mesh(photoGeo, [photoFrameMat, photoFrameMat, photoFrameMat, photoFrameMat, photoMat, photoFrameMat]);
      const p = new ParticleItem(mesh, 'PHOTO', particles.filter(x => x.type === 'PHOTO').length);
      mainGroup.add(mesh);
      particles.push(p);
    };

    // Main Particles
    for (let i = 0; i < 1500; i++) {
      let geo, mat;
      const rand = Math.random();
      if (rand < 0.4) {
        geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        mat = Math.random() > 0.5 ? goldMat : greenMat;
      } else if (rand < 0.8) {
        geo = new THREE.SphereGeometry(0.3, 8, 8);
        mat = Math.random() > 0.5 ? goldMat : redMat;
      } else {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0.6, 0),
          new THREE.Vector3(0.1, 0.8, 0),
          new THREE.Vector3(0.2, 0.6, 0)
        ]);
        geo = new THREE.TubeGeometry(curve, 10, 0.05, 6, false);
        mat = candyMat;
      }
      const mesh = new THREE.Mesh(geo, mat);
      particles.push(new ParticleItem(mesh, 'DECOR', i));
      mainGroup.add(mesh);
    }

    // Dust Particles
    for (let i = 0; i < 2500; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), dustMat);
      particles.push(new ParticleItem(mesh, 'DUST', i));
      mainGroup.add(mesh);
    }

    stateRef.current.particles = particles;

    // Post Processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.4, 0.7);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // MediaPipe Setup
    let handLandmarker: HandLandmarker | null = null;
    const initMP = async () => {
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
    };
    initMP();

    const video = document.getElementById('webcam') as HTMLVideoElement;
    navigator.mediaDevices.getUserMedia({ video: true }).then(s => video.srcObject = s).catch(() => {});

    const calculateTargets = () => {
      const time = performance.now() * 0.001;
      const { mode, focusedPhotoIndex } = stateRef.current;

      particles.forEach((p, idx) => {
        if (mode === SceneMode.TREE) {
          if (p.type === 'DECOR') {
            const t = p.slotIndex / 1500;
            const radius = 13 * (1 - t);
            const angle = t * 50 * Math.PI + time * 0.5;
            p.targetPos.set(Math.cos(angle) * radius, (t * 32) - 15, Math.sin(angle) * radius);
            p.targetRot.set(0, -angle, 0);
            p.targetScale.set(1, 1, 1);
          } else if (p.type === 'PHOTO' && p.photoConfig) {
            const angle = p.photoConfig.orbitPhase + time * 0.2;
            p.targetPos.set(
              Math.cos(angle) * p.photoConfig.orbitRadius, 
              p.photoConfig.orbitY, 
              Math.sin(angle) * p.photoConfig.orbitRadius
            );
            p.targetRot.set(0, -angle + Math.PI/2, 0);
            p.targetScale.set(1, 1, 1);
          } else {
            const radius = 25 + Math.sin(idx) * 5;
            const angle = idx * 0.1 + time * 0.3;
            p.targetPos.set(Math.cos(angle) * radius, Math.cos(idx * 0.5) * 20, Math.sin(angle) * radius);
          }
        } else if (mode === SceneMode.SCATTER) {
          p.targetPos.copy(p.scatterPos);
          p.targetScale.set(1, 1, 1);
        } else if (mode === SceneMode.FOCUS) {
          if (idx === stateRef.current.focusedPhotoIndex) {
            p.targetPos.set(0, 2, 35);
            p.targetRot.set(0, 0, 0);
            p.targetScale.set(4.5, 4.5, 4.5);
          } else {
            p.targetPos.copy(p.scatterPos).multiplyScalar(2.5);
            p.targetScale.set(0.1, 0.1, 0.1);
          }
        }
      });
    };

    const animate = () => {
      requestAnimationFrame(animate);
      if (handLandmarker && video.readyState >= 2) {
        const results = handLandmarker.detectForVideo(video, performance.now());
        if (results.landmarks && results.landmarks.length > 0) {
          const hand = results.landmarks[0];
          // Palm tracking
          mainGroup.rotation.y = THREE.MathUtils.lerp(mainGroup.rotation.y, (hand[9].x - 0.5) * 4, 0.1);
          mainGroup.rotation.x = THREE.MathUtils.lerp(mainGroup.rotation.x, (hand[9].y - 0.5) * 2, 0.1);

          // Gestures
          const pinchDist = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);
          const tips = [8, 12, 16, 20];
          const avgDist = tips.reduce((sum, id) => sum + Math.hypot(hand[id].x - hand[0].x, hand[id].y - hand[0].y), 0) / 4;

          if (pinchDist < 0.05) {
            if (stateRef.current.mode !== SceneMode.FOCUS) {
              const photos = particles.filter(p => p.type === 'PHOTO');
              if (photos.length > 0) {
                const target = photos[Math.floor(Math.random() * photos.length)];
                stateRef.current.focusedPhotoIndex = particles.indexOf(target);
                onModeChange(SceneMode.FOCUS);
              }
            }
          } else if (avgDist < 0.25) {
            onModeChange(SceneMode.TREE);
          } else if (avgDist > 0.4) {
            onModeChange(SceneMode.SCATTER);
          }
        }
      }

      calculateTargets();
      particles.forEach(p => p.update(stateRef.current.mode));
      composer.render();
    };
    animate();

    const handleAddPhoto = (e: any) => {
      addPhotoToScene(e.detail.texture);
      stateRef.current.focusedPhotoIndex = particles.length - 1;
      onModeChange(SceneMode.FOCUS);
    };
    window.addEventListener('add-photo', handleAddPhoto);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('add-photo', handleAddPhoto);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default Scene;