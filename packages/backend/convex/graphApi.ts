import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { MemoryType, MemoryWithTags } from "./memoryApi/types";
import type { GraphEntityNode } from "./memoryStore/entities";
import {
  collectGraphRowsPaged,
  collectScopedMemoriesPaged,
} from "./memoryStore/walk";

const SKILL_PREFIX = "skill:";

export interface GraphNodeEntry {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  kind: "memory" | "skill" | "entity";
  source?: string;
  sourceType: string | null;
  type?: MemoryType;
  entityType?: string;
  content?: string;
}

export interface GraphRelatesToEdge {
  source: string;
  target: string;
  reason: string;
  score?: number;
}

export interface GraphMentionsEdge {
  source: string;
  target: string;
}

interface GraphResult {
  nodes: GraphNodeEntry[];
  relatesToEdges: GraphRelatesToEdge[];
  tagEdges: {
    source: string;
    target: string;
    weight: number;
    sharedTags: string[];
  }[];
  mentionsEdges: GraphMentionsEdge[];
  focusNodeId?: string;
  totalMemoryCount?: number;
  nextCursorCreatedAt?: string;
  nextCursorId?: string;
}

// link and entity rows are keyed on the author, so read them for every
// author of the memories on screen (team graphs span several members)
const MAX_GRAPH_AUTHORS = 50;

function graphAuthors(memories: readonly MemoryWithTags[]): string[] {
  return [...new Set(memories.map((memory) => memory.userId))]
    .sort()
    .slice(0, MAX_GRAPH_AUTHORS);
}

export function memoryGraphNodes(
  memories: readonly MemoryWithTags[],
): GraphNodeEntry[] {
  return memories.map((memory) => ({
    id: memory.id,
    title: memory.title,
    tags: memory.tags,
    createdAt: memory.createdAt,
    kind: "memory",
    source: memory.source,
    sourceType: memory.sourceType,
    type: memory.type,
  }));
}

// Nodes in total and edges per kind. Stays below Convex's 8192 array-length
// limit on return values, so a large account gets a partial graph, not an
// error.
const MAX_GRAPH_NODES = 8_000;
const MAX_GRAPH_EDGES = 8_000;

// the newest `max` memories, in their original order
export function newestGraphMemories(
  memories: readonly MemoryWithTags[],
  max: number,
): readonly MemoryWithTags[] {
  if (memories.length <= max) return memories;
  const kept = new Set(
    [...memories]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(0, max))
      .map((memory) => memory.id),
  );
  return memories.filter((memory) => kept.has(memory.id));
}

// RELATES_TO links with both ends inside `memories`. Callers load
// `memories` through their own scope check, so no edge leaves the scope.
export async function loadGraphLinks(
  ctx: Pick<ActionCtx, "runQuery">,
  memories: readonly MemoryWithTags[],
): Promise<GraphRelatesToEdge[]> {
  const memoryIds = new Set(memories.map((memory) => memory.id));
  const edges = new Map<string, GraphRelatesToEdge>();
  for (const userId of graphAuthors(memories)) {
    const links = await collectGraphRowsPaged((page) =>
      ctx.runQuery(
        internal.memoryStore.functions.paginateMemoryLinksForUserInternal,
        { userId, ...page },
      ),
    );
    for (const link of links) {
      if (edges.size >= MAX_GRAPH_EDGES) break;
      if (!memoryIds.has(link.sourceId) || !memoryIds.has(link.targetId)) {
        continue;
      }
      const key = `${link.sourceId}|${link.targetId}`;
      if (edges.has(key)) continue;
      edges.set(key, {
        source: link.sourceId,
        target: link.targetId,
        reason: link.reason,
      });
    }
  }
  return [...edges.values()];
}

// Entity nodes mentioned by `memories`, plus the memory→entity edges. Edges
// come out entity by entity, in entity creation order (authors in turn).
// Past `maxNodes`, the most-mentioned entities are kept (ties: that order).
export async function loadGraphEntities(
  ctx: Pick<ActionCtx, "runQuery">,
  memories: readonly MemoryWithTags[],
  maxNodes: number = Infinity,
): Promise<{
  entityNodes: GraphNodeEntry[];
  mentionsEdges: GraphMentionsEdge[];
}> {
  const memoryIds = new Set(memories.map((memory) => memory.id));
  const entityNodes: GraphNodeEntry[] = [];
  const mentionsEdges = new Map<string, GraphMentionsEdge>();
  const entities: GraphEntityNode[] = [];
  const mentionedBy = new Map<string, string[]>();
  for (const userId of graphAuthors(memories)) {
    const [entityRows, mentionRows] = await Promise.all([
      collectGraphRowsPaged((page) =>
        ctx.runQuery(
          internal.memoryStore.functions.paginateEntitiesForGraphInternal,
          { userId, ...page },
        ),
      ),
      collectGraphRowsPaged((page) =>
        ctx.runQuery(
          internal.memoryStore.functions.paginateEntityMentionsForGraphInternal,
          { userId, ...page },
        ),
      ),
    ]);
    entities.push(...entityRows);
    for (const mention of mentionRows) {
      if (!memoryIds.has(mention.memoryId)) continue;
      const ids = mentionedBy.get(mention.entityId);
      if (ids === undefined) {
        mentionedBy.set(mention.entityId, [mention.memoryId]);
      } else {
        ids.push(mention.memoryId);
      }
    }
  }
  const candidates: Array<{ node: GraphEntityNode; mentionedIn: string[] }> =
    [];
  const seen = new Set<string>();
  for (const node of entities) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    const mentionedIn = [...new Set(mentionedBy.get(node.id))];
    if (mentionedIn.length > 0) candidates.push({ node, mentionedIn });
  }
  let kept = candidates;
  if (candidates.length > maxNodes) {
    const top = new Set(
      [...candidates]
        .sort((a, b) => b.mentionedIn.length - a.mentionedIn.length)
        .slice(0, Math.max(0, maxNodes)),
    );
    kept = candidates.filter((candidate) => top.has(candidate));
  }
  for (const { node, mentionedIn } of kept) {
    for (const memoryId of mentionedIn) {
      if (mentionsEdges.size >= MAX_GRAPH_EDGES) break;
      mentionsEdges.set(`${memoryId}|${node.id}`, {
        source: memoryId,
        target: node.id,
      });
    }
    if (!mentionsEdges.has(`${mentionedIn[0]}|${node.id}`)) continue;
    entityNodes.push({
      id: node.id,
      title: node.name,
      tags: [],
      createdAt: new Date(node.createdAt).toISOString(),
      kind: "entity",
      sourceType: null,
      entityType: node.type,
    });
  }
  return {
    entityNodes,
    mentionsEdges: [...mentionsEdges.values()],
  };
}

