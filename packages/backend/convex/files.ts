import { v } from "convex/values";
import { authMutation, authQuery } from "./auth";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  FILE_STORAGE_LIMIT_BYTES,
  collectSubtreeIds,
  detectFileKind,
  isAncestorOrSelf,
} from "./files/lib";
import {
  assertContentDeletable,
  assertContentEditable,
  requireContentScopeAccess,
} from "./teams/auth";

/**
 * Shared filesystem backend — powers the `/files` web view and the MCP file
 * tools (`mcp/files.ts`). A single `fileNodes` table holds folders and files
 * (discriminated by `kind`); files reference Convex storage via `storageId`.
 *
 * Scoping ("user-wide + team"): nodes without `teamId` are personal and
 * visible in every personal workspace; nodes with `teamId` form a team drive
 * shared by all members (any member edits, creator-or-owner deletes). A
 * subtree never mixes scopes, and each team has its own storage pool.
 *
 * listTree returns every node in the requested scope in one shot (trees are
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

/** Every file node in a scope: a team's drive, or the user's personal files. */
async function listScopeNodes(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<Array<Doc<"fileNodes">>> {
  if (teamId !== undefined) {
    return await ctx.db
      .query("fileNodes")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
  }
  const nodes = await ctx.db
    .query("fileNodes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return nodes.filter((n) => n.teamId === undefined);
}

/**
 * All file nodes in a scope, each file enriched with its URL. No `teamId` =
 * the user's personal files; `teamId` = that team's drive (members only).
 */
export const listTree = authQuery({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args): Promise<ListTreeResult> => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    const nodes = await listScopeNodes(ctx, ctx.userId, args.teamId);

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

/**
 * Sum of all file sizes in a scope — used for storage-limit checks.
 * Each team drive has its own pool, separate from members' personal pools.
 */
async function totalBytesForScope(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<number> {
  const nodes = await listScopeNodes(ctx, userId, teamId);
  return nodes.reduce(
    (sum, node) => sum + (node.kind === "file" ? (node.size ?? 0) : 0),
    0,
  );
}

/** Validate that `parentId` (when set) is a folder in the same scope. */
async function assertParentFolder(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  parentId: Id<"fileNodes"> | undefined,
): Promise<void> {
  if (parentId === undefined) return;
  const parent = await ctx.db.get(parentId);
  if (
    !parent ||
    parent.teamId !== teamId ||
    (teamId === undefined && parent.userId !== userId)
  ) {
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
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args): Promise<Id<"fileNodes">> => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    await assertParentFolder(ctx, ctx.userId, args.teamId, args.parentId);

    const used = await totalBytesForScope(ctx, ctx.userId, args.teamId);
    if (used + args.size > FILE_STORAGE_LIMIT_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Storage limit exceeded");
    }

    const now = Date.now();
    const indexable = detectFileKind(args.name, args.mimeType) !== null;
    const nodeId = await ctx.db.insert("fileNodes", {
      userId: ctx.userId,
      teamId: args.teamId,
      parentId: args.parentId,
      kind: "file",
      name: args.name,
      mimeType: args.mimeType,
      size: args.size,
      storageId: args.storageId,
      indexStatus: indexable ? "pending" : "skipped",
      createdAt: now,
      updatedAt: now,
    });
    if (indexable) {
      await ctx.scheduler.runAfter(
        0,
        internal.fileIndexing.indexFileNodeInternal,
        { fileNodeId: nodeId },
      );
    }
    return nodeId;
  },
});

/** Create an empty folder under `parentId` (or at the scope's root). */
export const createFolder = authMutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("fileNodes")),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args): Promise<Id<"fileNodes">> => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    await assertParentFolder(ctx, ctx.userId, args.teamId, args.parentId);
    const now = Date.now();
    return await ctx.db.insert("fileNodes", {
      userId: ctx.userId,
      teamId: args.teamId,
      parentId: args.parentId,
      kind: "folder",
      name: args.name,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Rename a file or folder (any team member for team nodes). */
export const renameNode = authMutation({
  args: { nodeId: v.id("fileNodes"), name: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new Error("Not found");
    await assertContentEditable(ctx, node, ctx.userId);
    await ctx.db.patch(args.nodeId, { name: args.name, updatedAt: Date.now() });

    // Keep the derived memory's title in sync (content is unchanged, so a
    // cheap title patch — not a full re-index). Memory ops run under the
    // CREATOR's clerkId: Neo4j matches memories on their author's userId.
    if (node.kind === "file" && node.memoryId) {
      const creator = await ctx.db.get(node.userId);
      if (creator?.clerkId) {
        await ctx.scheduler.runAfter(
          0,
          internal.neo4jActions.memories.updateMemoryInternal,
          {
            clerkId: creator.clerkId,
            memoryId: node.memoryId,
            title: args.name,
          },
        );
      }
    }
  },
});

/**
 * Move one or more nodes under a new parent (or to root). Rejects cycles
 * and cross-scope moves (personal ↔ team). All nodes must share one scope,
 * inferred from the first node.
 */
export const moveNodes = authMutation({
  args: {
    nodeIds: v.array(v.id("fileNodes")),
    targetParentId: v.optional(v.id("fileNodes")),
  },
  handler: async (ctx, args): Promise<void> => {
    const firstId = args.nodeIds[0];
    if (firstId === undefined) return;
    const first = await ctx.db.get(firstId);
    if (!first) throw new Error("Not found");
    const scopeTeamId = first.teamId;

    await requireContentScopeAccess(ctx, ctx.userId, scopeTeamId);
    await assertParentFolder(ctx, ctx.userId, scopeTeamId, args.targetParentId);

    const allNodes = await listScopeNodes(ctx, first.userId, scopeTeamId);

    const now = Date.now();
    for (const nodeId of args.nodeIds) {
      const node = allNodes.find((n) => n._id === nodeId);
      if (!node) throw new Error("Not found");
      await assertContentEditable(ctx, node, ctx.userId);
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
 * stored blob. Builds the children map over one scope-wide collect().
 * Permission: personal → owner; team → creator or team owner (per root).
 *
 * Indexed files also schedule cleanup of their derived memories. Cleanup
 * runs post-commit (scheduler), so its "any surviving fileNode still
 * references this memory?" guard sees the deletes. Each entry carries the
 * CREATOR's clerkId (team nodes can be deleted by a non-creator).
 */
async function deleteSubtree(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  rootId: Id<"fileNodes">,
): Promise<number> {
  const root = await ctx.db.get(rootId);
  if (!root) throw new Error("Not found");
  await assertContentDeletable(ctx, root, actorUserId);

  const allNodes = await listScopeNodes(ctx, root.userId, root.teamId);

  const ids = collectSubtreeIds(allNodes, rootId);
  const byId = new Map(allNodes.map((n) => [n._id, n]));
  const memoryEntries: Array<{ memoryId: string; clerkId: string }> = [];
  const clerkIdByUser = new Map<Id<"users">, string | null>();
  for (const id of ids) {
    const node = byId.get(id);
    if (node?.kind === "file" && node.storageId) {
      await ctx.storage.delete(node.storageId);
    }
    if (node?.kind === "file" && node.memoryId) {
      let clerkId = clerkIdByUser.get(node.userId);
      if (clerkId === undefined) {
        const creator = await ctx.db.get(node.userId);
        clerkId = creator?.clerkId ?? null;
        clerkIdByUser.set(node.userId, clerkId);
      }
      if (clerkId !== null) {
        memoryEntries.push({ memoryId: node.memoryId, clerkId });
      }
    }
    await ctx.db.delete(id);
  }
  if (memoryEntries.length > 0) {
    await ctx.scheduler.runAfter(
      0,
      internal.fileIndexing.cleanupFileMemoriesInternal,
      { entries: memoryEntries },
    );
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

/**
 * All PERSONAL file nodes for a user, by clerkId. MCP path resolution runs
 * over this — MCP stays personal-only, so team nodes never leak into the
 * MCP path namespace.
 */
export const listByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<Array<Doc<"fileNodes">>> => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    return await listScopeNodes(ctx, userId, undefined);
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

    const used = await totalBytesForScope(ctx, userId, undefined);
    if (used + args.size > FILE_STORAGE_LIMIT_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Storage limit exceeded");
    }

    const now = Date.now();
    // Walk/auto-create folder segments (all but the last). Personal scope
    // only — team nodes are filtered out so the MCP namespace stays clean.
    let parentId: Id<"fileNodes"> | undefined;
    for (let i = 0; i < args.segments.length - 1; i++) {
      const name = args.segments[i];
      const siblings = (
        await ctx.db
          .query("fileNodes")
          .withIndex("by_user_parent", (q) =>
            q.eq("userId", userId).eq("parentId", parentId),
          )
          .collect()
      ).filter((s) => s.teamId === undefined);
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
    const siblings = (
      await ctx.db
        .query("fileNodes")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentId", parentId),
        )
        .collect()
    ).filter((s) => s.teamId === undefined);
    const existing = siblings.find((s) => s.name === fileName);

    const indexable = detectFileKind(fileName, args.mimeType) !== null;

    if (existing) {
      if (existing.kind !== "file") {
        throw new Error(`A folder already exists at "${fileName}"`);
      }
      if (existing.storageId) {
        await ctx.storage.delete(existing.storageId);
      }
      // Re-index on overwrite (content changed). Also schedule when the old
      // content was indexed but the new bytes aren't indexable — the action
      // cleans up the now-stale memory.
      const needsIndexing = indexable || existing.memoryId !== undefined;
      await ctx.db.patch(existing._id, {
        storageId: args.storageId,
        mimeType: args.mimeType,
        size: args.size,
        indexStatus: needsIndexing ? "pending" : "skipped",
        updatedAt: now,
      });
      if (needsIndexing) {
        await ctx.scheduler.runAfter(
          0,
          internal.fileIndexing.indexFileNodeInternal,
          { fileNodeId: existing._id },
        );
      }
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
      indexStatus: indexable ? "pending" : "skipped",
      createdAt: now,
      updatedAt: now,
    });
    if (indexable) {
      await ctx.scheduler.runAfter(
        0,
        internal.fileIndexing.indexFileNodeInternal,
        { fileNodeId: nodeId },
      );
    }
    return { nodeId };
  },
});

/** Delete the node at a path (and its subtree), by clerkId. For MCP delete. */
export const deleteByIdForClerkInternal = internalMutation({
  args: { clerkId: v.string(), nodeId: v.id("fileNodes") },
  handler: async (ctx, args): Promise<{ deletedCount: number }> => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const node = await ctx.db.get(args.nodeId);
    // MCP is personal-only: team nodes are invisible here.
    if (!node || node.userId !== userId || node.teamId !== undefined) {
      throw new Error("Not found");
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// Memory-graph indexing support (see fileIndexing.ts for the pipeline).
// ─────────────────────────────────────────────────────────────────────────────

interface NodeForIndexResult {
  node: Doc<"fileNodes">;
  /** clerkId of the node's CREATOR — memory ops match on the author. */
  clerkId: string;
}

/** A file node plus its creator's clerkId, for the indexing action. */
export const getNodeForIndexInternal = internalQuery({
  args: { fileNodeId: v.id("fileNodes") },
  handler: async (ctx, args): Promise<NodeForIndexResult | null> => {
    const node = await ctx.db.get(args.fileNodeId);
    if (!node) return null;
    const creator = await ctx.db.get(node.userId);
    if (!creator?.clerkId) return null;
    return { node, clerkId: creator.clerkId };
  },
});

/** Record the outcome of an indexing run on the file node. */
export const setIndexResultInternal = internalMutation({
  args: {
    fileNodeId: v.id("fileNodes"),
    indexStatus: v.union(
      v.literal("indexed"),
      v.literal("skipped"),
      v.literal("failed"),
    ),
    memoryId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const node = await ctx.db.get(args.fileNodeId);
    if (!node) return; // deleted while indexing ran — cleanup already handled
    await ctx.db.patch(args.fileNodeId, {
      indexStatus: args.indexStatus,
      memoryId: args.memoryId,
      indexedAt: args.indexStatus === "indexed" ? Date.now() : undefined,
    });
  },
});

/**
 * Does any OTHER surviving file node still reference this memory?
 * Identical-content files dedup onto one memory — it must outlive all but
 * the last referencing file.
 */
export const hasOtherNodeForMemoryInternal = internalQuery({
  args: {
    memoryId: v.string(),
    excludeNodeId: v.optional(v.id("fileNodes")),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const nodes = await ctx.db
      .query("fileNodes")
      .withIndex("by_memory", (q) => q.eq("memoryId", args.memoryId))
      .collect();
    return nodes.some((n) => n._id !== args.excludeNodeId);
  },
});

/** All unindexed file docs (no indexStatus yet) — backfill input. */
export const listUnindexedFilesInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"fileNodes">>> => {
    const all = await ctx.db.query("fileNodes").collect();
    return all
      .filter((n) => n.kind === "file" && n.indexStatus === undefined)
      .map((n) => n._id);
  },
});
