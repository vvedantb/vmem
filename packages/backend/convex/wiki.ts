import { v } from "convex/values";
import { authMutation, authQuery } from "./auth";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { wikiNodeFields } from "./validators";

/**
 * Wiki (Obsidian-style notes) backend.
 *
 * A single wikiNodes table holds both folders and documents, discriminated by
 * `kind`. Folders just provide hierarchy; content lives on documents.
 *
 * listTree returns every node for the current user in one shot — trees are
 * assembled on the client. This keeps live-reactivity simple (one subscription
 * invalidates the whole tree on any change).
 */

const MAX_SEARCH_RESULTS = 20;

/** Returns all wikiNodes owned by the current user, sorted by `order` ascending. */
export const listTree = authQuery({
  args: {},
  handler: async (ctx) => {
    const nodes = await ctx.db
      .query("wikiNodes")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
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
    return await ctx.db
      .query("wikiNodes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/** Fetch a single node by id (scoped to current user). Returns null if missing or cross-user. */
export const getNode = authQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalized = ctx.db.normalizeId("wikiNodes", args.id);
    if (!normalized) return null;
    const node = await ctx.db.get(normalized);
    if (!node || node.userId !== ctx.userId) return null;
    return node;
  },
});

/**
 * Create a new folder or document under `parentId` (or at root when undefined).
 * Automatically assigns `order = max(sibling.order) + 1`.
 */
export const createNode = authMutation({
  args: {
    parentId: v.optional(v.id("wikiNodes")),
    kind: v.union(v.literal("folder"), v.literal("document")),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    // Guard: parent must exist, belong to user, and be a folder.
    if (args.parentId !== undefined) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.userId !== ctx.userId) {
        throw new Error("Parent not found");
      }
      if (parent.kind !== "folder") {
        throw new Error("Parent must be a folder");
      }
    }

    const siblings = await ctx.db
      .query("wikiNodes")
      .withIndex("by_user_parent", (q) =>
        q.eq("userId", ctx.userId).eq("parentId", args.parentId),
      )
      .collect();
    const nextOrder =
      siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.order)) + 1;

    const now = Date.now();
    const id = await ctx.db.insert("wikiNodes", {
      userId: ctx.userId,
      parentId: args.parentId,
      kind: args.kind,
      title: args.title,
      contentJson: args.kind === "document" ? "" : undefined,
      contentText: args.kind === "document" ? "" : undefined,
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

/** Rename a folder or document. */
export const renameNode = authMutation({
  args: { id: v.id("wikiNodes"), title: v.string() },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.id);
    if (!node || node.userId !== ctx.userId) {
      throw new Error("Not found");
    }
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
    contentJson: v.string(),
    contentText: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.id);
    if (!node || node.userId !== ctx.userId) {
      throw new Error("Not found");
    }
    if (node.kind !== "document") {
      throw new Error("Cannot write content to a folder");
    }
    await ctx.db.patch(args.id, {
      contentJson: args.contentJson,
      contentText: args.contentText,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Recursively delete a node and every descendant.
 *
 * Builds a parentId → children map over a single user-scoped collect(), then
 * walks the tree in-memory — avoiding N recursive queries.
 */
export const deleteNode = authMutation({
  args: { id: v.id("wikiNodes") },
  handler: async (ctx, args) => {
    const root = await ctx.db.get(args.id);
    if (!root || root.userId !== ctx.userId) {
      throw new Error("Not found");
    }

    const allNodes = await ctx.db
      .query("wikiNodes")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

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
  },
});

/**
 * Move a node to a new parent and/or reorder within its siblings.
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
    if (!node || node.userId !== ctx.userId) {
      throw new Error("Not found");
    }
    if (args.newParentId !== undefined) {
      const parent = await ctx.db.get(args.newParentId);
      if (!parent || parent.userId !== ctx.userId) {
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
 * Union search across title + content full-text indexes.
 * Returns unique nodes, documents preferred, capped at 20.
 */
export const search = authQuery({
  args: { queryText: v.string() },
  handler: async (ctx, args) => {
    const trimmed = args.queryText.trim();
    if (trimmed.length === 0) return [];

    const titleMatches = await ctx.db
      .query("wikiNodes")
      .withSearchIndex("search_title", (q) =>
        q.search("title", trimmed).eq("userId", ctx.userId),
      )
      .take(MAX_SEARCH_RESULTS);

    const contentMatches = await ctx.db
      .query("wikiNodes")
      .withSearchIndex("search_content", (q) =>
        q.search("contentText", trimmed).eq("userId", ctx.userId),
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
