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
  edgeType: "tag" | "relates_to";
  reason?: string;
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
  repulsion: number;
  damping: number;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  scalingRatio: 4,
  gravity: 2,
  repulsion: 5000,
  damping: 0.92,
};
