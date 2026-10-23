import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { MemoryType } from "./memoryApi/types";
import type { GraphEntityNode } from "./memoryStore/entities";
import type { GraphMemory } from "./memoryStore/mappers";
import {
  collectScopedGraphMemoriesPaged,
  GRAPH_PAGE_SIZE,
  MAX_GRAPH_PAGES,
  walkGraphRowsPaged,
  type GraphRowsLoad,
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

// caps a graph read can hit; a snapshot that hit any is marked truncated
export type GraphCap =
  | "authors"
  | "link_pages"
  | "entity_pages"
  | "mention_pages"
  | "relates_edges"
  | "mentions_edges"
  | "memory_nodes"
  | "entity_nodes";

// Page and author budget of one graph read. capsHit collects every cap that
// actually dropped rows.
export interface GraphReadBudget {
  maxPages: number;
  maxAuthors: number;
  pageSize: number;
  capsHit: Set<GraphCap>;
}

function graphReadBudget(
  limits: Partial<Omit<GraphReadBudget, "capsHit">> = {},
): GraphReadBudget {
  return {
    maxPages: limits.maxPages ?? MAX_GRAPH_PAGES,
    maxAuthors: limits.maxAuthors ?? MAX_GRAPH_AUTHORS,
    pageSize: limits.pageSize ?? GRAPH_PAGE_SIZE,
    capsHit: new Set(),
  };
}

function graphAuthors(
  memories: readonly GraphMemory[],
  budget: GraphReadBudget,
): string[] {
  const authors = [...new Set(memories.map((memory) => memory.userId))].sort();
  if (authors.length > budget.maxAuthors) budget.capsHit.add("authors");
  return authors.slice(0, budget.maxAuthors);
}

async function walkGraphRows<T>(
  budget: GraphReadBudget,
  cap: GraphCap,
  load: GraphRowsLoad<T>,
  onRows: (rows: T[]) => boolean | void,
): Promise<void> {
  if (await walkGraphRowsPaged(load, onRows, budget)) budget.capsHit.add(cap);
}

export function memoryGraphNodes(
  memories: readonly GraphMemory[],
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
export function newestGraphMemories<M extends GraphMemory>(
  memories: readonly M[],
  max: number,
): readonly M[] {
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
// Rows are filtered page by page; the walk stops once `maxEdges` is full.
export async function loadGraphLinks(
  ctx: Pick<ActionCtx, "runQuery">,
  memories: readonly GraphMemory[],
  maxEdges: number = MAX_GRAPH_EDGES,
  budget: GraphReadBudget = graphReadBudget(),
): Promise<GraphRelatesToEdge[]> {
  const memoryIds = new Set(memories.map((memory) => memory.id));
  const edges = new Map<string, GraphRelatesToEdge>();
  for (const userId of graphAuthors(memories, budget)) {
    if (budget.capsHit.has("relates_edges")) break;
    await walkGraphRows(
      budget,
      "link_pages",
      (page) =>
        ctx.runQuery(
          internal.memoryStore.functions.paginateMemoryLinksForUserInternal,
          { userId, ...page },
        ),
      (links) => {
        for (const link of links) {
          if (!memoryIds.has(link.sourceId) || !memoryIds.has(link.targetId)) {
            continue;
          }
          const key = `${link.sourceId}|${link.targetId}`;
          if (edges.has(key)) continue;
          if (edges.size >= maxEdges) {
            budget.capsHit.add("relates_edges");
            return false;
          }
          edges.set(key, {
            source: link.sourceId,
            target: link.targetId,
            reason: link.reason,
          });
        }
        return undefined;
      },
    );
  }
  return [...edges.values()];
}

// Entity nodes mentioned by `memories`, plus the memory→entity edges. Edges
// come out entity by entity, in entity creation order (authors in turn).
// Past `maxNodes`, the most-mentioned entities are kept (ties: that order).
// Mentions are read first, so only mentioned entities are kept per page.
export async function loadGraphEntities(
  ctx: Pick<ActionCtx, "runQuery">,
  memories: readonly GraphMemory[],
  maxNodes: number = Infinity,
  maxEdges: number = MAX_GRAPH_EDGES,
  budget: GraphReadBudget = graphReadBudget(),
): Promise<{
  entityNodes: GraphNodeEntry[];
  mentionsEdges: GraphMentionsEdge[];
}> {
  const memoryIds = new Set(memories.map((memory) => memory.id));
  const authors = graphAuthors(memories, budget);
  const mentionedBy = new Map<string, Set<string>>();
  for (const userId of authors) {
    await walkGraphRows(
      budget,
      "mention_pages",
      (page) =>
        ctx.runQuery(
          internal.memoryStore.functions.paginateEntityMentionsForGraphInternal,
          { userId, ...page },
        ),
      (mentions) => {
        for (const mention of mentions) {
          if (!memoryIds.has(mention.memoryId)) continue;
          const ids = mentionedBy.get(mention.entityId);
          if (ids === undefined) {
            mentionedBy.set(mention.entityId, new Set([mention.memoryId]));
          } else {
            ids.add(mention.memoryId);
          }
        }
      },
    );
  }
  const candidates: Array<{ node: GraphEntityNode; mentionedIn: string[] }> =
    [];
  const seen = new Set<string>();
  for (const userId of authors) {
    await walkGraphRows(
      budget,
      "entity_pages",
      (page) =>
        ctx.runQuery(
          internal.memoryStore.functions.paginateEntitiesForGraphInternal,
          { userId, ...page },
        ),
      (entities) => {
        for (const node of entities) {
          if (seen.has(node.id)) continue;
          seen.add(node.id);
          const mentionedIn = mentionedBy.get(node.id);
          if (mentionedIn !== undefined) {
            candidates.push({ node, mentionedIn: [...mentionedIn] });
          }
        }
      },
    );
  }
  let kept = candidates;
  if (candidates.length > maxNodes) {
    budget.capsHit.add("entity_nodes");
    const top = new Set(
      [...candidates]
        .sort((a, b) => b.mentionedIn.length - a.mentionedIn.length)
        .slice(0, Math.max(0, maxNodes)),
    );
    kept = candidates.filter((candidate) => top.has(candidate));
  }
  const entityNodes: GraphNodeEntry[] = [];
  const mentionsEdges: GraphMentionsEdge[] = [];
  for (const { node, mentionedIn } of kept) {
    const room = maxEdges - mentionsEdges.length;
    if (room < mentionedIn.length) budget.capsHit.add("mentions_edges");
    if (room <= 0) continue;
    for (const memoryId of mentionedIn.slice(0, room)) {
      mentionsEdges.push({ source: memoryId, target: node.id });
    }
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
  return { entityNodes, mentionsEdges };
}

export interface ScopedGraph {
  nodes: GraphNodeEntry[];
  relatesToEdges: GraphRelatesToEdge[];
  mentionsEdges: GraphMentionsEdge[];
  totalMemoryCount: number;
  capsHit: GraphCap[];
}

// The account graph of one scope (no profileId: every personal memory; a
// personal profile; a team profile), the way getGraphData scopes it. Skills
// first, then the newest memories, then entities fill the rest; edges only
// join kept nodes, as both loaders read for `shown` alone. maxPages and
// maxAuthors default to the interactive budget (MAX_GRAPH_PAGES,
// MAX_GRAPH_AUTHORS); the snapshot build raises them.
export async function loadScopedGraph(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    clerkId: string;
    profileId?: string;
    focus?: string;
    includeSkills: boolean;
    maxNodes: number;
    maxEdges: number;
    maxPages?: number;
    maxAuthors?: number;
    pageSize?: number;
  },
): Promise<ScopedGraph> {
  const budget = graphReadBudget(args);
  let teamId: Id<"teams"> | undefined;
  let memories: readonly GraphMemory[];
  if (args.profileId !== undefined) {
    const scope = await ctx.runQuery(
      internal.teams.resolveMemoryScopeInternal,
      { userId: args.userId, profileId: args.profileId },
    );
    if (scope.kind === "team") {
      teamId = scope.teamId;
      memories = await collectScopedGraphMemoriesPaged(ctx, {
        kind: "team",
        profileId: args.profileId,
      });
    } else {
      memories = await collectScopedGraphMemoriesPaged(ctx, {
        kind: "personal",
        userId: args.clerkId,
        profileId: args.profileId,
      });
    }
  } else {
    memories = await collectScopedGraphMemoriesPaged(ctx, {
      kind: "personal",
      userId: args.clerkId,
    });
  }

  if (args.focus !== undefined) {
    memories = memories.filter((memory) => memory.id === args.focus);
  }

  const skillRows = args.includeSkills
    ? await ctx.runQuery(internal.skills.listForGraphInternal, {
        userId: args.userId,
        teamId,
      })
    : [];
  const skillNodes = skillGraphNodes(skillRows);

  const totalMemoryCount = memories.length;
  const shown = newestGraphMemories(
    memories,
    args.maxNodes - skillNodes.length,
  );
  if (shown.length < totalMemoryCount) budget.capsHit.add("memory_nodes");
  const [relatesToEdges, entities] = await Promise.all([
    loadGraphLinks(ctx, shown, args.maxEdges, budget),
    loadGraphEntities(
      ctx,
      shown,
      args.maxNodes - skillNodes.length - shown.length,
      args.maxEdges,
      budget,
    ),
  ]);

  return {
    nodes: [...memoryGraphNodes(shown), ...entities.entityNodes, ...skillNodes],
    relatesToEdges,
    mentionsEdges: entities.mentionsEdges,
    totalMemoryCount,
    capsHit: [...budget.capsHit].sort(),
  };
}

export function skillGraphNodes(
  skills: ReadonlyArray<{
    _id: string;
    name: string;
    description: string;
    createdAt: number;
    enabled?: boolean;
  }>,
): GraphNodeEntry[] {
  return skills
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
    const graph = await loadScopedGraph(ctx, {
      userId: ctx.userId,
      clerkId,
      profileId: args.profileId,
      focus: args.focus,
      includeSkills: !isLocal && isFirstPage,
      maxNodes: MAX_GRAPH_NODES,
      maxEdges: MAX_GRAPH_EDGES,
    });
    return {
      nodes: graph.nodes,
      relatesToEdges: graph.relatesToEdges,
      mentionsEdges: graph.mentionsEdges,
      totalMemoryCount: graph.totalMemoryCount,
      tagEdges: [],
      focusNodeId: args.focus,
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
