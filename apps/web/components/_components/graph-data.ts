/**
 * Pure graph-data transformation functions.
 * No React, no side effects — just data in → data out.
 */
import type {
  GraphNode,
  GraphEdge,
  GraphNodeKind,
  RelatedNode,
} from "./canvas/types";

// ---- API response shapes (mirrors Zod schemas in useGraphData) ----

export interface ApiGraphNode {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  kind: GraphNodeKind;
}

export interface ApiTagEdge {
  source: string;
  target: string;
  weight: number;
  sharedTags: string[];
}

export interface ApiRelatesToEdge {
  source: string;
  target: string;
  reason: string;
}

export interface ApiWikiParentEdge {
  source: string;
  target: string;
}

// ---- Tag stats ----

export interface TagStat {
  tag: string;
  count: number;
}

/** Extracts unique tags with counts from API nodes. Sorted by count desc. */
export function getAllTags(apiNodes: ApiGraphNode[]): TagStat[] {
  const tagCounts = new Map<string, number>();
  for (const node of apiNodes) {
    for (const tag of node.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- Kind stats ----

export interface KindStat {
  kind: GraphNodeKind;
  count: number;
}

/** Canonical display order for kinds — never shuffle regardless of data. */
const KIND_ORDER: GraphNodeKind[] = ["memory", "wiki-document", "wiki-folder"];

/**
 * Returns counts for each node kind present in the data, in a stable order.
 * Kinds with zero nodes are omitted so the filter UI hides categories the user
 * hasn't started using yet.
 */
export function getAllKinds(apiNodes: ApiGraphNode[]): KindStat[] {
  const counts = new Map<GraphNodeKind, number>();
  for (const node of apiNodes) {
    counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  }
  return KIND_ORDER.map((kind) => ({
    kind,
    count: counts.get(kind) ?? 0,
  })).filter((s) => s.count > 0);
}

// ---- Build graph data ----

/**
 * Transforms API data into simulation-ready nodes + edges.
 *
 * Two filters applied in sequence:
 *  - `activeKinds`: hard filter by node kind. A node is visible only if its
 *    kind is in the set. An empty set hides everything.
 *  - `activeTags`: OR filter by tag. When non-empty, nodes must have at least
 *    one matching tag. Wiki nodes have no tags, so enabling a tag filter hides
 *    them (wiki content isn't tag-searchable yet).
 */
export function buildGraphData(
  apiNodes: ApiGraphNode[],
  apiTagEdges: ApiTagEdge[],
  allRelatesToEdges: ApiRelatesToEdge[],
  apiWikiParentEdges: ApiWikiParentEdge[],
  activeTags: Set<string>,
  activeKinds: Set<GraphNodeKind>,
): { graphNodes: GraphNode[]; graphEdges: GraphEdge[] } {
  if (apiNodes.length === 0) {
    return { graphNodes: [], graphEdges: [] };
  }

  // Kind filter is the broader cut; apply first, then narrow by tags.
  const kindFiltered = apiNodes.filter((n) => activeKinds.has(n.kind));

  const filteredNodes =
    activeTags.size > 0
      ? kindFiltered.filter((n) => n.tags.some((t) => activeTags.has(t)))
      : kindFiltered;

  // Degree counting across all edge types
  const degreeCount = new Map<string, number>();
  for (const edge of apiTagEdges) {
    degreeCount.set(edge.source, (degreeCount.get(edge.source) ?? 0) + 1);
    degreeCount.set(edge.target, (degreeCount.get(edge.target) ?? 0) + 1);
  }
  for (const rel of allRelatesToEdges) {
    degreeCount.set(rel.source, (degreeCount.get(rel.source) ?? 0) + 1);
    degreeCount.set(rel.target, (degreeCount.get(rel.target) ?? 0) + 1);
  }
  for (const wpe of apiWikiParentEdges) {
    degreeCount.set(wpe.source, (degreeCount.get(wpe.source) ?? 0) + 1);
    degreeCount.set(wpe.target, (degreeCount.get(wpe.target) ?? 0) + 1);
  }

  const nodeSet = new Set(filteredNodes.map((n) => n.id));

  const graphNodes: GraphNode[] = filteredNodes.map((node) => {
    const degree = degreeCount.get(node.id) ?? 0;
    return {
      id: node.id,
      title: node.title,
      content: node.content,
      tags: node.tags,
      createdAt: node.createdAt,
      color: "",
      size: Math.min(3 + degree * 0.6, 6),
      kind: node.kind,
    };
  });

  const graphEdges: GraphEdge[] = [];
  const addedPairs = new Set<string>();

  // Tag edges from server (already deduplicated, a.id < b.id guaranteed)
  for (const edge of apiTagEdges) {
    if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
      const pairKey = `${edge.source}|${edge.target}`;
      graphEdges.push({
        source: edge.source,
        target: edge.target,
        weight: edge.weight,
        edgeType: "tag",
        reason: edge.sharedTags.join(", "),
      });
      addedPairs.add(pairKey);
    }
  }

  // Relates-to edges (skip if already covered by a tag edge for same pair)
  for (const rel of allRelatesToEdges) {
    if (nodeSet.has(rel.source) && nodeSet.has(rel.target)) {
      const pairKey =
        rel.source < rel.target
          ? `${rel.source}|${rel.target}`
          : `${rel.target}|${rel.source}`;
      if (!addedPairs.has(pairKey)) {
        graphEdges.push({
          source: rel.source,
          target: rel.target,
          weight: 1,
          edgeType: "relates_to",
          reason: rel.reason,
        });
        addedPairs.add(pairKey);
      }
    }
  }

  // Wiki parent→child edges (folder hierarchy). Always a distinct pair from
  // tag/relates_to edges since wiki ids are namespaced with "wiki:".
  for (const wpe of apiWikiParentEdges) {
    if (nodeSet.has(wpe.source) && nodeSet.has(wpe.target)) {
      graphEdges.push({
        source: wpe.source,
        target: wpe.target,
        weight: 1,
        edgeType: "wiki_parent",
      });
    }
  }

  return { graphNodes, graphEdges };
}

// ---- Related nodes for detail panel ----

export function getRelatedNodes(
  nodeId: string,
  graphEdges: GraphEdge[],
  graphNodes: GraphNode[],
): RelatedNode[] {
  const related = new Map<string, number>();
  for (const edge of graphEdges) {
    const sId = typeof edge.source === "string" ? edge.source : edge.source.id;
    const tId = typeof edge.target === "string" ? edge.target : edge.target.id;
    if (sId === nodeId) {
      related.set(tId, (related.get(tId) ?? 0) + edge.weight);
    } else if (tId === nodeId) {
      related.set(sId, (related.get(sId) ?? 0) + edge.weight);
    }
  }
  return Array.from(related.entries()).map(([id, weight]) => {
    const node = graphNodes.find((n) => n.id === id);
    return { id, title: node?.title ?? id, weight };
  });
}
