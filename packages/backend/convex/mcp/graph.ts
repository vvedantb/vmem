"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, type Infer } from "convex/values";
import { resolveProfileIdForMcpScope } from "../neo4jActions/_memories/shared";
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

const mcpMemoryGraphResultValidator = v.object({
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
// Hard cap kept low (100): the embedded MCP-UI canvas runs a naive O(n²)
// main-thread simulation, and the tool result is also injected into the
// model's context — both punish large payloads.
const MAX_NODE_LIMIT = 100;
const MAX_RELATES_EDGES_PER_NODE = 4;
const MAX_TAG_EDGES_PER_NODE = 3;
const MAX_EDGE_REASON_CHARS = 120;
const MAX_TAGS_PER_NODE = 12;

type MemoryGraphNode = Infer<typeof memoryGraphNodeValidator>;
type RelatesToEdge = Infer<typeof relatesToEdgeValidator>;

type McpGraphSlice = Pick<
  Infer<typeof mcpMemoryGraphResultValidator>,
  "nodes" | "relatesToEdges" | "tagEdges"
>;

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_NODE_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_NODE_LIMIT);
}

function expandMemoryIdSeeds(
  graph: McpGraphSlice,
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
  return {
    nodes,
    relatesToEdges: graph.relatesToEdges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    ),
    tagEdges: graph.tagEdges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    ),
  };
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

function capEdges<T extends { source: string; target: string }>(
  edges: T[],
  nodeIds: Set<string>,
  maxEdges: number,
  slim: (edge: T) => T = (edge) => edge,
): T[] {
  const capped: T[] = [];
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    capped.push(slim(edge));
    if (capped.length >= maxEdges) break;
  }
  return capped;
}

function capMemoryGraph(
  graph: McpGraphSlice,
  limit: number,
  // True server-side total for plain global fetches, where the Neo4j query
  // itself is already limited — graph.nodes.length would under-report and
  // hide the truncation banner. Omitted for seed-expanded slices, whose
  // working set IS the relevant total.
  totalAvailable?: number,
): McpGraphSlice & {
  truncated: boolean;
  totalNodesBeforeCap: number;
} {
  const totalNodesBeforeCap = Math.max(graph.nodes.length, totalAvailable ?? 0);
  const nodeSlice = graph.nodes.slice(0, limit);
  const nodeIds = new Set(nodeSlice.map((n) => n.id));
  const maxRelates = limit * MAX_RELATES_EDGES_PER_NODE;
  const maxTag = limit * MAX_TAG_EDGES_PER_NODE;
  const nodes = nodeSlice.map(slimNodeForMcp);
  const relatesToEdges = capEdges(
    graph.relatesToEdges,
    nodeIds,
    maxRelates,
    slimRelatesEdgeForMcp,
  );
  const tagEdges = capEdges(graph.tagEdges, nodeIds, maxTag);
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

    const isPlainGlobal = focus === undefined && args.memoryIds === undefined;

    const raw = await ctx.runAction(
      internal.neo4jActions.graph.getGraphDataInternal,
      {
        clerkId: args.clerkId,
        focus,
        profileId,
        strictProfile: args.mcpScope === "team",
        // Plain global view gets sliced to `limit` below anyway — fetch only
        // that many from Neo4j. Seed expansion (memoryIds) keeps the full
        // fetch: it needs the wider graph to find the seeds' neighbours.
        nodeLimit: isPlainGlobal ? limit : undefined,
      },
    );

    let working: McpGraphSlice = {
      nodes: raw.nodes,
      relatesToEdges: raw.relatesToEdges,
      tagEdges: raw.tagEdges,
    };

    if (args.memoryIds !== undefined && args.memoryIds.length > 1) {
      working = expandMemoryIdSeeds(working, args.memoryIds);
    }

    const capped = capMemoryGraph(
      working,
      limit,
      isPlainGlobal ? raw.totalMemoryCount : undefined,
    );

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
