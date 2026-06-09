import { v } from "convex/values";
import { authMutation, authQuery } from "./auth";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  FILE_STORAGE_LIMIT_BYTES,
  collectSubtreeIds,
  isAncestorOrSelf,
} from "./files/lib";

/**
 * Shared filesystem backend — powers the `/files` web view and the MCP file
 * tools (`mcp/files.ts`). A single `fileNodes` table holds folders and files
 * (discriminated by `kind`); files reference Convex storage via `storageId`.
 *
 * listTree returns every node for the current user in one shot (trees are
 * assembled client-side) plus a resolved serving `url` per file, so the grid,
 * preview, and download paths never need a second round-trip.
 */

interface FileNodeWithUrl extends Doc<"fileNodes"> {
  /** Convex serving URL for files; null for folders or missing storage. */
  url: string | null;
}

interface ListTreeResult {
  nodes: Array<FileNodeWithUrl>;
  totalBytes: number;
  storageLimit: number;
}

/** All file nodes owned by the current user, each file enriched with its URL. */
export const listTree = authQuery({
  args: {},
  handler: async (ctx): Promise<ListTreeResult> => {
    const nodes = await ctx.db
      .query("fileNodes")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    let totalBytes = 0;
    const withUrls: Array<FileNodeWithUrl> = await Promise.all(
      nodes.map(async (node) => {
        if (node.kind === "file") {
          totalBytes += node.size ?? 0;
        }
        const url =
          node.kind === "file" && node.storageId
            ? await ctx.storage.getUrl(node.storageId)
            : null;
        return { ...node, url };
      }),
    );

    return {
      nodes: withUrls,
      totalBytes,
      storageLimit: FILE_STORAGE_LIMIT_BYTES,
    };
  },
});

/** Signed URL for the client to POST raw file bytes to (Convex storage). */
export const generateFileUploadUrl = authMutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Sum of all file sizes owned by a user — used for storage-limit checks. */
async function totalBytesForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<number> {
  const nodes = await ctx.db
    .query("fileNodes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return nodes.reduce(
    (sum, node) => sum + (node.kind === "file" ? (node.size ?? 0) : 0),
    0,
  );
}

/** Validate that `parentId` (when set) is a folder owned by `userId`. */
async function assertParentFolder(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  parentId: Id<"fileNodes"> | undefined,
): Promise<void> {
  if (parentId === undefined) return;
  const parent = await ctx.db.get(parentId);
  if (!parent || parent.userId !== userId) {
    throw new Error("Parent folder not found");
  }
  if (parent.kind !== "folder") {
    throw new Error("Parent must be a folder");
  }
}

/**
 * Record an uploaded file. The client has already POSTed bytes to the signed
 * URL and holds the resulting `storageId`. Enforces the per-user storage limit;
 * on overflow the orphaned blob is deleted before throwing.
 */
