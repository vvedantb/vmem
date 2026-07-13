import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import type { CappedMemoryGraph } from "./neo4jActions/graph";

type MemoryType = "profile" | "episodic" | "knowledge";

/**
 * Unified canvas node. `kind` picks shape; `source`/`type`/`sourceType` are
 * memory-scoped. Content is inlined for wiki docs and skills only — memory
 * content is lazy-fetched via `getNodeContent` to stay under Convex's 1 MiB
 * return limit.
 */
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

const WIKI_PREFIX = "wiki:";
const SKILL_PREFIX = "skill:";
const ENTITY_PREFIX = "entity:";

function annotateMemoryNodes(
  nodes: CappedMemoryGraph["nodes"],
): GraphNodeEntry[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    tags: n.tags,
    createdAt: n.createdAt,
    kind: "memory" as const,
    source: n.source,
    sourceType: n.sourceType,
    type: n.type,
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

    const memoryGraph: CappedMemoryGraph = await ctx.runAction(
      internal.neo4jActions.graph.getGraphDataInternal,
      {
        clerkId,
        focus: args.focus,
        profileId: args.profileId,
        mode: args.mode,
        depth: args.depth,
        nodeLimit: args.nodeLimit,
        cursorCreatedAt: args.cursorCreatedAt,
        cursorId: args.cursorId,
      },
    );

    const wikiRows = includeAccountAtoms
      ? await ctx.runQuery(internal.wiki.listForUserInternal, {
          userId: ctx.userId,
        })
      : [];

    const wikiNodes: GraphNodeEntry[] = wikiRows.map((w) => ({
      id: `${WIKI_PREFIX}${w._id}`,
      title: w.title,
      content: w.kind === "document" ? (w.contentText ?? "") : "",
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
      ? await ctx.runQuery(internal.skills.listByClerkIdInternal, {
          clerkId,
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

    const entityNodes: GraphNodeEntry[] = memoryGraph.entities.map((e) => ({
      id: `${ENTITY_PREFIX}${e.normalizedName}:${e.type}`,
      title: e.name,
      tags: [],
      createdAt: new Date().toISOString(),
      kind: "entity",
      sourceType: null,
      entityType: e.type,
    }));

    return {
      nodes: [
        ...annotateMemoryNodes(memoryGraph.nodes),
        ...wikiNodes,
        ...skillNodes,
        ...entityNodes,
      ],
      relatesToEdges: memoryGraph.relatesToEdges,
      tagEdges: memoryGraph.tagEdges,
      wikiParentEdges,
      mentionsEdges: memoryGraph.mentionsEdges,
      focusNodeId: memoryGraph.focusNodeId,
      totalMemoryCount: memoryGraph.totalMemoryCount,
      nextCursorCreatedAt: memoryGraph.nextCursorCreatedAt,
      nextCursorId: memoryGraph.nextCursorId,
    };
  },
});

/** Lazy memory content for graph hover/detail (omitted from graph payload). */
export const getNodeContent = authAction({
  args: {
    memoryId: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.graph.getMemoryContentInternal,
      { clerkId, memoryId: args.memoryId },
    );
  },
});
