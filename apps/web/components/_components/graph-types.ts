export interface SimNode {
  id: string;
  label: string;
  content: string;
  tags: string[];
  createdAt: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

export interface SimEdge {
  sourceIndex: number;
  targetIndex: number;
  weight: number;
}

export interface HoveredNodeInfo {
  id: string;
  title: string;
  content: string;
  viewportX: number;
  viewportY: number;
}

export interface GraphSettings {
  scalingRatio: number;
  gravity: number;
  driftSpeed: number;
  driftAmplitude: number;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  scalingRatio: 4,
  gravity: 2,
  driftSpeed: 0.0006,
  driftAmplitude: 4,
};
