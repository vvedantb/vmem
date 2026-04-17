import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

/**
 * Kind of node shown on the graph. Distinguishes Neo4j memory nodes from Convex
 * wikiNode rows so the renderer can dispatch a different shape per kind:
 *  - memory        → circle
 *  - wiki-document → diamond
 *  - wiki-folder   → square
 */
export type GraphNodeKind = "memory" | "wiki-document" | "wiki-folder";

export type GraphEdgeType = "tag" | "relates_to" | "imports" | "wiki_parent";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  color: string;
  size: number;
  kind: GraphNodeKind;
}

export interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  edgeType: GraphEdgeType;
  weight: number;
  reason?: string;
}

export interface ResolvedEdge {
  source: GraphNode;
  target: GraphNode;
  edgeType: GraphEdgeType;
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
