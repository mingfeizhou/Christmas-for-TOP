
import * as THREE from 'three';

export enum AppMode {
  TREE = 'TREE',
  SCATTER = 'SCATTER',
  FOCUS = 'FOCUS'
}

export interface AppState {
  mode: AppMode;
  handX: number;
  handY: number;
  gesture: string;
  isUILayerVisible: boolean;
  isLoading: boolean;
  focusTarget: THREE.Object3D | null;
}

export type ParticleType = 'GOLD_BOX' | 'GREEN_BOX' | 'GOLD_SPHERE' | 'RED_SPHERE' | 'CANDY_CANE' | 'PHOTO' | 'DUST';

export interface ParticleData {
  type: ParticleType;
  mesh: THREE.Object3D;
  originalPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  rotationSpeed: THREE.Euler;
  t: number; // for pathing/animation
  id: string;
}
