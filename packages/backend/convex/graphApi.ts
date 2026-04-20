import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";

/**
 * A node in the unified canvas graph. Memory nodes (from Neo4j), wiki nodes
 * (from Convex `wikiNodes`), and skills (from Convex `skills`) are merged into
 * a single list; `kind` tells the renderer which shape to draw:
 *   memory        → circle
 *   wiki-document → diamond
 *   wiki-folder   → square
 *   skill         → hexagon
 */
interface GraphNodeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  kind: "memory" | "wiki-document" | "wiki-folder" | "skill";
}

interface GraphResult {
  nodes: GraphNodeEntry[];
  relatesToEdges: { source: string; target: string; reason: string }[];
  tagEdges: {
    source: string;
    target: string;
    weight: number;
    sharedTags: string[];
  }[];
  /** Folder → child edges inside the wiki tree. */
  wikiParentEdges: { source: string; target: string }[];
}

interface MemoryGraph {
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
}

/** Prefix applied to wikiNode ids so they never collide with Neo4j memory ids. */
const WIKI_PREFIX = "wiki:";

/** Prefix applied to skill ids so they never collide with memory or wiki ids. */
const SKILL_PREFIX = "skill:";

function annotateMemoryNodes(nodes: MemoryGraph["nodes"]): GraphNodeEntry[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    tags: n.tags,
    createdAt: n.createdAt,
    kind: "memory",
  }));
}

export const getGraphData = authAction({
  args: {
    focus: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GraphResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");

    const memoryGraph: MemoryGraph = await ctx.runAction(
      internal.neo4jActions.graph.getGraphDataInternal,
      { clerkId, focus: args.focus, profileId: args.profileId },
    );

    // Wiki nodes are only included for the global graph. When the user focuses
    // a specific memory we show its local Neo4j neighbourhood — wiki docs are
    // orthogonal to memories today and have no edges reaching a memory node.
    const wikiRows = args.focus
      ? []
      : await ctx.runQuery(internal.wiki.listForUserInternal, {
          userId: ctx.userId,
        });

    const wikiNodes: GraphNodeEntry[] = wikiRows.map((w) => ({
      id: `${WIKI_PREFIX}${w._id}`,
      title: w.title,
      content: w.kind === "document" ? (w.contentText ?? "") : "",
      tags: [],
      createdAt: new Date(w.createdAt).toISOString(),
      kind: w.kind === "folder" ? "wiki-folder" : "wiki-document",
    }));

    const wikiParentEdges: { source: string; target: string }[] = [];
    for (const w of wikiRows) {
      if (w.parentId !== undefined) {
        wikiParentEdges.push({
          source: `${WIKI_PREFIX}${w.parentId}`,
          target: `${WIKI_PREFIX}${w._id}`,
        });
      }
    }

    // Skills — same visibility rule as wiki: only in the global graph. Skills
    // are user-level atoms (tools) with no edges into the memory graph today,
    // so they render as isolated hexagons.
    const skillRows = args.focus
      ? []
      : await ctx.runQuery(internal.skills.listByClerkIdInternal, {
          clerkId,
        });

    const skillNodes: GraphNodeEntry[] = skillRows.map((s) => ({
      id: `${SKILL_PREFIX}${s._id}`,
      title: s.name,
      content: s.description,
      tags: [],
      createdAt: new Date(s.createdAt).toISOString(),
      kind: "skill",
    }));

    return {
      nodes: [
        ...annotateMemoryNodes(memoryGraph.nodes),
        ...wikiNodes,
        ...skillNodes,
      ],
      relatesToEdges: memoryGraph.relatesToEdges,
      tagEdges: memoryGraph.tagEdges,
      wikiParentEdges,
    };
  },
});

export const getLocalGraph = authAction({
  args: {
    focusId: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GraphResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    const memoryGraph: MemoryGraph = await ctx.runAction(
      internal.neo4jActions.graph.getLocalGraphInternal,
      {
        clerkId,
        focusId: args.focusId,
        profileId: args.profileId,
      },
    );
    return {
      nodes: annotateMemoryNodes(memoryGraph.nodes),
      relatesToEdges: memoryGraph.relatesToEdges,
      tagEdges: memoryGraph.tagEdges,
      wikiParentEdges: [],
    };
  },
});
