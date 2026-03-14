export interface NodeAttributes {
  label: string;
  content: string;
  tags: string[];
  createdAt: string;
  size: number;
  color: string;
  x: number;
  y: number;
}

export interface EdgeAttributes {
  weight: number;
  color: string;
}

export interface HoveredNodeInfo {
  id: string;
  title: string;
  content: string;
  viewportX: number;
  viewportY: number;
}

export interface GraphThemeColors {
  labelColor: string;
  edgeColor: string;
  defaultNodeColor: string;
}
