import { v } from "convex/values";
import { authMutation, authQuery } from "./auth";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { updateMemory } from "./memoryStore/helpers";
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
import { mcpScopeValidator, resolveMcpTeamId } from "./profiles/mcpAccess";

interface FileNodeWithUrl extends Doc<"fileNodes"> {
  // convex serving url for files. null for folders or missing storage
  url: string | null;
}

interface ScopeTree<Node> {
  nodes: Array<Node>;
  totalBytes: number;
  storageLimit: number;
}

// every file node in a scope, a team's drive, or the user's personal files
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

function sumFileBytes(nodes: Array<Doc<"fileNodes">>): number {
  return nodes.reduce(
    (sum, node) => sum + (node.kind === "file" ? (node.size ?? 0) : 0),
    0,
  );
}

// a scope's nodes plus storage used and the limit (files page + files_list)
async function listScopeTree(
  ctx: QueryCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<ScopeTree<Doc<"fileNodes">>> {
  await requireContentScopeAccess(ctx, userId, teamId);
  const nodes = await listScopeNodes(ctx, userId, teamId);
  return {
    nodes,
    totalBytes: sumFileBytes(nodes),
    storageLimit: FILE_STORAGE_LIMIT_BYTES,
  };
}

export const listTree = authQuery({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args): Promise<ScopeTree<FileNodeWithUrl>> => {
    const tree = await listScopeTree(ctx, ctx.userId, args.teamId);
    const withUrls: Array<FileNodeWithUrl> = await Promise.all(
      tree.nodes.map(async (node) => {
        const url =
          node.kind === "file" && node.storageId
            ? await ctx.storage.getUrl(node.storageId)
            : null;
        return { ...node, url };
      }),
    );
    return { ...tree, nodes: withUrls };
  },
});

export const generateFileUploadUrl = authMutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

async function totalBytesForScope(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<number> {
  return sumFileBytes(await listScopeNodes(ctx, userId, teamId));
}

// a child of parentId with this name, in the personal or the team drive
async function findSibling(
  ctx: MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  parentId: Id<"fileNodes"> | undefined,
  name: string,
): Promise<Doc<"fileNodes"> | undefined> {
  if (teamId !== undefined) {
    const siblings = await ctx.db
      .query("fileNodes")
      .withIndex("by_team_parent", (q) =>
        q.eq("teamId", teamId).eq("parentId", parentId),
      )
      .collect();
    return siblings.find((s) => s.name === name);
  }
  const siblings = await ctx.db
    .query("fileNodes")
    .withIndex("by_user_parent", (q) =>
      q.eq("userId", userId).eq("parentId", parentId),
    )
    .collect();
  return siblings.find((s) => s.teamId === undefined && s.name === name);
}

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

async function insertFolder(
  ctx: MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  parentId: Id<"fileNodes"> | undefined,
  name: string,
): Promise<Id<"fileNodes">> {
  const now = Date.now();
  return await ctx.db.insert("fileNodes", {
    userId,
    teamId,
    parentId,
    kind: "folder",
    name,
    createdAt: now,
    updatedAt: now,
  });
}

export const createFolder = authMutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("fileNodes")),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args): Promise<Id<"fileNodes">> => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    await assertParentFolder(ctx, ctx.userId, args.teamId, args.parentId);
    return await insertFolder(
      ctx,
      ctx.userId,
      args.teamId,
      args.parentId,
      args.name,
    );
  },
});

async function renameFileNode(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  nodeId: Id<"fileNodes">,
  name: string,
): Promise<void> {
  const node = await ctx.db.get(nodeId);
  if (!node) throw new Error("Not found");
  await assertContentEditable(ctx, node, actorUserId);
  await ctx.db.patch(nodeId, { name, updatedAt: Date.now() });

  // keep the derived memory's title in sync (content is unchanged, so a cheap title patch
  if (node.kind === "file" && node.memoryId) {
    const creator = await ctx.db.get(node.userId);
    if (creator?.clerkId) {
      await updateMemory(ctx, creator.clerkId, node.memoryId, {
        title: name,
      });
    }
  }
}

