import type { MemoryType } from "@vmem/sdk";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { McpScope } from "../profiles/mcpAccess";
import { withMcpMemoryScope, runForMcpScope } from "./memoryScope";

type MemoryGraphNode = {
  id: string;
  title: string;
  type?: MemoryType;
  tags: string[];
  createdAt: string;
};

type RelatesToEdge = {
  source: string;
  target: string;
  reason: string;
  score?: number;
};

type TagEdge = {
  source: string;
  target: string;
  weight: number;
};

type McpGraphSlice = {
  nodes: MemoryGraphNode[];
  relatesToEdges: RelatesToEdge[];
  tagEdges: TagEdge[];
};

export type McpMemoryGraphResult = McpGraphSlice & {
  truncated: boolean;
  stats: {
    nodeCount: number;
    relatesToEdgeCount: number;
    tagEdgeCount: number;
    totalNodesBeforeCap: number;
  };
};

const DEFAULT_NODE_LIMIT = 80;
const MAX_NODE_LIMIT = 100;
const MAX_TAGS_PER_NODE = 12;

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_NODE_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_NODE_LIMIT);
}

export interface GetMemoryGraphForMcpArgs {
  clerkId: string;
  mcpScope: McpScope;
  profileId?: string;
  focus?: string;
  memoryIds?: string[];
  limit?: number;
}

export async function getMemoryGraphForMcp(
  ctx: ActionCtx,
  args: GetMemoryGraphForMcpArgs,
): Promise<McpMemoryGraphResult> {
  const limit = normalizeLimit(args.limit);
  const memories = await withMcpMemoryScope(ctx, args, (scope) =>
    runForMcpScope(scope, {
      team: (profileId) =>
        ctx.runQuery(
          internal.memoryStore.functions.collectScopedMemoriesInternal,
          { kind: "team", profileId },
        ),
      personal: ({ clerkId, profileId }) =>
        ctx.runQuery(
          internal.memoryStore.functions.collectScopedMemoriesInternal,
          { kind: "personal", userId: clerkId, profileId },
        ),
    }),
  );

  let nodes: MemoryGraphNode[] = memories.map((memory) => ({
    id: memory.id,
    title: memory.title,
    type: memory.type,
    tags: memory.tags.slice(0, MAX_TAGS_PER_NODE),
    createdAt: memory.createdAt,
  }));

  if (args.focus !== undefined) {
    nodes = nodes.filter((node) => node.id === args.focus);
  } else if (args.memoryIds !== undefined && args.memoryIds.length > 0) {
    const wanted = new Set(args.memoryIds);
    nodes = nodes.filter((node) => wanted.has(node.id));
  }

  const totalNodesBeforeCap = nodes.length;
  const sliced = nodes.slice(0, limit);
  const visible = new Set(sliced.map((node) => node.id));
  const links = await ctx.runQuery(
    internal.memoryStore.functions.listMemoryLinksForUserInternal,
    { userId: args.clerkId },
  );
  const relatesToEdges = links
    .filter((link) => visible.has(link.sourceId) && visible.has(link.targetId))
    .map((link) => ({
      source: link.sourceId,
      target: link.targetId,
      reason: link.reason,
    }));
  return {
    nodes: sliced,
    relatesToEdges,
    tagEdges: [],
    truncated: totalNodesBeforeCap > limit,
    stats: {
      nodeCount: sliced.length,
      relatesToEdgeCount: relatesToEdges.length,
      tagEdgeCount: 0,
      totalNodesBeforeCap,
    },
  };
}
