export interface NodeAttributes {
  label: string;
  content: string;
  tags: string[];
  createdAt: string;
  color: string;
  size: number;
  x: number;
  y: number;
}

export interface EdgeAttributes {
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
  showLabels: boolean;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  scalingRatio: 10,
  gravity: 0.3,
  showLabels: true,
};