export const renameNode = authMutation({
  args: { nodeId: v.id("fileNodes"), name: v.string() },
  handler: async (ctx, args): Promise<void> =>
    renameFileNode(ctx, ctx.userId, args.nodeId, args.name),
});

async function moveFileNodes(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  nodeIds: Array<Id<"fileNodes">>,
  targetParentId: Id<"fileNodes"> | undefined,
): Promise<void> {
  const firstId = nodeIds[0];
  if (firstId === undefined) return;
  const first = await ctx.db.get(firstId);
  if (!first) throw new Error("Not found");
  const scopeTeamId = first.teamId;

  await requireContentScopeAccess(ctx, actorUserId, scopeTeamId);
  await assertParentFolder(ctx, actorUserId, scopeTeamId, targetParentId);

  const allNodes = await listScopeNodes(ctx, first.userId, scopeTeamId);

  const now = Date.now();
  for (const nodeId of nodeIds) {
    const node = allNodes.find((n) => n._id === nodeId);
    if (!node) throw new Error("Not found");
    await assertContentEditable(ctx, node, actorUserId);
    if (
      targetParentId !== undefined &&
      isAncestorOrSelf(allNodes, nodeId, targetParentId)
    ) {
      throw new Error("Cannot move a folder into its own descendant");
    }
    await ctx.db.patch(nodeId, {
      parentId: targetParentId,
      updatedAt: now,
    });
  }
}

export const moveNodes = authMutation({
  args: {
    nodeIds: v.array(v.id("fileNodes")),
    targetParentId: v.optional(v.id("fileNodes")),
  },
  handler: async (ctx, args): Promise<void> =>
    moveFileNodes(ctx, ctx.userId, args.nodeIds, args.targetParentId),
});

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

// MCP file tools: the drive is the caller's personal files, or on the team
// connector the active team profile's drive (never a teamId param)
const mcpFileScopeArgs = { clerkId: v.string(), scope: mcpScopeValidator };

async function resolveMcpFileScope(
  ctx: QueryCtx,
  args: { clerkId: string; scope: "personal" | "team" },
): Promise<{ userId: Id<"users">; teamId: Id<"teams"> | undefined }> {
  const userId = await getUserIdByClerkId(ctx, args.clerkId);
  const teamId = await resolveMcpTeamId(ctx, args.clerkId, args.scope);
  await requireContentScopeAccess(ctx, userId, teamId);
  return { userId, teamId };
}

async function requireNodeInMcpScope(
  ctx: QueryCtx,
  scope: { userId: Id<"users">; teamId: Id<"teams"> | undefined },
  nodeId: Id<"fileNodes">,
): Promise<Doc<"fileNodes">> {
  const node = await ctx.db.get(nodeId);
  if (
    !node ||
    node.teamId !== scope.teamId ||
    (scope.teamId === undefined && node.userId !== scope.userId)
  ) {
    throw new Error("Not found");
  }
  return node;
}

// walk the folder segments, creating missing ones; returns the last folder
async function ensureFolderPath(
  ctx: MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  segments: string[],
): Promise<{ folderId: Id<"fileNodes"> | undefined; created: boolean }> {
  let parentId: Id<"fileNodes"> | undefined;
  let created = false;
  for (const name of segments) {
    const existing = await findSibling(ctx, userId, teamId, parentId, name);
    if (existing) {
      if (existing.kind !== "folder") {
        throw new Error(`Path segment "${name}" is a file, not a folder`);
      }
      parentId = existing._id;
      created = false;
    } else {
      parentId = await insertFolder(ctx, userId, teamId, parentId, name);
      created = true;
    }
  }
  return { folderId: parentId, created };
}

