import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";

/**
 * A node in the unified canvas graph. Memory nodes (from Neo4j) and wiki nodes
 * (from Convex `wikiNodes`) are merged into a single list; `kind` tells the
 * renderer which shape to draw.
 */
interface GraphNodeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  kind: "memory" | "wiki-document" | "wiki-folder";
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
  args: { focus: v.optional(v.string()) },
  handler: async (ctx, args): Promise<GraphResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");

    const memoryGraph: MemoryGraph = await ctx.runAction(
      internal.neo4jActions.graph.getGraphDataInternal,
      { clerkId, focus: args.focus },
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

    return {
      nodes: [...annotateMemoryNodes(memoryGraph.nodes), ...wikiNodes],
      relatesToEdges: memoryGraph.relatesToEdges,
      tagEdges: memoryGraph.tagEdges,
      wikiParentEdges,
    };
  },
});

export const getLocalGraph = authAction({
  args: { focusId: v.string() },
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
