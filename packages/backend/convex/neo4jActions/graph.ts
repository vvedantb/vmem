"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import {
  getGraphData,
  getLocalGraph,
  getMemoryContent,
} from "../../engine/neo4j/memory/graph";
import { getDriver } from "../../engine/neo4j/driver";

type MemoryType = "profile" | "episodic" | "knowledge";

// Convex enforces a hard 8192 element limit on ANY array in a return value
// (applies to all Convex values: return values, arguments, and documents alike).
// The graph can exceed this — e.g. tagEdges alone reached 10,415 in production.
//
// The global graph is keyset-paged (see GraphCursor in engine graph.ts), so
// these caps bound ONE PAGE, not the whole graph — the client accumulates
// pages up to its own ceiling. 5000 nodes / 8000 edges keep every array under
// the 8192 limit with headroom.
const MAX_NODES = 5000;
const MAX_EDGES = 8000;

const ENTITY_PREFIX = "entity:";

function capGraph(data: {
  nodes: {
    id: string;
    title: string;
    tags: string[];
    createdAt: string;
    source?: string;
    sourceType: string | null;
    type?: MemoryType;
  }[];
  relatesToEdges: {
    source: string;
    target: string;
    reason: string;
    score?: number;
  }[];
  tagEdges: {
    source: string;
    target: string;
    weight: number;
    sharedTags: string[];
  }[];
  entities: Array<{
    normalizedName: string;
    name: string;
    type: string;
    memoryIds: string[];
  }>;
  focusNodeId?: string;
  totalMemoryCount?: number;
  nextCursor?: { createdAt: string; id: string };
}) {
  const nodes = data.nodes.slice(0, MAX_NODES);
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Keep RELATES_TO edges with at least one endpoint in this page. Cross-page
  // edges (the far endpoint lives in another page) must survive — the client
  // leaves them unresolved until that page loads. Edges where NEITHER endpoint
  // survived the node cap are dropped.
  const relatesToEdges = data.relatesToEdges
    .filter((e) => nodeIds.has(e.source) || nodeIds.has(e.target))
    .slice(0, MAX_EDGES);
  // Tag edges are computed once over the user's WHOLE graph (first page only),
  // so their endpoints may live in pages that haven't loaded yet — no node
  // filter here, the client skips unresolved ones until both ends arrive.
  const tagEdges = data.tagEdges.slice(0, MAX_EDGES);

  // Filter entities to only include those with at least one surviving memory
  const entities = data.entities
    .map((e) => ({
      ...e,
      memoryIds: e.memoryIds.filter((id) => nodeIds.has(id)),
    }))
    .filter((e) => e.memoryIds.length > 0);

  // Build mentions edges from entity data
  const mentionsEdges: Array<{ source: string; target: string }> = [];
  for (const e of entities) {
    const entityNodeId = `${ENTITY_PREFIX}${e.normalizedName}:${e.type}`;
    for (const mId of e.memoryIds) {
      mentionsEdges.push({ source: mId, target: entityNodeId });
    }
  }

  return {
    nodes,
    relatesToEdges,
    tagEdges,
    entities: entities.slice(0, MAX_EDGES),
    mentionsEdges: mentionsEdges.slice(0, MAX_EDGES),
    focusNodeId: data.focusNodeId,
    totalMemoryCount: data.totalMemoryCount,
    nextCursorCreatedAt: data.nextCursor?.createdAt,
    nextCursorId: data.nextCursor?.id,
  };
}

export const getGraphDataInternal = internalAction({
  args: {
    clerkId: v.string(),
    focus: v.optional(v.string()),
    profileId: v.optional(v.string()),
    // mode "local" = focus neighbourhood (focus omitted → newest memory).
    // mode "global" = full capped graph. When mode is absent, fall back to
    // the old focus-implies-local semantics (MCP graph tool still uses that).
    mode: v.optional(v.union(v.literal("local"), v.literal("global"))),
    /** Local-mode hop depth, clamped to [1, 3] downstream. Default 2. */
    depth: v.optional(v.number()),
    /**
     * Global-mode page size (newest-first), clamped to [1, 5000] downstream.
     * Absent → full page cap (MCP and other existing callers keep the old
     * behaviour); the web pages through with the keyset cursor below.
     */
    nodeLimit: v.optional(v.number()),
    /** Keyset cursor (createdAt + id of the previous page's last node). */
    cursorCreatedAt: v.optional(v.string()),
    cursorId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    const isLocal =
      args.mode !== undefined
        ? args.mode === "local"
        : args.focus !== undefined;
    const cursor =
      args.cursorCreatedAt !== undefined && args.cursorId !== undefined
        ? { createdAt: args.cursorCreatedAt, id: args.cursorId }
        : null;
    const raw = isLocal
      ? await getLocalGraph(
          driver,
          args.clerkId,
          args.focus ?? null,
          args.profileId,
          args.depth,
        )
      : await getGraphData(
          driver,
          args.clerkId,
          args.profileId,
          args.nodeLimit,
          cursor,
        );
    return capGraph(raw);
  },
});

// Lazy content fetch. The graph/local-graph endpoints drop `content` from
// their payload (it was the biggest single contributor to the 1.13 MiB graph
// size), so the UI pulls content on-demand when the user hovers a node or
// opens the detail panel. Intentionally lightweight: a single property lookup
// by the unique `memory_id` constraint — a single index seek.
export const getMemoryContentInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getMemoryContent(driver, args.clerkId, args.memoryId);
  },
});