export const getGraphData = authAction({
  args: {
    focus: v.optional(v.string()),
    profileId: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("local"), v.literal("global"))),
    depth: v.optional(v.number()),
    nodeLimit: v.optional(v.number()),
    cursorCreatedAt: v.optional(v.string()),
    cursorId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GraphResult> => {
    const clerkId = await requireClerkId(ctx);
    const isLocal =
      args.mode !== undefined
        ? args.mode === "local"
        : args.focus !== undefined;
    const isFirstPage = args.cursorCreatedAt === undefined;
    const includeAccountAtoms = !isLocal && isFirstPage;

    let teamId: Id<"teams"> | undefined;
    let memories: readonly MemoryWithTags[];
    if (args.profileId !== undefined) {
      const scope = await ctx.runQuery(
        internal.teams.resolveMemoryScopeInternal,
        { userId: ctx.userId, profileId: args.profileId },
      );
      if (scope.kind === "team") {
        teamId = scope.teamId;
        memories = await collectScopedMemoriesPaged(ctx, {
          kind: "team",
          profileId: args.profileId,
        });
      } else {
        memories = await collectScopedMemoriesPaged(ctx, {
          kind: "personal",
          userId: clerkId,
          profileId: args.profileId,
        });
      }
    } else {
      memories = await collectScopedMemoriesPaged(ctx, {
        kind: "personal",
        userId: clerkId,
      });
    }

    if (args.focus !== undefined) {
      memories = memories.filter((memory) => memory.id === args.focus);
    }

    const skillRows = includeAccountAtoms
      ? await ctx.runQuery(internal.skills.listForGraphInternal, {
          userId: ctx.userId,
          teamId,
        })
      : [];

    const skillNodes: GraphNodeEntry[] = skillRows
      .filter((s) => s.enabled !== false)
      .map((s) => ({
        id: `${SKILL_PREFIX}${s._id}`,
        title: s.name,
        content: s.description,
        tags: [],
        createdAt: new Date(s.createdAt).toISOString(),
        kind: "skill",
        sourceType: null,
      }));

    // skills first, then the newest memories, then entities fill the rest;
    // edges only join kept nodes, as both loaders read for `shown` alone
    const totalMemoryCount = memories.length;
    const shown = newestGraphMemories(
      memories,
      MAX_GRAPH_NODES - skillNodes.length,
    );
    const [relatesToEdges, entities] = await Promise.all([
      loadGraphLinks(ctx, shown),
      loadGraphEntities(
        ctx,
        shown,
        MAX_GRAPH_NODES - skillNodes.length - shown.length,
      ),
    ]);

    return {
      nodes: [
        ...memoryGraphNodes(shown),
        ...entities.entityNodes,
        ...skillNodes,
      ],
      relatesToEdges,
      tagEdges: [],
      mentionsEdges: entities.mentionsEdges,
      focusNodeId: args.focus,
      totalMemoryCount,
    };
  },
});

export const getNodeContent = authAction({
  args: {
    memoryId: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const clerkId = await requireClerkId(ctx);
    if (args.profileId !== undefined) {
      const resolved = await ctx.runQuery(
        internal.teams.resolveMemoryScopeInternal,
        { userId: ctx.userId, profileId: args.profileId },
      );
      if (resolved.kind === "team") {
        const teamMemory = await ctx.runQuery(
          internal.memoryStore.functions.getMemoryForTeamInternal,
          { profileId: resolved.profileId, memoryId: args.memoryId },
        );
        return teamMemory?.content ?? "";
      }
    }
    const memory = await ctx.runQuery(
      internal.memoryStore.functions.getMemoryInternal,
      { userId: clerkId, memoryId: args.memoryId },
    );
    return memory?.content ?? "";
  },
});
