import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

// kind of node shown on the graph
export type GraphNodeKind =
  | "memory"
  | "wiki-document"
  | "wiki-folder"
  | "skill"
  | "entity"
  | "code-file"
  | "code-function"
  | "code-class"
  | "code-interface"
  | "code-process";

export type GraphEdgeType =
  | "tag"
  | "relates_to"
  | "imports"
  | "wiki_parent"
  | "mentions"
  | "calls"
  | "contains"
  | "has_method"
  | "extends"
  | "implements"
  | "starts_process"
  | "includes";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  // inline content — only wiki documents and skills carry this through the graph payload
  content?: string;
  tags: string[];
  createdAt: string;
  size: number;
  kind: GraphNodeKind;
  // connector provenance string (e.g
  sourceType: string | null;
  // entity sub-type (person/organization/place/technology)
  entityType?: string;
}

export interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  edgeType: GraphEdgeType;
  weight: number;
  reason?: string;
  score?: number;
}

export interface ResolvedEdge {
  source: GraphNode;
  target: GraphNode;
  edgeType: GraphEdgeType;
  weight: number;
  reason?: string;
  score?: number;
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
  hoveredEdgeIndex: number | null;
  draggedNodeId: string | null;
  isPanning: boolean;
}

export interface RelatedNode {
  id: string;
  title: string;
  weight: number;
}
