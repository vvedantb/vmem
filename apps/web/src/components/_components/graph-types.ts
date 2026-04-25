import type { GraphEdgeType } from "./canvas/types";

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
  edgeType: "tag" | "relates_to" | "mentions";
  reason?: string;
  score?: number;
}

export interface HoveredNodeInfo {
  id: string;
  title: string;
  /**
   * Inline content is only present when the node carried content through the
   * graph payload (wiki docs, skills, codebase files). Memory nodes omit it —
   * the parent hooks `useMemoryGraphController` / MemoryGraph then lazy-fetch
   * content via `getNodeContent` and resolve it before rendering the tooltip.
   */
  content?: string;
  viewportX: number;
  viewportY: number;
}

export interface HoveredEdgeInfo {
  edgeType: GraphEdgeType;
  sourceTitle: string;
  targetTitle: string;
  /** Tag edges: shared tag list. relates_to: reason from API. wiki_parent: null. */
  reason: string | null;
  /** Similarity score (0–1) for semantic similarity edges. */
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
