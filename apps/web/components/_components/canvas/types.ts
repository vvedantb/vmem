import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  color: string;
  size: number;
}

export interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  edgeType: "tag" | "relates_to";
  weight: number;
  reason?: string;
}

export interface ResolvedEdge {
  source: GraphNode;
  target: GraphNode;
  edgeType: "tag" | "relates_to";
  weight: number;
  reason?: string;
}

export interface ViewportState {
  offsetX: number;
  offsetY: number;
  scale: number;
  targetScale: number;
  targetOffsetX: number;
  targetOffsetY: number;
  velocityX: number;
  velocityY: number;
}

export interface InteractionState {
  hoveredNodeId: string | null;
  draggedNodeId: string | null;
  linkSourceId: string | null;
  isPanning: boolean;
  mouseWorldX: number;
  mouseWorldY: number;
  shiftHeld: boolean;
}

export interface RelatedNode {
  id: string;
  title: string;
  weight: number;
}
