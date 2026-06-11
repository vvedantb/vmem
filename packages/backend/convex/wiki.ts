import { v } from "convex/values";
import { authMutation, authQuery } from "./auth";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { wikiNodeFields } from "./validators";
import {
  assertContentDeletable,
  assertContentEditable,
  isContentReadable,
  requireContentScopeAccess,
} from "./teams/auth";

/**
 * Wiki (Obsidian-style notes) backend.
 *
 * A single wikiNodes table holds both folders and documents, discriminated by
 * `kind`. Folders just provide hierarchy; content lives on documents.
 *
 * Scoping ("user-wide + team"): nodes without `teamId` are personal and
 * visible in every personal workspace; nodes with `teamId` form a team wiki
 * shared by all members (any member edits, creator-or-owner deletes). A
 * subtree never mixes scopes — parent/child consistency is enforced on
 * create and move.
 *
 * listTree returns every node in the requested scope in one shot — trees are
 * assembled on the client. This keeps live-reactivity simple (one subscription
 * invalidates the whole tree on any change).
 */

const MAX_SEARCH_RESULTS = 20;

/** Every node in a scope: a team's wiki, or the user's personal nodes. */
async function listScopeNodes(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<Array<Doc<"wikiNodes">>> {
  if (teamId !== undefined) {
    return await ctx.db
      .query("wikiNodes")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
  }
  const nodes = await ctx.db
    .query("wikiNodes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return nodes.filter((n) => n.teamId === undefined);
}

/** Siblings under one parent within a scope (for order assignment). */
async function listScopeSiblings(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  parentId: Id<"wikiNodes"> | undefined,
): Promise<Array<Doc<"wikiNodes">>> {
  if (teamId !== undefined) {
    return await ctx.db
      .query("wikiNodes")
      .withIndex("by_team_parent", (q) =>
        q.eq("teamId", teamId).eq("parentId", parentId),
      )
      .collect();
  }
  const siblings = await ctx.db
    .query("wikiNodes")
    .withIndex("by_user_parent", (q) =>
      q.eq("userId", userId).eq("parentId", parentId),
    )
    .collect();
  return siblings.filter((n) => n.teamId === undefined);
}

/**
 * Returns all wikiNodes in the requested scope, sorted by `order` ascending.
 * No `teamId` = personal nodes; `teamId` = that team's wiki (members only).
 */
export const listTree = authQuery({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    const nodes = await listScopeNodes(ctx, ctx.userId, args.teamId);
    return nodes.sort((a, b) => a.order - b.order);
  },
});

/**
 * Internal variant of `listTree` that takes an explicit userId instead of deriving
 * it from auth. Called by `graphApi.getGraphData` (an action) so the graph payload
 * can include wiki folders/documents as extra nodes alongside Neo4j memories.
 *
 * Kept separate from `listTree` to avoid relying on auth propagation through
 * runQuery and to mirror the pattern used by `internal.auth.getClerkIdInternal`.
 */
export const listForUserInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("wikiNodes"),
      _creationTime: v.number(),
      ...wikiNodeFields,
    }),
  ),
  handler: async (ctx, args) => {
    const nodes = await ctx.db
      .query("wikiNodes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    // Graph payloads are personal-scope only — never include team nodes.
    return nodes.filter((n) => n.teamId === undefined);
  },
});

/** Fetch a single node by id. Returns null if missing or not readable (owner or team member). */
export const getNode = authQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalized = ctx.db.normalizeId("wikiNodes", args.id);
    if (!normalized) return null;
    const node = await ctx.db.get(normalized);
    if (!node) return null;
    if (!(await isContentReadable(ctx, node, ctx.userId))) return null;
    return node;
  },
});

/**
 * Create a new folder or document under `parentId` (or at root when undefined),
 * in the personal scope or a team's wiki. Automatically assigns
 * `order = max(sibling.order) + 1`.
 */
export const createNode = authMutation({
  args: {
    parentId: v.optional(v.id("wikiNodes")),
    kind: v.union(v.literal("folder"), v.literal("document")),
    title: v.string(),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);

    // Guard: parent must exist, be a folder, and live in the SAME scope —
    // a subtree never mixes personal and team nodes.
    if (args.parentId !== undefined) {
      const parent = await ctx.db.get(args.parentId);
      if (
        !parent ||
        parent.teamId !== args.teamId ||
        (args.teamId === undefined && parent.userId !== ctx.userId)
      ) {
        throw new Error("Parent not found");
      }
      if (parent.kind !== "folder") {
        throw new Error("Parent must be a folder");
      }
    }

    const siblings = await listScopeSiblings(
      ctx,
      ctx.userId,
      args.teamId,
      args.parentId,
    );
    const nextOrder =
      siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.order)) + 1;

    const now = Date.now();
    const id = await ctx.db.insert("wikiNodes", {
      userId: ctx.userId,
      teamId: args.teamId,
      parentId: args.parentId,
      kind: args.kind,
      title: args.title,
      content: args.kind === "document" ? "" : undefined,
      contentText: args.kind === "document" ? "" : undefined,
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

/** Rename a folder or document (any team member for team nodes). */
export const renameNode = authMutation({
  args: { id: v.id("wikiNodes"), title: v.string() },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.id);
    if (!node) throw new Error("Not found");
    await assertContentEditable(ctx, node, ctx.userId);
    await ctx.db.patch(args.id, { title: args.title, updatedAt: Date.now() });
  },
});

