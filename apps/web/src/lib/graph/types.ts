// kind of node shown on the graph
export type GraphNodeKind =
  | "memory"
  | "wiki-document"
  | "wiki-folder"
  | "skill"
  | "entity";

export type GraphEdgeType = "tag" | "relates_to" | "wiki_parent" | "mentions";

export interface GraphNode {
  id: string;
  title: string;
  // inline content — only wiki documents and skills carry this through the graph payload
  content?: string;
  tags: string[];
  createdAt: string;
  size: number;
  kind: GraphNodeKind;
  // connector provenance string (e.g. "notion")
  sourceType: string | null;
  // entity sub-type (person/organization/place/technology)
  entityType?: string;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  edgeType: GraphEdgeType;
  weight: number;
  reason?: string;
  score?: number;
}

export interface RelatedNode {
  id: string;
  title: string;
  weight: number;
}
