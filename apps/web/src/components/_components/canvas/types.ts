import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

/**
 * Kind of node shown on the graph. Merges Neo4j memory nodes, Convex wikiNode
 * rows, and Convex skills into one union so the renderer can dispatch a
 * different shape per kind:
 *  - memory        → circle
 *  - wiki-document → diamond
 *  - wiki-folder   → square
 *  - skill         → hexagon (flat-topped)
 */
export type GraphNodeKind =
  | "memory"
  | "wiki-document"
  | "wiki-folder"
  | "skill"
  | "entity";

export type GraphEdgeType =
  | "tag"
  | "relates_to"
  | "imports"
  | "wiki_parent"
  | "mentions";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  /**
   * Inline content — only wiki documents and skills carry this through the
   * graph payload. Memory nodes omit it (the UI lazy-fetches content on
   * hover/click to keep the full-graph response under Convex's 1 MiB limit).
   */
  content?: string;
  tags: string[];
  createdAt: string;
  color: string;
  size: number;
  kind: GraphNodeKind;
  /**
   * Connector provenance string (e.g. "gmail", "google_drive", "notion") for
   * memories that came in through a connector sync. null for MCP / manual /
   * web captures and for non-memory kinds. The renderer uses this to stamp a
   * brand logo inside the circle so provenance reads at a glance without
   * disturbing the tag-hash colour.
   */
  sourceType: string | null;
  /** Entity sub-type (person/organization/place/technology). Only for entity nodes. */
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