/**
 * Persist editor content. Called on autosave (debounced client-side).
 * Only valid for documents — calling on a folder throws.
 *
 * TODO(v2): parse [[wikilinks]] out of contentText here and upsert a wikiLinks table.
 */
export const updateContent = authMutation({
  args: {
    id: v.id("wikiNodes"),
    content: v.string(),
    contentText: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.id);
    if (!node) throw new Error("Not found");
    await assertContentEditable(ctx, node, ctx.userId);
    if (node.kind !== "document") {
      throw new Error("Cannot write content to a folder");
    }
    await ctx.db.patch(args.id, {
      content: args.content,
      contentText: args.contentText,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Recursively delete a node and every descendant.
 *
 * Builds a parentId → children map over a single scope-wide collect(), then
 * walks the tree in-memory — avoiding N recursive queries. The caller is
 * responsible for the permission check on the root (deletable gate).
 */
async function deleteWikiSubtree(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  rootId: Id<"wikiNodes">,
): Promise<number> {
  const root = await ctx.db.get(rootId);
  if (!root) throw new Error("Not found");
  await assertContentDeletable(ctx, root, actorUserId);

  const allNodes = await listScopeNodes(ctx, root.userId, root.teamId);

  const childrenByParent = new Map<string, Array<Doc<"wikiNodes">>>();
  for (const node of allNodes) {
    const key = node.parentId ?? "__root__";
    const list = childrenByParent.get(key) ?? [];
    list.push(node);
    childrenByParent.set(key, list);
  }

  const toDelete: Array<Id<"wikiNodes">> = [];
  const stack: Array<Id<"wikiNodes">> = [root._id];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    toDelete.push(current);
    const children = childrenByParent.get(current) ?? [];
    for (const child of children) {
      stack.push(child._id);
    }
  }

  for (const id of toDelete) {
    await ctx.db.delete(id);
  }

  return toDelete.length;
}

export const deleteNode = authMutation({
  args: { id: v.id("wikiNodes") },
  handler: async (ctx, args) => {
    await deleteWikiSubtree(ctx, ctx.userId, args.id);
  },
});

/**
 * Move a node to a new parent and/or reorder within its siblings.
 * Cross-scope moves (personal ↔ team) are rejected.
 * Exposed for future drag-to-reorder UI; v1 UI doesn't use it yet.
 */
export const moveNode = authMutation({
  args: {
    id: v.id("wikiNodes"),
    newParentId: v.optional(v.id("wikiNodes")),
    newOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.id);
    if (!node) throw new Error("Not found");
    await assertContentEditable(ctx, node, ctx.userId);
    if (args.newParentId !== undefined) {
      const parent = await ctx.db.get(args.newParentId);
      if (
        !parent ||
        parent.teamId !== node.teamId ||
        (node.teamId === undefined && parent.userId !== node.userId)
      ) {
        throw new Error("Parent not found");
      }
      if (parent.kind !== "folder") {
        throw new Error("Parent must be a folder");
      }
      // Guard against cycles: parent cannot be a descendant of node.
      let cursor: Doc<"wikiNodes"> | null = parent;
      while (cursor !== null) {
        if (cursor._id === node._id) {
          throw new Error("Cannot move a node into its own descendant");
        }
        cursor = cursor.parentId ? await ctx.db.get(cursor.parentId) : null;
      }
    }

    await ctx.db.patch(args.id, {
      parentId: args.newParentId,
      order: args.newOrder,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Union search across title + content full-text indexes, within one scope
 * (personal by default, a team's wiki when `teamId` is set).
 * Returns unique nodes, documents preferred, capped at 20.
 */
export const search = authQuery({
  args: { queryText: v.string(), teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    const trimmed = args.queryText.trim();
    if (trimmed.length === 0) return [];
    const teamId = args.teamId;

    const titleMatches = await ctx.db
      .query("wikiNodes")
      .withSearchIndex("search_title", (q) =>
        teamId !== undefined
          ? q.search("title", trimmed).eq("teamId", teamId)
          : q
              .search("title", trimmed)
              .eq("userId", ctx.userId)
              .eq("teamId", undefined),
      )
      .take(MAX_SEARCH_RESULTS);

    const contentMatches = await ctx.db
      .query("wikiNodes")
      .withSearchIndex("search_content", (q) =>
        teamId !== undefined
          ? q.search("contentText", trimmed).eq("teamId", teamId)
          : q
              .search("contentText", trimmed)
              .eq("userId", ctx.userId)
              .eq("teamId", undefined),
      )
      .take(MAX_SEARCH_RESULTS);

    const seen = new Set<string>();
    const merged: Array<Doc<"wikiNodes">> = [];
    for (const node of [...titleMatches, ...contentMatches]) {
      if (seen.has(node._id)) continue;
      seen.add(node._id);
      merged.push(node);
      if (merged.length >= MAX_SEARCH_RESULTS) break;
    }
    return merged;
  },
});

// --- Internal helpers (MCP after JWT verification) ---

async function getUserIdByClerkId(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
): Promise<Id<"users">> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
  if (!user) {
    throw new Error("User not found");
  }
  return user._id;
}

/**
 * MCP stays personal-only for now: team nodes are invisible to (and
 * immutable through) the clerkId-based internals.
 */
async function getOwnedNode(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  id: string,
): Promise<Doc<"wikiNodes"> | null> {
  const normalized = ctx.db.normalizeId("wikiNodes", id);
  if (!normalized) return null;
  const node = await ctx.db.get(normalized);
  if (!node || node.userId !== userId || node.teamId !== undefined) {
    return null;
  }
  return node;
}

export const listByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const nodes = await listScopeNodes(ctx, userId, undefined);
    return nodes.sort((a, b) => a.order - b.order);
  },
});

export const getByIdInternal = internalQuery({
  args: { clerkId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    return await getOwnedNode(ctx, userId, args.id);
  },
});

export const searchByClerkIdInternal = internalQuery({
  args: { clerkId: v.string(), queryText: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const trimmed = args.queryText.trim();
    if (trimmed.length === 0) return [];

    const titleMatches = await ctx.db
      .query("wikiNodes")
      .withSearchIndex("search_title", (q) =>
        q.search("title", trimmed).eq("userId", userId).eq("teamId", undefined),
      )
      .take(MAX_SEARCH_RESULTS);

    const contentMatches = await ctx.db
      .query("wikiNodes")
      .withSearchIndex("search_content", (q) =>
        q
          .search("contentText", trimmed)
          .eq("userId", userId)
          .eq("teamId", undefined),
      )
      .take(MAX_SEARCH_RESULTS);

    const seen = new Set<string>();
    const merged: Array<Doc<"wikiNodes">> = [];
    for (const node of [...titleMatches, ...contentMatches]) {
      if (seen.has(node._id)) continue;
      seen.add(node._id);
      merged.push(node);
      if (merged.length >= MAX_SEARCH_RESULTS) break;
    }
    return merged;
  },
});

export const createByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    parentId: v.optional(v.id("wikiNodes")),
    kind: v.union(v.literal("folder"), v.literal("document")),
    title: v.string(),
    content: v.optional(v.string()),
    contentText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);

    if (args.parentId !== undefined) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.userId !== userId || parent.teamId !== undefined) {
        throw new Error("Parent not found");
      }
      if (parent.kind !== "folder") {
        throw new Error("Parent must be a folder");
      }
    }

    const siblings = await listScopeSiblings(
      ctx,
      userId,
      undefined,
      args.parentId,
    );
    const nextOrder =
      siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.order)) + 1;

    const now = Date.now();
    const isDocument = args.kind === "document";
    return await ctx.db.insert("wikiNodes", {
      userId,
      parentId: args.parentId,
      kind: args.kind,
      title: args.title,
      content: isDocument ? (args.content ?? "") : undefined,
      contentText: isDocument ? (args.contentText ?? "") : undefined,
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    id: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    contentText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const node = await getOwnedNode(ctx, userId, args.id);
    if (!node) {
      throw new Error("Not found");
    }

    const patch: {
      title?: string;
      content?: string;
      contentText?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      patch.title = args.title;
    }

    if (args.content !== undefined || args.contentText !== undefined) {
      if (node.kind !== "document") {
        throw new Error("Cannot write content to a folder");
      }
      if (args.content !== undefined) {
        patch.content = args.content;
      }
      if (args.contentText !== undefined) {
        patch.contentText = args.contentText;
      }
    }

    await ctx.db.patch(node._id, patch);
    return node._id;
  },
});

export const deleteByClerkIdInternal = internalMutation({
  args: { clerkId: v.string(), id: v.string() },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const node = await getOwnedNode(ctx, userId, args.id);
    if (!node) {
      throw new Error("Not found");
    }
    return await deleteWikiSubtree(ctx, userId, node._id);
  },
});