export const createFile = authMutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("fileNodes")),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"fileNodes">> => {
    await assertParentFolder(ctx, ctx.userId, args.parentId);

    const used = await totalBytesForUser(ctx, ctx.userId);
    if (used + args.size > FILE_STORAGE_LIMIT_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Storage limit exceeded");
    }

    const now = Date.now();
    return await ctx.db.insert("fileNodes", {
      userId: ctx.userId,
      parentId: args.parentId,
      kind: "file",
      name: args.name,
      mimeType: args.mimeType,
      size: args.size,
      storageId: args.storageId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Create an empty folder under `parentId` (or at root). */
export const createFolder = authMutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("fileNodes")),
  },
  handler: async (ctx, args): Promise<Id<"fileNodes">> => {
    await assertParentFolder(ctx, ctx.userId, args.parentId);
    const now = Date.now();
    return await ctx.db.insert("fileNodes", {
      userId: ctx.userId,
      parentId: args.parentId,
      kind: "folder",
      name: args.name,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Rename a file or folder. */
export const renameNode = authMutation({
  args: { nodeId: v.id("fileNodes"), name: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.userId !== ctx.userId) {
      throw new Error("Not found");
    }
    await ctx.db.patch(args.nodeId, { name: args.name, updatedAt: Date.now() });
  },
});

/** Move one or more nodes under a new parent (or to root). Rejects cycles. */
export const moveNodes = authMutation({
  args: {
    nodeIds: v.array(v.id("fileNodes")),
    targetParentId: v.optional(v.id("fileNodes")),
  },
  handler: async (ctx, args): Promise<void> => {
    await assertParentFolder(ctx, ctx.userId, args.targetParentId);

    const allNodes = await ctx.db
      .query("fileNodes")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    const now = Date.now();
    for (const nodeId of args.nodeIds) {
      const node = allNodes.find((n) => n._id === nodeId);
      if (!node) throw new Error("Not found");
      if (
        args.targetParentId !== undefined &&
        isAncestorOrSelf(allNodes, nodeId, args.targetParentId)
      ) {
        throw new Error("Cannot move a folder into its own descendant");
      }
      await ctx.db.patch(nodeId, {
        parentId: args.targetParentId,
        updatedAt: now,
      });
    }
  },
});

/**
 * Delete a node and (for folders) its entire subtree, dropping each file's
 * stored blob. Builds the children map over one user-scoped collect().
 */
async function deleteSubtree(
  ctx: MutationCtx,
  userId: Id<"users">,
  rootId: Id<"fileNodes">,
): Promise<number> {
  const root = await ctx.db.get(rootId);
  if (!root || root.userId !== userId) {
    throw new Error("Not found");
  }
  const allNodes = await ctx.db
    .query("fileNodes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const ids = collectSubtreeIds(allNodes, rootId);
  const byId = new Map(allNodes.map((n) => [n._id, n]));
  for (const id of ids) {
    const node = byId.get(id);
    if (node?.kind === "file" && node.storageId) {
      await ctx.storage.delete(node.storageId);
    }
    await ctx.db.delete(id);
  }
  return ids.length;
}

/** Delete the given nodes (and their subtrees). Returns total nodes removed. */
export const deleteNodes = authMutation({
  args: { nodeIds: v.array(v.id("fileNodes")) },
  handler: async (ctx, args): Promise<number> => {
    let deleted = 0;
    for (const nodeId of args.nodeIds) {
      deleted += await deleteSubtree(ctx, ctx.userId, nodeId);
    }
    return deleted;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers for MCP file tools (after JWT verification, by clerkId).
// ─────────────────────────────────────────────────────────────────────────────

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

/** All file nodes for a user, by clerkId. MCP path resolution runs over this. */
export const listByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<Array<Doc<"fileNodes">>> => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    return await ctx.db
      .query("fileNodes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/** Serving URL for a stored blob (MCP get returns this as downloadUrl). */
export const getStorageUrlInternal = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<string | null> => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Create or replace a file at a path, auto-creating any missing parent folders.
 * Called by the MCP upload action after the blob is stored. When a file already
 * exists at the path its old blob is deleted (idempotent overwrite); a folder at
 * the path is an error.
 */
export const upsertFileByPathInternal = internalMutation({
  args: {
    clerkId: v.string(),
    segments: v.array(v.string()),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args): Promise<{ nodeId: Id<"fileNodes"> }> => {
    if (args.segments.length === 0) {
      throw new Error("Path is required");
    }
    const userId = await getUserIdByClerkId(ctx, args.clerkId);

    const used = await totalBytesForUser(ctx, userId);
    if (used + args.size > FILE_STORAGE_LIMIT_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Storage limit exceeded");
    }

    const now = Date.now();
    // Walk/auto-create folder segments (all but the last).
    let parentId: Id<"fileNodes"> | undefined;
    for (let i = 0; i < args.segments.length - 1; i++) {
      const name = args.segments[i];
      const siblings = await ctx.db
        .query("fileNodes")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentId", parentId),
        )
        .collect();
      const existing = siblings.find((s) => s.name === name);
      if (existing) {
        if (existing.kind !== "folder") {
          throw new Error(`Path segment "${name}" is a file, not a folder`);
        }
        parentId = existing._id;
      } else {
        parentId = await ctx.db.insert("fileNodes", {
          userId,
          parentId,
          kind: "folder",
          name,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const fileName = args.segments[args.segments.length - 1];
    const siblings = await ctx.db
      .query("fileNodes")
      .withIndex("by_user_parent", (q) =>
        q.eq("userId", userId).eq("parentId", parentId),
      )
      .collect();
    const existing = siblings.find((s) => s.name === fileName);

    if (existing) {
      if (existing.kind !== "file") {
        throw new Error(`A folder already exists at "${fileName}"`);
      }
      if (existing.storageId) {
        await ctx.storage.delete(existing.storageId);
      }
      await ctx.db.patch(existing._id, {
        storageId: args.storageId,
        mimeType: args.mimeType,
        size: args.size,
        updatedAt: now,
      });
      return { nodeId: existing._id };
    }

    const nodeId = await ctx.db.insert("fileNodes", {
      userId,
      parentId,
      kind: "file",
      name: fileName,
      mimeType: args.mimeType,
      size: args.size,
      storageId: args.storageId,
      createdAt: now,
      updatedAt: now,
    });
    return { nodeId };
  },
});

/** Delete the node at a path (and its subtree), by clerkId. For MCP delete. */
export const deleteByIdForClerkInternal = internalMutation({
  args: { clerkId: v.string(), nodeId: v.id("fileNodes") },
  handler: async (ctx, args): Promise<{ deletedCount: number }> => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const deletedCount = await deleteSubtree(ctx, userId, args.nodeId);
    return { deletedCount };
  },
});

/** Delete an orphaned blob (MCP upload rollback when the mutation throws). */
export const deleteStorageInternal = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.storage.delete(args.storageId);
  },
});
