
export enum SceneMode {
  TREE = 'TREE',
  SCATTER = 'SCATTER',
  FOCUS = 'FOCUS'
}

export interface HandData {
  x: number;
  y: number;
  gesture: SceneMode | null;
}
