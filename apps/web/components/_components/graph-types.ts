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
