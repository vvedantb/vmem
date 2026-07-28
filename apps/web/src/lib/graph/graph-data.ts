// pure graph data transformation functions
import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import type { MemoryType } from "@/lib/memories";
import { MEMORY_TYPES } from "@/lib/memories";
import type { ListItemKind } from "@/lib/list-items";
import { apiGraphNodePassesFilters } from "@/lib/memory-view-filters";
import type { GraphNode, GraphEdge, RelatedNode } from "./types";

export type GraphResponse = FunctionReturnType<
  typeof api.graphApi.getGraphData
>;
export type ApiGraphNode = GraphResponse["nodes"][number];
export type ApiRelatesToEdge = GraphResponse["relatesToEdges"][number];
export type ApiTagEdge = GraphResponse["tagEdges"][number];
export type ApiWikiParentEdge = GraphResponse["wikiParentEdges"][number];
export type ApiMentionsEdge = GraphResponse["mentionsEdges"][number];

type ApiGraphNodeKind = ApiGraphNode["kind"];

export interface TagStat {
  tag: string;
  count: number;
}

export interface KindStat {
  kind: ApiGraphNodeKind;
  count: number;
}

export interface SourceStat {
  source: string;
  count: number;
}

export interface TypeStat {
  type: MemoryType;
  count: number;
}

// canonical display order for kinds never shuffle regardless of data
const KIND_ORDER: ApiGraphNodeKind[] = [
  "memory",
  "entity",
  "wiki-document",
  "wiki-folder",
  "skill",
];

export function getGraphFacets(apiNodes: ApiGraphNode[]): {
  tags: TagStat[];
  kinds: KindStat[];
  sources: SourceStat[];
  types: TypeStat[];
} {
  const tagCounts = new Map<string, number>();
  const kindCounts = new Map<ApiGraphNodeKind, number>();
  const sourceCounts = new Map<string, number>();
  const typeCounts = new Map<MemoryType, number>();

  for (const node of apiNodes) {
    kindCounts.set(node.kind, (kindCounts.get(node.kind) ?? 0) + 1);
    for (const tag of node.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    if (node.kind !== "memory") continue;
    if (node.source) {
      sourceCounts.set(node.source, (sourceCounts.get(node.source) ?? 0) + 1);
    }
    if (node.type) {
      typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
    }
  }

  return {
    tags: Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
    kinds: KIND_ORDER.map((kind) => ({
      kind,
      count: kindCounts.get(kind) ?? 0,
    })).filter((s) => s.count > 0),
    sources: Array.from(sourceCounts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => a.source.localeCompare(b.source)),
    types: MEMORY_TYPES.map((type) => ({
      type,
      count: typeCounts.get(type) ?? 0,
    })),
  };
}

function addEdgeDegrees(
  degreeCount: Map<string, number>,
  edges: readonly { source: string; target: string }[],
): void {
  for (const edge of edges) {
    degreeCount.set(edge.source, (degreeCount.get(edge.source) ?? 0) + 1);
    degreeCount.set(edge.target, (degreeCount.get(edge.target) ?? 0) + 1);
  }
}

// transforms API data into simulation-ready nodes + edges
export function buildGraphData(
  apiNodes: ApiGraphNode[],
  apiTagEdges: ApiTagEdge[],
  allRelatesToEdges: ApiRelatesToEdge[],
  apiWikiParentEdges: ApiWikiParentEdge[],
  apiMentionsEdges: ApiMentionsEdge[],
  filters: {
    kinds: readonly ListItemKind[];
    tags: readonly string[];
    sources: readonly string[];
    types: readonly MemoryType[];
  },
): { graphNodes: GraphNode[]; graphEdges: GraphEdge[] } {
  if (apiNodes.length === 0) {
    return { graphNodes: [], graphEdges: [] };
  }

  const filteredNodes = apiNodes.filter((node) =>
    apiGraphNodePassesFilters(node, filters),
  );

  const degreeCount = new Map<string, number>();
  addEdgeDegrees(degreeCount, apiTagEdges);
  addEdgeDegrees(degreeCount, allRelatesToEdges);
  addEdgeDegrees(degreeCount, apiWikiParentEdges);
  addEdgeDegrees(degreeCount, apiMentionsEdges);

  const nodeSet = new Set(filteredNodes.map((n) => n.id));

  const graphNodes: GraphNode[] = filteredNodes.map((node) => {
    const degree = degreeCount.get(node.id) ?? 0;
    // uncapped multiplicative scale so super hubs visibly dominate
    const scaled = 3 * (1 + degree * 0.05);
    let size: number;
    if (node.kind === "entity") {
      size = Math.min(25, Math.max(6, 4 * (1 + degree * 0.08)));
    } else if (node.kind === "skill") {
      size = Math.max(4, scaled);
    } else {
      size = scaled;
    }
    return {
      id: node.id,
      title: node.title,
      content: node.content,
      tags: node.tags,
      createdAt: node.createdAt,
      size,
      kind: node.kind,
      sourceType: node.sourceType,
      entityType: node.entityType,
    } satisfies GraphNode;
  });

  const graphEdges: GraphEdge[] = [];
  const addedPairs = new Set<string>();

  // tag edges from server (already deduplicated, a.id < b.id guaranteed)
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

  // relates to edges (skip if already covered by a tag edge for same pair)
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
          score: rel.score,
        });
        addedPairs.add(pairKey);
      }
    }
  }

  // wiki parent→child edges (folder hierarchy). Always a distinct pair from
  // tag/relates_to edges since wiki ids are namespaced with "wiki "
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

  // memory→Entity MENTIONS edges. Entity ids are namespaced with "entity "
  // so they never collide with memory/wiki/skill ids
  for (const me of apiMentionsEdges) {
    if (nodeSet.has(me.source) && nodeSet.has(me.target)) {
      graphEdges.push({
        source: me.source,
        target: me.target,
        weight: 1,
        edgeType: "mentions",
      });
    }
  }

  return { graphNodes, graphEdges };
}

export function getRelatedNodes(
  nodeId: string,
  graphEdges: GraphEdge[],
  nodeById: ReadonlyMap<string, GraphNode>,
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
    const node = nodeById.get(id);
    return { id, title: node?.title ?? id, weight };
  });
}