export const listByClerkIdInternal = internalQuery({
  args: mcpFileScopeArgs,
  handler: async (ctx, args): Promise<ScopeTree<Doc<"fileNodes">>> => {
    const { userId, teamId } = await resolveMcpFileScope(ctx, args);
    return await listScopeTree(ctx, userId, teamId);
  },
});

export const createFolderByPathInternal = internalMutation({
  args: { ...mcpFileScopeArgs, segments: v.array(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ nodeId: Id<"fileNodes">; created: boolean }> => {
    const { userId, teamId } = await resolveMcpFileScope(ctx, args);
    const { folderId, created } = await ensureFolderPath(
      ctx,
      userId,
      teamId,
      args.segments,
    );
    if (folderId === undefined) throw new Error("Path is required");
    return { nodeId: folderId, created };
  },
});

export const renameByClerkIdInternal = internalMutation({
  args: { ...mcpFileScopeArgs, nodeId: v.id("fileNodes"), name: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const scope = await resolveMcpFileScope(ctx, args);
    await requireNodeInMcpScope(ctx, scope, args.nodeId);
    await renameFileNode(ctx, scope.userId, args.nodeId, args.name);
  },
});

export const moveByClerkIdInternal = internalMutation({
  args: {
    ...mcpFileScopeArgs,
    nodeIds: v.array(v.id("fileNodes")),
    targetParentId: v.optional(v.id("fileNodes")),
  },
  handler: async (ctx, args): Promise<void> => {
    const scope = await resolveMcpFileScope(ctx, args);
    for (const nodeId of args.nodeIds) {
      await requireNodeInMcpScope(ctx, scope, nodeId);
    }
    await moveFileNodes(ctx, scope.userId, args.nodeIds, args.targetParentId);
  },
});

export const upsertFileByPathInternal = internalMutation({
  args: {
    ...mcpFileScopeArgs,
    segments: v.array(v.string()),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args): Promise<{ nodeId: Id<"fileNodes"> }> => {
    if (args.segments.length === 0) {
      throw new Error("Path is required");
    }
    const { userId, teamId } = await resolveMcpFileScope(ctx, args);

    const used = await totalBytesForScope(ctx, userId, teamId);
    if (used + args.size > FILE_STORAGE_LIMIT_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Storage limit exceeded");
    }

    const now = Date.now();
    // walk/auto create folder segments (all but the last), inside the one drive
    const { folderId: parentId } = await ensureFolderPath(
      ctx,
      userId,
      teamId,
      args.segments.slice(0, -1),
    );

    const fileName = args.segments.at(-1);
    if (fileName === undefined) {
      throw new Error("Path is required");
    }
    const existing = await findSibling(ctx, userId, teamId, parentId, fileName);

    const indexable = detectFileKind(fileName, args.mimeType) !== null;

    if (existing) {
      if (existing.kind !== "file") {
        throw new Error(`A folder already exists at "${fileName}"`);
      }
      await assertContentEditable(ctx, existing, userId);
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
      teamId,
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

export const deleteByIdForClerkInternal = internalMutation({
  args: { ...mcpFileScopeArgs, nodeId: v.id("fileNodes") },
  handler: async (ctx, args): Promise<{ deletedCount: number }> => {
    const scope = await resolveMcpFileScope(ctx, args);
    await requireNodeInMcpScope(ctx, scope, args.nodeId);
    const deletedCount = await deleteSubtree(ctx, scope.userId, args.nodeId);
    return { deletedCount };
  },
});

export const deleteStorageInternal = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.storage.delete(args.storageId);
  },
});

interface NodeForIndexResult {
  node: Doc<"fileNodes">;
  // clerkId of the node's creator, memory ops match on the author
  clerkId: string;
}

// a file node plus its creator's clerkId, for the indexing action
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

// all unindexed file docs (no indexStatus yet), backfill input
export const listUnindexedFilesInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"fileNodes">>> => {
    const all = await ctx.db.query("fileNodes").collect();
    return all
      .filter((n) => n.kind === "file" && n.indexStatus === undefined)
      .map((n) => n._id);
  },
});
