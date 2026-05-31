"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { resolveProfileIdForMcpScope } from "../neo4jActions/memories/shared";
import { mcpScopeValidator } from "../profiles/mcpAccess";

const memoryTypeValidator = v.union(
  v.literal("profile"),
  v.literal("episodic"),
  v.literal("knowledge"),
);

const memoryGraphNodeValidator = v.object({
  id: v.string(),
  title: v.string(),
  type: v.optional(memoryTypeValidator),
  tags: v.array(v.string()),
  createdAt: v.string(),
});

const relatesToEdgeValidator = v.object({
  source: v.string(),
  target: v.string(),
  reason: v.string(),
  score: v.optional(v.number()),
});

const tagEdgeValidator = v.object({
  source: v.string(),
  target: v.string(),
  weight: v.number(),
});

export const mcpMemoryGraphResultValidator = v.object({
  nodes: v.array(memoryGraphNodeValidator),
  relatesToEdges: v.array(relatesToEdgeValidator),
  tagEdges: v.array(tagEdgeValidator),
  truncated: v.boolean(),
  stats: v.object({
    nodeCount: v.number(),
    relatesToEdgeCount: v.number(),
    tagEdgeCount: v.number(),
    totalNodesBeforeCap: v.number(),
  }),
});

const DEFAULT_NODE_LIMIT = 80;
const MAX_NODE_LIMIT = 150;
const MAX_RELATES_EDGES_PER_NODE = 4;
const MAX_TAG_EDGES_PER_NODE = 3;
const MAX_EDGE_REASON_CHARS = 120;
const MAX_TAGS_PER_NODE = 12;

type MemoryGraphNode = {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  type?: "profile" | "episodic" | "knowledge";
};

type RelatesToEdge = {
  source: string;
  target: string;
  reason: string;
  score?: number;
};

type McpTagEdge = {
  source: string;
  target: string;
  weight: number;
};

type RawGraph = {
  nodes: MemoryGraphNode[];
  relatesToEdges: RelatesToEdge[];
  tagEdges: Array<McpTagEdge & { sharedTags: string[] }>;
};

type McpGraphSlice = {
  nodes: MemoryGraphNode[];
  relatesToEdges: RelatesToEdge[];
  tagEdges: McpTagEdge[];
};

function toMcpTagEdges(edges: RawGraph["tagEdges"]): McpTagEdge[] {
  return edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
  }));
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_NODE_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_NODE_LIMIT);
}

function expandMemoryIdSeeds(
  graph: RawGraph,
  memoryIds: string[],
): McpGraphSlice {
  const seeds = new Set(memoryIds);
  const included = new Set<string>(seeds);

  for (const edge of graph.relatesToEdges) {
    if (seeds.has(edge.source)) included.add(edge.target);
    if (seeds.has(edge.target)) included.add(edge.source);
  }
  for (const edge of graph.tagEdges) {
    if (seeds.has(edge.source)) included.add(edge.target);
    if (seeds.has(edge.target)) included.add(edge.source);
  }

  const nodes = graph.nodes.filter((n) => included.has(n.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const relatesToEdges = graph.relatesToEdges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );
  const tagEdges = graph.tagEdges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  return { nodes, relatesToEdges, tagEdges: toMcpTagEdges(tagEdges) };
}

function slimNodeForMcp(node: MemoryGraphNode): MemoryGraphNode {
  return {
    id: node.id,
    title: node.title,
    type: node.type,
    tags: node.tags.slice(0, MAX_TAGS_PER_NODE),
    createdAt: node.createdAt,
  };
}

function slimRelatesEdgeForMcp(edge: RelatesToEdge): RelatesToEdge {
  const reason =
    edge.reason.length > MAX_EDGE_REASON_CHARS
      ? `${edge.reason.slice(0, MAX_EDGE_REASON_CHARS)}…`
      : edge.reason;
  return {
    source: edge.source,
    target: edge.target,
    reason,
    score: edge.score,
  };
}

function capEdgesForNodes(
  edges: RelatesToEdge[],
  nodeIds: Set<string>,
  maxEdges: number,
): RelatesToEdge[] {
  const capped: RelatesToEdge[] = [];
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    capped.push(slimRelatesEdgeForMcp(edge));
    if (capped.length >= maxEdges) break;
  }
  return capped;
}

