"use node";

import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getDriver } from "../engine/neo4j/driver";
import {
  getGraphData as fetchGraphData,
  getLocalGraph,
  getMemoryContent,
  type GraphData,
} from "../engine/neo4j/memory/graph";
import type { MemoryType } from "../engine/neo4j/memory/types";

// Convex enforces a hard 8192 element limit on ANY array in a return value.
// The global graph is keyset-paged; these caps bound ONE PAGE. 5000 nodes /
// 8000 edges keep every array under 8192 with headroom.
const MAX_NODES = 5000;
const MAX_EDGES = 8000;

const WIKI_PREFIX = "wiki:";
const SKILL_PREFIX = "skill:";
const ENTITY_PREFIX = "entity:";

type CappedMemoryGraph = {
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

function capGraph(data: GraphData): CappedMemoryGraph {
  const nodes = data.nodes.slice(0, MAX_NODES);
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Keep RELATES_TO edges only when both ends are in this page — otherwise a
  // team-scoped page can ship dangling ids that belong to another workspace.
  const relatesToEdges = data.relatesToEdges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
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

async function fetchCappedMemoryGraph(args: {
  clerkId: string;
  focus?: string;
  profileId?: string;
  strictProfile?: boolean;
  mode?: "local" | "global";
  depth?: number;
  nodeLimit?: number;
  cursorCreatedAt?: string;
  cursorId?: string;
}): Promise<CappedMemoryGraph> {
  const driver = getDriver();
  const isLocal =
    args.mode !== undefined ? args.mode === "local" : args.focus !== undefined;
  const cursor =
    args.cursorCreatedAt !== undefined && args.cursorId !== undefined
      ? { createdAt: args.cursorCreatedAt, id: args.cursorId }
      : null;
  const strictProfile = args.strictProfile === true;
  const raw = isLocal
    ? await getLocalGraph(
        driver,
        args.clerkId,
        args.focus ?? null,
        args.profileId,
        args.depth,
        strictProfile,
      )
    : await fetchGraphData(
        driver,
        args.clerkId,
        args.profileId,
        args.nodeLimit,
        cursor,
        strictProfile,
      );
  return capGraph(raw);
}

/** Kept for MCP (`mcp/graph.ts`) which is not a `"use node"` module. */
export const getGraphDataInternal = internalAction({
  args: {
    clerkId: v.string(),
    focus: v.optional(v.string()),
    profileId: v.optional(v.string()),
    strictProfile: v.optional(v.boolean()),
    mode: v.optional(v.union(v.literal("local"), v.literal("global"))),
    depth: v.optional(v.number()),
    nodeLimit: v.optional(v.number()),
    cursorCreatedAt: v.optional(v.string()),
    cursorId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => fetchCappedMemoryGraph(args),
});

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

    let strictProfile = false;
    let teamId: Id<"teams"> | undefined;
    if (args.profileId !== undefined) {
      const profile = await ctx.runQuery(
        internal.teams.assertProfileAccessInternal,
        { profileId: args.profileId, userId: ctx.userId },
      );
      if (profile.teamId !== undefined) {
        strictProfile = true;
        teamId = profile.teamId;
      }
    }

    const memoryGraph = await fetchCappedMemoryGraph({
      clerkId,
      focus: args.focus,
      profileId: args.profileId,
      strictProfile,
      mode: args.mode,
      depth: args.depth,
      nodeLimit: args.nodeLimit,
      cursorCreatedAt: args.cursorCreatedAt,
      cursorId: args.cursorId,
    });

    const wikiRows = includeAccountAtoms
      ? await ctx.runQuery(internal.wiki.listForGraphInternal, {
          userId: ctx.userId,
          teamId,
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
        ...memoryGraph.nodes.map(
          (n): GraphNodeEntry => ({
            id: n.id,
            title: n.title,
            tags: n.tags,
            createdAt: n.createdAt,
            kind: "memory",
            source: n.source,
            sourceType: n.sourceType,
            type: n.type,
          }),
        ),
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

export const getNodeContent = authAction({
  args: {
    memoryId: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const clerkId = await requireClerkId(ctx);
    return await getMemoryContent(getDriver(), clerkId, args.memoryId);
  },
});
