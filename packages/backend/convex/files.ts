import { v } from "convex/values";
import { authMutation, authQuery } from "./auth";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getUserIdByClerkId } from "./lib/clerkUser";
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

interface FileNodeWithUrl extends Doc<"fileNodes"> {
  // Convex serving URL for files; null for folders or missing storage
  url: string | null;
}

interface ListTreeResult {
  nodes: Array<FileNodeWithUrl>;
  totalBytes: number;
  storageLimit: number;
}

// every file node in a scope: a team's drive, or the user's personal files
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

// all file nodes in a scope, each file enriched with its URL
export const listTree = authQuery({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args): Promise<ListTreeResult> => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    const nodes = await listScopeNodes(ctx, ctx.userId, args.teamId);

    const totalBytes = nodes.reduce(
      (sum, node) => sum + (node.kind === "file" ? (node.size ?? 0) : 0),
      0,
    );
    const withUrls: Array<FileNodeWithUrl> = await Promise.all(
      nodes.map(async (node) => {
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

// signed URL for the client to POST raw file bytes to (Convex storage)
export const generateFileUploadUrl = authMutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

// sum of all file sizes in a scope — used for storage-limit checks
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

// find a personal (non-team) direct child of `parentId` by exact name
async function findPersonalSibling(
  ctx: MutationCtx,
  userId: Id<"users">,
  parentId: Id<"fileNodes"> | undefined,
  name: string,
): Promise<Doc<"fileNodes"> | undefined> {
  const siblings = await ctx.db
    .query("fileNodes")
    .withIndex("by_user_parent", (q) =>
      q.eq("userId", userId).eq("parentId", parentId),
    )
    .collect();
  return siblings.find((s) => s.teamId === undefined && s.name === name);
}

// validate that `parentId` (when set) is a folder in the same scope
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

async function scheduleFileIndex(
  ctx: MutationCtx,
  fileNodeId: Id<"fileNodes">,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.fileIndexing.indexFileNodeInternal, {
    fileNodeId,
  });
}

// record an uploaded file
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
      await scheduleFileIndex(ctx, nodeId);
    }
    return nodeId;
  },
});

// create an empty folder under `parentId` (or at the scope's root)
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

// rename a file or folder (any team member for team nodes)
export const renameNode = authMutation({
  args: { nodeId: v.id("fileNodes"), name: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new Error("Not found");
    await assertContentEditable(ctx, node, ctx.userId);
    await ctx.db.patch(args.nodeId, { name: args.name, updatedAt: Date.now() });

    // keep the derived memory's title in sync (content is unchanged, so a cheap title patch
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

// move one or more nodes under a new parent (or to root)
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

// delete a node and (for folders) its entire subtree, dropping each file's stored blob
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

// delete the given nodes (and their subtrees)
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

export const listByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<Array<Doc<"fileNodes">>> => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    return await listScopeNodes(ctx, userId, undefined);
  },
});

// serving URL for a stored blob (MCP get returns this as downloadUrl)
export const getStorageUrlInternal = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<string | null> => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// create or replace a file at a path, auto-creating any missing parent folders
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
    // walk/auto-create folder segments (all but the last). Personal scope
    // only — team nodes are filtered out so the MCP namespace stays clean
    let parentId: Id<"fileNodes"> | undefined;
    for (const name of args.segments.slice(0, -1)) {
      const existing = await findPersonalSibling(ctx, userId, parentId, name);
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

    const fileName = args.segments.at(-1);
    if (fileName === undefined) {
      throw new Error("Path is required");
    }
    const existing = await findPersonalSibling(ctx, userId, parentId, fileName);

    const indexable = detectFileKind(fileName, args.mimeType) !== null;

    if (existing) {
      if (existing.kind !== "file") {
        throw new Error(`A folder already exists at "${fileName}"`);
      }
      if (existing.storageId) {
        await ctx.storage.delete(existing.storageId);
      }
      // re-index on overwrite (content changed)
      const needsIndexing = indexable || existing.memoryId !== undefined;
      await ctx.db.patch(existing._id, {
        storageId: args.storageId,
        mimeType: args.mimeType,
        size: args.size,
        indexStatus: needsIndexing ? "pending" : "skipped",
        updatedAt: now,
      });
      if (needsIndexing) {
        await scheduleFileIndex(ctx, existing._id);
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
      await scheduleFileIndex(ctx, nodeId);
    }
    return { nodeId };
  },
});

// delete the node at a path (and its subtree), by clerkId
export const deleteByIdForClerkInternal = internalMutation({
  args: { clerkId: v.string(), nodeId: v.id("fileNodes") },
  handler: async (ctx, args): Promise<{ deletedCount: number }> => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const node = await ctx.db.get(args.nodeId);
    // MCP is personal-only: team nodes are invisible here
    if (!node || node.userId !== userId || node.teamId !== undefined) {
      throw new Error("Not found");
    }
    const deletedCount = await deleteSubtree(ctx, userId, args.nodeId);
    return { deletedCount };
  },
});

// delete an orphaned blob (MCP upload rollback when the mutation throws)
export const deleteStorageInternal = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.storage.delete(args.storageId);
  },
});

interface NodeForIndexResult {
  node: Doc<"fileNodes">;
  // clerkId of the node's CREATOR — memory ops match on the author
  clerkId: string;
}

// A file node plus its creator's clerkId, for the indexing action
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

// record the outcome of an indexing run on the file node
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

// does any OTHER surviving file node still reference this memory
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

// all unindexed file docs (no indexStatus yet) — backfill input
export const listUnindexedFilesInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"fileNodes">>> => {
    const all = await ctx.db.query("fileNodes").collect();
    return all
      .filter((n) => n.kind === "file" && n.indexStatus === undefined)
      .map((n) => n._id);
  },
});
