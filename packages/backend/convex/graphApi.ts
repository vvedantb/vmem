import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";

type MemoryType = "profile" | "episodic" | "knowledge";

/**
 * A node in the unified canvas graph. Memory nodes (from Neo4j), wiki nodes
 * (from Convex `wikiNodes`), and skills (from Convex `skills`) are merged into
 * a single list; `kind` tells the renderer which shape to draw:
 *   memory        → circle
 *   wiki-document → diamond
 *   wiki-folder   → square
 *   skill         → hexagon
 *
 * `source` and `type` are only populated on memory nodes — the list/graph
 * filter UI treats them as memory-scoped filters (non-memory nodes pass
 * through when a source/type filter is active).
 *
 * `sourceType` is the connector provenance (gmail / google_drive / notion) on
 * memories that came in through a connector sync. null for MCP / manual / web
 * captures and for non-memory kinds. The renderer uses it to overlay a brand
 * logo inside the node so users can see where the memory came from.
 */
interface GraphNodeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  kind: "memory" | "wiki-document" | "wiki-folder" | "skill";
  source?: string;
  sourceType: string | null;
  type?: MemoryType;
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
    source?: string;
    sourceType: string | null;
    type?: MemoryType;
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

// NOTE: We initially cached this action via @convex-dev/action-cache with a
// 30s TTL. Production users hit Convex's 1 MiB value-size limit on the cache
// put mutation (graphs with many memories + full content payloads routinely
// serialise past 1 MiB), which threw and took the whole action down. Caching
// was removed here; the Cypher-side optimisations in memoryService.getGraphData
// (parallel sessions, tag-edge computation in Cypher, popular-tag pre-filter)
// carry the latency win on their own. If we ever want to re-enable caching,
// we'd need to shrink the payload first — e.g. drop `content` from graph
// nodes and fetch it per-node on hover.

function annotateMemoryNodes(nodes: MemoryGraph["nodes"]): GraphNodeEntry[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    tags: n.tags,
    createdAt: n.createdAt,
    kind: "memory",
    source: n.source,
    sourceType: n.sourceType,
    type: n.type,
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
      {
        clerkId,
        focus: args.focus,
        profileId: args.profileId,
      },
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
      sourceType: null,
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
      sourceType: null,
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