function capTagEdgesForNodes(
  edges: McpTagEdge[],
  nodeIds: Set<string>,
  maxEdges: number,
): McpTagEdge[] {
  const capped: McpTagEdge[] = [];
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    capped.push(edge);
    if (capped.length >= maxEdges) break;
  }
  return capped;
}

function capMemoryGraph(
  graph: McpGraphSlice,
  limit: number,
): McpGraphSlice & {
  truncated: boolean;
  totalNodesBeforeCap: number;
} {
  const totalNodesBeforeCap = graph.nodes.length;
  const nodeSlice = graph.nodes.slice(0, limit);
  const nodeIds = new Set(nodeSlice.map((n) => n.id));
  const maxRelates = limit * MAX_RELATES_EDGES_PER_NODE;
  const maxTag = limit * MAX_TAG_EDGES_PER_NODE;
  const nodes = nodeSlice.map(slimNodeForMcp);
  const relatesToEdges = capEdgesForNodes(
    graph.relatesToEdges,
    nodeIds,
    maxRelates,
  );
  const tagEdges = capTagEdgesForNodes(graph.tagEdges, nodeIds, maxTag);
  const truncated =
    totalNodesBeforeCap > limit ||
    graph.relatesToEdges.length > relatesToEdges.length ||
    graph.tagEdges.length > tagEdges.length;

  return {
    nodes,
    relatesToEdges,
    tagEdges,
    truncated,
    totalNodesBeforeCap,
  };
}

/** MCP entry: memory-only graph payload for the interactive MCP App widget. */
export const mcpGetMemoryGraph = internalAction({
  args: {
    clerkId: v.string(),
    mcpScope: mcpScopeValidator,
    profileId: v.optional(v.string()),
    focus: v.optional(v.string()),
    memoryIds: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  returns: mcpMemoryGraphResultValidator,
  handler: async (ctx, args) => {
    const profileId = await resolveProfileIdForMcpScope(
      ctx,
      args.clerkId,
      args.mcpScope,
      args.profileId,
    );
    const limit = normalizeLimit(args.limit);

    const focus =
      args.focus ??
      (args.memoryIds !== undefined && args.memoryIds.length === 1
        ? args.memoryIds[0]
        : undefined);

    const raw: RawGraph = await ctx.runAction(
      internal.neo4jActions.graph.getGraphDataInternal,
      {
        clerkId: args.clerkId,
        focus,
        profileId,
      },
    );

    let working: McpGraphSlice = {
      nodes: raw.nodes,
      relatesToEdges: raw.relatesToEdges,
      tagEdges: toMcpTagEdges(raw.tagEdges),
    };

    if (args.memoryIds !== undefined && args.memoryIds.length > 1) {
      working = expandMemoryIdSeeds(raw, args.memoryIds);
    } else if (
      args.memoryIds !== undefined &&
      args.memoryIds.length === 1 &&
      focus === undefined
    ) {
      working = expandMemoryIdSeeds(raw, args.memoryIds);
    }

    const capped = capMemoryGraph(working, limit);

    return {
      nodes: capped.nodes,
      relatesToEdges: capped.relatesToEdges,
      tagEdges: capped.tagEdges,
      truncated: capped.truncated,
      stats: {
        nodeCount: capped.nodes.length,
        relatesToEdgeCount: capped.relatesToEdges.length,
        tagEdgeCount: capped.tagEdges.length,
        totalNodesBeforeCap: capped.totalNodesBeforeCap,
      },
    };
  },
});
