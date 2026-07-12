import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

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
 * `sourceType` is the connector provenance (google_drive / notion) on
 * memories that came in through a connector sync. null for MCP / manual / web
 * captures and for non-memory kinds. The renderer uses it to overlay a brand
 * logo inside the node so users can see where the memory came from.
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
  /** Entity sub-type (person/organization/place/technology). Only for entity nodes. */
  entityType?: string;
  /**
   * Content is inlined for wiki documents (contentText) and skills
   * (description) — those sets are small and pulling separately would add
   * latency for no payload win. Memory nodes intentionally omit content; the
   * UI fetches it lazily via `getNodeContent` on hover/click. Dropping memory
   * content from the graph payload was what let us fit the graph under
   * Convex's 1 MiB value limit at ~2000 memories.
   */
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
  /** Folder → child edges inside the wiki tree. */
  wikiParentEdges: { source: string; target: string }[];
  /** Memory → entity MENTIONS edges. */
  mentionsEdges: { source: string; target: string }[];
  /**
   * The memory the local graph is centred on. Present in local mode even
   * when the server picked the focus itself (no explicit focus → newest
   * memory); absent on the global graph.
   */
  focusNodeId?: string;
  /**
   * Total active/pinned memories (after profile filter). Present in global
   * mode's FIRST page so the UI can show "Showing X of Y" + Load more
   * instead of silently truncating.
   */
  totalMemoryCount?: number;
  /**
   * Keyset cursor (createdAt + id of this page's last node) for the next
   * global-graph page; absent when this page exhausted the data.
   */
  nextCursorCreatedAt?: string;
  nextCursorId?: string;
}

interface MemoryGraph {
  nodes: {
    id: string;
    title: string;
    tags: string[];
    createdAt: string;
    source?: string;
    sourceType: string | null;
    type?: MemoryType;
  }[];
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
  entities: Array<{
    normalizedName: string;
    name: string;
    type: string;
    memoryIds: string[];
  }>;
  mentionsEdges: Array<{ source: string; target: string }>;
  /** Resolved focus (local mode only) — set even when the server picked it. */
  focusNodeId?: string;
  /** Total active memories (global mode, first page) for "Showing X of Y". */
  totalMemoryCount?: number;
  /** Keyset cursor for the next global page; absent when exhausted. */
  nextCursorCreatedAt?: string;
  nextCursorId?: string;
}

/** Prefix applied to wikiNode ids so they never collide with Neo4j memory ids. */
const WIKI_PREFIX = "wiki:";

/** Prefix applied to skill ids so they never collide with memory or wiki ids. */
const SKILL_PREFIX = "skill:";

/** Prefix applied to entity ids so they never collide with other node types. */
const ENTITY_PREFIX = "entity:";

// NOTE: We initially cached this action via @convex-dev/action-cache with a
// 30s TTL. Production users hit Convex's 1 MiB value-size limit (graphs with
// ~2000 memories + full content payloads routinely serialised past 1 MiB).
// Caching was removed here. Since then we moved memory `content` off the
// graph payload (lazy-fetched via `getNodeContent` on hover/click), which
// brought the payload comfortably under the limit — caching could plausibly
// be re-enabled now, but the Cypher-side wins already make the dashboard
// feel fast. Leaving uncached until we have a measurement that shows
// otherwise.

function annotateMemoryNodes(nodes: MemoryGraph["nodes"]): GraphNodeEntry[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
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
    // mode "local" = focus neighbourhood (focus omitted → server centres on
    // the newest memory). mode "global" = full capped graph. Absent → old
    // focus-implies-local semantics (kept for existing callers).
    mode: v.optional(v.union(v.literal("local"), v.literal("global"))),
    /** Local-mode hop depth, clamped to [1, 3] server-side. Default 2. */
    depth: v.optional(v.number()),
    /** Global-mode page size (newest-first), clamped to [1, 5000]. */
    nodeLimit: v.optional(v.number()),
    /** Keyset cursor (previous page's nextCursor*) for the next global page. */
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
    // Wiki + skills are whole-account atoms: only on the global graph's
    // first page (later pages would duplicate the same rows).
    const includeAccountAtoms = !isLocal && isFirstPage;

    const memoryGraph: MemoryGraph = await ctx.runAction(
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

    // Wiki nodes are only included for the global graph. When the user focuses
    // a specific memory we show its local Neo4j neighbourhood — wiki docs are
    // orthogonal to memories today and have no edges reaching a memory node.
    const wikiRows = includeAccountAtoms
      ? await ctx.runQuery(internal.wiki.listForUserInternal, {
          userId: ctx.userId,
        })
      : [];

    const wikiNodes: GraphNodeEntry[] = wikiRows.map((w: Doc<"wikiNodes">) => ({
      id: `${WIKI_PREFIX}${w._id}`,
      title: w.title,
      content: w.kind === "document" ? (w.contentText ?? "") : "",
      tags: [],
      createdAt: new Date(w.createdAt).toISOString(),
      kind: w.kind === "folder" ? "wiki-folder" : "wiki-document",
      sourceType: null,
    }));

    const wikiParentEdges: { source: string; target: string }[] = wikiRows
      .filter((w: Doc<"wikiNodes">) => w.parentId !== undefined)
      .map((w: Doc<"wikiNodes">) => ({
        source: `${WIKI_PREFIX}${w.parentId}`,
        target: `${WIKI_PREFIX}${w._id}`,
      }));

    // Skills — same visibility rule as wiki. Skills are user-level atoms
    // with no edges into the memory graph today, so they render as
    // isolated hexagons.
    const skillRows = includeAccountAtoms
      ? await ctx.runQuery(internal.skills.listByClerkIdInternal, {
          clerkId,
        })
      : [];

    const skillNodes: GraphNodeEntry[] = skillRows
      .filter((s: Doc<"skills">) => s.enabled !== false)
      .map((s: Doc<"skills">) => ({
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

/**
 * Lazy-fetch the content body for a single memory node. Called from the graph
 * tooltip/detail panel when the user hovers or clicks a memory — memories
 * omit `content` from the graph payload to keep the full-graph response under
 * Convex's 1 MiB value limit.
 *
 * The UI caches results client-side by memory id so repeated hovers are free.
 */
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
