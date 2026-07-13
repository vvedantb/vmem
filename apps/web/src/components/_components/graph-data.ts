/**
 * Pure graph-data transformation functions.
 * No React, no side effects — just data in → data out.
 */
import type { MemoryType } from "@/lib/memories";
import { MEMORY_TYPES } from "@/lib/memories";
import type { ListItemKind } from "@/lib/list-items";
import { apiGraphNodePassesFilters } from "@/lib/memory-view-filters";
import type { GraphNode, GraphEdge, RelatedNode } from "./canvas/types";

// ---- API response shapes (mirrors Zod schemas in useGraphData) ----

/**
 * `source` and `type` are only populated on memory nodes — wiki/skill nodes
 * leave them undefined, and the Source/Type filters treat those as
 * passthrough so narrowing memories never hides non-memory items.
 *
 * `sourceType` is the connector provenance (google_drive / notion) for
 * memories that arrived through a connector sync; null otherwise. Drives the
 * logo-overlay pass in the renderer.
 */
export interface ApiGraphNode {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  kind: ListItemKind;
  source?: string;
  sourceType: string | null;
  type?: MemoryType;
  /**
   * Inline content is only present for wiki documents and skills. Memory
   * nodes omit it — the graph payload dropped memory content to fit Convex's
   * 1 MiB value limit, and the UI lazy-fetches it via `getNodeContent` on
   * hover/click.
   */
  content?: string;
  /** Entity sub-type (person/organization/place/technology). Only for entity nodes. */
  entityType?: string;
}

export interface ApiMentionsEdge {
  source: string;
  target: string;
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
  score?: number;
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
  kind: ListItemKind;
  count: number;
}

/** Canonical display order for kinds — never shuffle regardless of data. */
const KIND_ORDER: ListItemKind[] = [
  "memory",
  "entity",
  "wiki-document",
  "wiki-folder",
  "skill",
];

/**
 * Returns counts for each node kind present in the data, in a stable order.
 * Kinds with zero nodes are omitted so the filter UI hides categories the user
 * hasn't started using yet.
 */
export function getAllKinds(apiNodes: ApiGraphNode[]): KindStat[] {
  const counts = new Map<ListItemKind, number>();
  for (const node of apiNodes) {
    counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  }
  return KIND_ORDER.map((kind) => ({
    kind,
    count: counts.get(kind) ?? 0,
  })).filter((s) => s.count > 0);
}

// ---- Source stats ----

export interface SourceStat {
  source: string;
  count: number;
}

/**
 * Unique memory sources with counts, sorted alphabetically. Only memory nodes
 * carry a `source`; wiki/skill nodes are skipped so the Source filter UI
 * reflects what's actually filterable.
 */
export function getAllSources(apiNodes: ApiGraphNode[]): SourceStat[] {
  const counts = new Map<string, number>();
  for (const node of apiNodes) {
    if (node.kind !== "memory" || !node.source) continue;
    counts.set(node.source, (counts.get(node.source) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => a.source.localeCompare(b.source));
}

// ---- Type stats ----

export interface TypeStat {
  type: MemoryType;
  count: number;
}

/**
 * Memory-type counts in canonical order. Types with zero memories are kept
 * (unlike kinds) because there are only 3 of them — hiding some would make
 * the filter UI feel inconsistent as the user adds memories of new types.
 */
export function getAllTypes(apiNodes: ApiGraphNode[]): TypeStat[] {
  const counts = new Map<MemoryType, number>();
  for (const node of apiNodes) {
    if (node.kind !== "memory" || !node.type) continue;
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }
  return MEMORY_TYPES.map((type) => ({
    type,
    count: counts.get(type) ?? 0,
  }));
}

// ---- Build graph data ----

/**
 * Transforms API data into simulation-ready nodes + edges.
 *
 * Node visibility uses `apiGraphNodePassesFilters` from `memory-view-filters.ts`
 * — same semantics as the list view (empty kinds = all kinds; tags are AND;
 * source/type filters apply only to memory nodes).
 */
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
  for (const me of apiMentionsEdges) {
    degreeCount.set(me.source, (degreeCount.get(me.source) ?? 0) + 1);
    degreeCount.set(me.target, (degreeCount.get(me.target) ?? 0) + 1);
  }

  const nodeSet = new Set(filteredNodes.map((n) => n.id));

  const graphNodes: GraphNode[] = filteredNodes.map((node) => {
    const degree = degreeCount.get(node.id) ?? 0;
    // Uncapped multiplicative scale so super-hubs visibly dominate.
    // Skills carry no edges today, so their degree-0 floor is lifted to 4
    // to keep them readable as distinct atoms.
    // Entity nodes are hub nodes ("suns") — scale more aggressively so they
    // visually dominate and memories orbit around them.
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
      color: "",
      size,
      kind: node.kind,
      sourceType: node.sourceType,
      entityType: node.entityType,
    } satisfies GraphNode;
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
          score: rel.score,
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

  // Memory→Entity MENTIONS edges. Entity ids are namespaced with "entity:"
  // so they never collide with memory/wiki/skill ids.
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
