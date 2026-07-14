"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import {
  getGraphData,
  getLocalGraph,
  getMemoryContent,
  type GraphData,
} from "../../engine/neo4j/memory/graph";
import { getDriver } from "../../engine/neo4j/driver";

// Convex enforces a hard 8192 element limit on ANY array in a return value.
// The global graph is keyset-paged; these caps bound ONE PAGE. 5000 nodes /
// 8000 edges keep every array under 8192 with headroom.
const MAX_NODES = 5000;
const MAX_EDGES = 8000;

const ENTITY_PREFIX = "entity:";

export type CappedMemoryGraph = {
  nodes: GraphData["nodes"];
  relatesToEdges: GraphData["relatesToEdges"];
  tagEdges: GraphData["tagEdges"];
  entities: GraphData["entities"];
  mentionsEdges: Array<{ source: string; target: string }>;
  focusNodeId?: string;
  totalMemoryCount?: number;
  nextCursorCreatedAt?: string;
  nextCursorId?: string;
};

function capGraph(data: GraphData): CappedMemoryGraph {
  const nodes = data.nodes.slice(0, MAX_NODES);
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Keep RELATES_TO edges with at least one endpoint in this page.
  const relatesToEdges = data.relatesToEdges
    .filter((e) => nodeIds.has(e.source) || nodeIds.has(e.target))
    .slice(0, MAX_EDGES);
  // Tag edges span the whole graph (first page only) — no node filter.
  const tagEdges = data.tagEdges.slice(0, MAX_EDGES);

  const entities = data.entities
    .map((e) => ({
      ...e,
      memoryIds: e.memoryIds.filter((id) => nodeIds.has(id)),
    }))
    .filter((e) => e.memoryIds.length > 0);

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
    mode: v.optional(v.union(v.literal("local"), v.literal("global"))),
    depth: v.optional(v.number()),
    nodeLimit: v.optional(v.number()),
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

export const getMemoryContentInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    return await getMemoryContent(getDriver(), args.clerkId, args.memoryId);
  },
});
