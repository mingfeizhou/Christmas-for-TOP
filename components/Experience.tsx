
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AppMode, ParticleData, ParticleType } from '../types';

export class Experience {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private mainGroup: THREE.Group;
  private particles: ParticleData[] = [];
  private clock: THREE.Clock;
  private mode: AppMode = AppMode.TREE;
  private targetRotation = new THREE.Vector2(0, 0);
  private currentRotation = new THREE.Vector2(0, 0);
  private lastFocusChange: number = 0;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 2, 50);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 2.2;
    document.getElementById('experience-container')?.appendChild(this.renderer.domElement);

    this.mainGroup = new THREE.Group();
    this.scene.add(this.mainGroup);
    this.clock = new THREE.Clock();

    window.addEventListener('resize', this.onResize.bind(this));
  }

  async init() {
    // Environment
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const innerPoint = new THREE.PointLight(0xffaa00, 2, 50);
    this.scene.add(innerPoint);

    const goldSpot = new THREE.SpotLight(0xd4af37, 1200);
    goldSpot.position.set(30, 40, 40);
    this.scene.add(goldSpot);

    const blueSpot = new THREE.SpotLight(0x0044ff, 600);
    blueSpot.position.set(-30, 20, -30);
    this.scene.add(blueSpot);

    // Particles Setup
    this.createParticles();

    // Post-processing
    const renderScene = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.45, // strength
      0.4,  // radius
      0.7   // threshold
    );

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderScene);
    this.composer.addPass(bloomPass);

    this.animate();
  }

  private createCandyCaneTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 15;
    ctx.beginPath();
    for (let i = -128; i < 128; i += 32) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 128, 128);
    }
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
  }

  private createParticles() {
    const candyCaneTex = this.createCandyCaneTexture();
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.1 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x004411, metalness: 0.2, roughness: 0.8 });
    const redMat = new THREE.MeshPhysicalMaterial({ color: 0xcc0000, metalness: 0.5, roughness: 0.1, clearcoat: 1.0 });

    const boxGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const sphereGeo = new THREE.SphereGeometry(0.2, 16, 16);

    // 1500 Subject Particles
    for (let i = 0; i < 1500; i++) {
      const typeRand = Math.random();
      let type: ParticleType = 'GOLD_BOX';
      let mesh: THREE.Mesh;

      if (typeRand < 0.3) {
        type = 'GOLD_BOX';
        mesh = new THREE.Mesh(boxGeo, goldMat);
      } else if (typeRand < 0.6) {
        type = 'GREEN_BOX';
        mesh = new THREE.Mesh(boxGeo, greenMat);
      } else if (typeRand < 0.8) {
        type = 'RED_SPHERE';
        mesh = new THREE.Mesh(sphereGeo, redMat);
      } else if (typeRand < 0.95) {
        type = 'GOLD_SPHERE';
        mesh = new THREE.Mesh(sphereGeo, goldMat);
      } else {
        type = 'CANDY_CANE';
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0.5, 1.5, 0),
          new THREE.Vector3(1, 1, 0),
        ]);
        const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.1, 8, false);
        mesh = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({ map: candyCaneTex }));
        mesh.scale.set(0.3, 0.3, 0.3);
      }

      this.addParticleData(mesh, type);
    }

    // 2500 Dust Particles
    const dustGeo = new THREE.SphereGeometry(0.05, 4, 4);
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xfceea7 });
    for (let i = 0; i < 2500; i++) {
      const mesh = new THREE.Mesh(dustGeo, dustMat);
      this.addParticleData(mesh, 'DUST');
    }
  }

  private addParticleData(mesh: THREE.Object3D, type: ParticleType) {
    const pData: ParticleData = {
      type,
      mesh,
      originalPosition: new THREE.Vector3(
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 50
      ),
      targetPosition: new THREE.Vector3(),
      velocity: new THREE.Vector3(Math.random() * 0.1, Math.random() * 0.1, Math.random() * 0.1),
      rotationSpeed: new THREE.Euler(Math.random() * 0.05, Math.random() * 0.05, Math.random() * 0.05),
      t: Math.random(),
      id: Math.random().toString(36).substr(2, 9)
    };
    mesh.position.copy(pData.originalPosition);
    this.mainGroup.add(mesh);
    this.particles.push(pData);
  }

  addPhotoToScene(texture: THREE.Texture) {
    const frameGeo = new THREE.BoxGeometry(2.2, 3.2, 0.1);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.1 });
    const frame = new THREE.Mesh(frameGeo, frameMat);

    const planeGeo = new THREE.PlaneGeometry(2, 3);
    const planeMat = new THREE.MeshBasicMaterial({ map: texture });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.position.z = 0.06;
    frame.add(plane);

    const pData: ParticleData = {
      type: 'PHOTO',
      mesh: frame,
      originalPosition: new THREE.Vector3(0, -10, 0),
      targetPosition: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      rotationSpeed: new THREE.Euler(0, 0, 0),
      t: Math.random(),
      id: `photo_${Date.now()}`
    };
    this.mainGroup.add(frame);
    this.particles.push(pData);
  }

  updateHandData(x: number, y: number) {
    this.targetRotation.set(x, y);
  }

  setMode(mode: AppMode) {
    if (this.mode !== mode) {
      this.mode = mode;
      if (mode === AppMode.FOCUS) {
        this.lastFocusChange = performance.now();
        // Select random photo as focus target
        const photos = this.particles.filter(p => p.type === 'PHOTO');
        if (photos.length > 0) {
          const target = photos[Math.floor(Math.random() * photos.length)];
          this.particles.forEach(p => {
            if (p.id === target.id) p.type = 'PHOTO'; 
          });
          // Tag current focus
          (this as any).focusId = target.id;
        } else {
          // If no photos, go back to scatter
          this.mode = AppMode.SCATTER;
        }
      }
    }
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    const delta = this.clock.getDelta();
    const time = performance.now() * 0.001;

    // Smoother hand rotation
    this.currentRotation.lerp(this.targetRotation, 0.05);
    this.mainGroup.rotation.x = this.currentRotation.x;
    this.mainGroup.rotation.y = this.currentRotation.y;

    this.particles.forEach((p, i) => {
      let targetPos = new THREE.Vector3();
      let targetScale = 1;

      if (this.mode === AppMode.TREE) {
        if (p.type !== 'DUST') {
          // Helix Tree Logic
          const t = i / 1500;
          const radius = 12 * (1 - t);
          const angle = t * 50 * Math.PI;
          targetPos.set(
            Math.cos(angle) * radius,
            t * 30 - 15,
            Math.sin(angle) * radius
          );
        } else {
          // Dust in tree mode forms a halo
          const angle = (i / 2500) * Math.PI * 2;
          const r = 15 + Math.sin(time + i) * 2;
          targetPos.set(Math.cos(angle) * r, Math.sin(time * 0.5 + i) * 10, Math.sin(angle) * r);
        }
      } else if (this.mode === AppMode.SCATTER) {
        // Random Sphere Distribution
        const seed = i * 1.5;
        const r = 8 + (i % 12);
        targetPos.set(
          Math.cos(seed) * Math.sin(seed * 0.7) * r,
          Math.sin(seed) * Math.sin(seed * 0.3) * r,
          Math.cos(seed * 0.4) * r
        );
        // Add rotation in scatter mode
        p.mesh.rotation.x += p.rotationSpeed.x;
        p.mesh.rotation.y += p.rotationSpeed.y;
      } else if (this.mode === AppMode.FOCUS) {
        const isTarget = p.id === (this as any).focusId;
        if (isTarget) {
          targetPos.set(0, 2, 35); // Front of camera
          targetScale = 4.5;
        } else {
          // Push others away
          const dir = p.originalPosition.clone().normalize();
          targetPos.copy(dir.multiplyScalar(40));
          targetScale = 0.5;
        }
      }

      p.mesh.position.lerp(targetPos, 0.05);
      const currentScale = p.mesh.scale.x;
      const lerpedScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.1);
      p.mesh.scale.set(lerpedScale, lerpedScale, lerpedScale);
    });

    this.composer.render();
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    this.renderer.dispose();
    this.composer.dispose();
    window.removeEventListener('resize', this.onResize);
  }
}
