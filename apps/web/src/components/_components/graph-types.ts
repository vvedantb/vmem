import type { GraphEdgeType } from "./canvas/types";

export interface HoveredNodeInfo {
  id: string;
  title: string;
  // inline content is only present when the node carried content through the graph
  content?: string;
  viewportX: number;
  viewportY: number;
}

export interface HoveredEdgeInfo {
  edgeType: GraphEdgeType;
  sourceTitle: string;
  targetTitle: string;
  // tag edges: shared tag list
  reason: string | null;
  // similarity score (0–1) for semantic similarity edges
  score?: number;
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
  gravity: 0.5,
  showLabels: true,
};
