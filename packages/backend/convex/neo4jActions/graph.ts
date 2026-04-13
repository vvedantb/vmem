"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

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

function capGraph(data: {
  nodes: {
    id: string;
    title: string;
    content: string;
    tags: string[];
    createdAt: string;
  }[];
  relatesToEdges: { source: string; target: string; reason: string }[];
  tagEdges: {
    source: string;
    target: string;
    weight: number;
    sharedTags: string[];
  }[];
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

  return { nodes, relatesToEdges, tagEdges };
}

export const getGraphDataInternal = internalAction({
  args: {
    clerkId: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    const raw = args.focus
      ? await service.getLocalGraph(args.clerkId, args.focus)
      : await service.getGraphData(args.clerkId);
    return capGraph(raw);
  },
});

export const getLocalGraphInternal = internalAction({
  args: {
    clerkId: v.string(),
    focusId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return capGraph(await service.getLocalGraph(args.clerkId, args.focusId));
  },
});
