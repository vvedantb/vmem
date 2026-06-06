"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import {
  getGraphData,
  getLocalGraph,
  getMemoryContent,
} from "../../src/neo4j/memory/graph";
import { getDriver } from "../../src/neo4j/driver";

type MemoryType = "profile" | "episodic" | "knowledge";

// Convex enforces a hard 8192 element limit on ANY array in a return value
// (applies to all Convex values: return values, arguments, and documents alike).
// The graph can exceed this — e.g. tagEdges alone reached 10,415 in production.
//
// Current approach: cap arrays to stay within budget. 2000 nodes + 4000 edges
// is also a practical ceiling for d3-force rendering performance.
//
// Alternative if full dataset is ever needed: return JSON.stringify({...}) instead
// of a structured object. Strings only hit the 16 MiB size limit, no array cap.
// The frontend would JSON.parse() the result.
const MAX_NODES = 2000;
const MAX_EDGES = 4000;

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
}) {
  const nodes = data.nodes.slice(0, MAX_NODES);
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Only keep edges whose endpoints survived the node cap
  const relatesToEdges = data.relatesToEdges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .slice(0, MAX_EDGES);
  const tagEdges = data.tagEdges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .slice(0, MAX_EDGES);

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
    entities,
    mentionsEdges: mentionsEdges.slice(0, MAX_EDGES),
  };
}

export const getGraphDataInternal = internalAction({
  args: {
    clerkId: v.string(),
    focus: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    const raw = args.focus
      ? await getLocalGraph(driver, args.clerkId, args.focus, args.profileId)
      : await getGraphData(driver, args.clerkId, args.profileId);
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
