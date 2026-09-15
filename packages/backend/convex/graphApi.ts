import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MemoryType, MemoryWithTags } from "./memoryApi/types";

const WIKI_PREFIX = "wiki:";
const SKILL_PREFIX = "skill:";

interface GraphNodeEntry {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  kind: "memory" | "wiki-document" | "wiki-folder" | "skill" | "entity";
  source?: string;
  sourceType: string | null;
  type?: MemoryType;
  entityType?: string;
  content?: string;
}

interface GraphResult {
  nodes: GraphNodeEntry[];
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
  wikiParentEdges: { source: string; target: string }[];
  mentionsEdges: { source: string; target: string }[];
  focusNodeId?: string;
  totalMemoryCount?: number;
  nextCursorCreatedAt?: string;
  nextCursorId?: string;
}

function memoryNodes(memories: MemoryWithTags[]): GraphNodeEntry[] {
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
    let memories: MemoryWithTags[];
    if (args.profileId !== undefined) {
      const scope = await ctx.runQuery(
        internal.teams.resolveMemoryScopeInternal,
        { userId: ctx.userId, profileId: args.profileId },
      );
      if (scope.kind === "team") {
        teamId = scope.teamId;
        memories = await ctx.runQuery(
          internal.memoryStore.functions.collectScopedMemoriesInternal,
          { kind: "team", profileId: args.profileId },
        );
      } else {
        memories = await ctx.runQuery(
          internal.memoryStore.functions.collectScopedMemoriesInternal,
          {
            kind: "personal",
            userId: clerkId,
            profileId: args.profileId,
          },
        );
      }
    } else {
      memories = await ctx.runQuery(
        internal.memoryStore.functions.collectScopedMemoriesInternal,
        { kind: "personal", userId: clerkId },
      );
    }

    if (args.focus !== undefined) {
      memories = memories.filter((memory) => memory.id === args.focus);
    }

    const wikiRows = includeAccountAtoms
      ? await ctx.runQuery(internal.wiki.listForGraphInternal, {
          userId: ctx.userId,
          teamId,
        })
      : [];

    const wikiNodes: GraphNodeEntry[] = wikiRows.map((w) => ({
      id: `${WIKI_PREFIX}${w._id}`,
      title: w.title,
      content:
        w.kind === "document" || w.kind === "artifact"
          ? (w.contentText ?? "")
          : "",
      tags: [],
      createdAt: new Date(w.createdAt).toISOString(),
      kind: w.kind === "folder" ? "wiki-folder" : "wiki-document",
      sourceType: null,
    }));

    const wikiParentEdges: { source: string; target: string }[] = wikiRows
      .filter((w) => w.parentId !== undefined)
      .map((w) => ({
        source: `${WIKI_PREFIX}${w.parentId}`,
        target: `${WIKI_PREFIX}${w._id}`,
      }));

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

    return {
      nodes: [...memoryNodes(memories), ...wikiNodes, ...skillNodes],
      relatesToEdges: [],
      tagEdges: [],
      wikiParentEdges,
      mentionsEdges: [],
      focusNodeId: args.focus,
      totalMemoryCount: memories.length,
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
