/**
 * Pure graph-data transformation functions.
 * No React, no side effects — just data in → data out.
 */
import type { GraphNode, GraphEdge, RelatedNode } from "./canvas/types";

// ---- API response shapes (mirrors Zod schemas in useGraphData) ----

export interface ApiGraphNode {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
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

// ---- Build graph data ----

/**
 * Transforms API data into simulation-ready nodes + edges.
 * When `activeTags` is non-empty, only nodes with at least one active tag are included (OR filter).
 */
export function buildGraphData(
  apiNodes: ApiGraphNode[],
  apiTagEdges: ApiTagEdge[],
  allRelatesToEdges: ApiRelatesToEdge[],
  activeTags: Set<string>,
): { graphNodes: GraphNode[]; graphEdges: GraphEdge[] } {
  if (apiNodes.length === 0) {
    return { graphNodes: [], graphEdges: [] };
  }

  // Filter nodes by active tags (OR: node visible if it has ANY active tag)
  const filteredNodes =
    activeTags.size > 0
      ? apiNodes.filter((n) => n.tags.some((t) => activeTags.has(t)))
      : apiNodes;

  // Degree counting across both edge types
  const degreeCount = new Map<string, number>();
  for (const edge of apiTagEdges) {
    degreeCount.set(edge.source, (degreeCount.get(edge.source) ?? 0) + 1);
    degreeCount.set(edge.target, (degreeCount.get(edge.target) ?? 0) + 1);
  }
  for (const rel of allRelatesToEdges) {
    degreeCount.set(rel.source, (degreeCount.get(rel.source) ?? 0) + 1);
    degreeCount.set(rel.target, (degreeCount.get(rel.target) ?? 0) + 1);
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
