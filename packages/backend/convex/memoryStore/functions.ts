import { v } from "convex/values";
import { zodToConvex } from "convex-helpers/server/zod";
import { memoryWithTagsSchema } from "@vmem/sdk";
import { internalMutation, internalQuery } from "../_generated/server";
import { memoryStatusValidator, memoryTypeValidator } from "../validators";
import {
  collectScopedMemories,
  createMemory,
  deleteMemoriesByProfile,
  deleteMemoriesBySourceTypes,
  deleteMemoriesForUser,
  deleteMemory,
  deleteTeamMemoryAsOwner,
  getMemoriesByDocIds,
  getMemoriesByMemoryIds,
  getMemory,
  getMemoryForTeam,
  linkMemories,
  listMemories,
  listMemoriesForTeam,
  listMemoryLinksForUser,
  patchMemoryEmbedding,
  reassignMemoriesProfile,
  searchMemoriesText,
  unlinkMemories,
  updateMemory,
  upsertMemoryFromSource,
  supersedeMemories,
} from "./helpers";

const memoryWithTagsValidator = zodToConvex(memoryWithTagsSchema);

const memoryListResultValidator = v.object({
  memories: v.array(memoryWithTagsValidator),
  total: v.number(),
});

const listFilterFields = {
  type: v.optional(v.string()),
  status: v.optional(v.string()),
  source: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  searchQuery: v.optional(v.string()),
  limit: v.number(),
  offset: v.number(),
};

const updateContentFields = {
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  type: v.optional(memoryTypeValidator),
  status: v.optional(memoryStatusValidator),
  tags: v.optional(v.array(v.string())),
  confidence: v.optional(v.number()),
  expiresAt: v.optional(v.union(v.string(), v.null())),
};

export const createMemoryInternal = internalMutation({
  args: {
    memoryId: v.optional(v.string()),
    userId: v.string(),
    profileId: v.optional(v.string()),
    title: v.string(),
    content: v.string(),
    type: memoryTypeValidator,
    source: v.string(),
    tags: v.array(v.string()),
    confidence: v.number(),
    contentHash: v.optional(v.string()),
    status: v.optional(memoryStatusValidator),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    expiresAt: v.optional(v.string()),
    url: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceSyncedAt: v.optional(v.string()),
    storageId: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    originalFilename: v.optional(v.string()),
  },
  returns: memoryWithTagsValidator,
  handler: async (ctx, args) => createMemory(ctx, args),
});

export const getMemoryInternal = internalQuery({
  args: {
    userId: v.string(),
    memoryId: v.string(),
  },
  returns: v.union(memoryWithTagsValidator, v.null()),
  handler: async (ctx, args) => getMemory(ctx, args.userId, args.memoryId),
});

export const getMemoryForTeamInternal = internalQuery({
  args: {
    profileId: v.string(),
    memoryId: v.string(),
  },
  returns: v.union(memoryWithTagsValidator, v.null()),
  handler: async (ctx, args) =>
    getMemoryForTeam(ctx, args.profileId, args.memoryId),
});

export const listMemoriesInternal = internalQuery({
  args: {
    userId: v.string(),
    profileId: v.optional(v.union(v.string(), v.null())),
    ...listFilterFields,
  },
  returns: memoryListResultValidator,
  handler: async (ctx, args) =>
    listMemories(ctx, args.userId, {
      profileId: args.profileId,
      type: args.type,
      status: args.status,
      source: args.source,
      tags: args.tags,
      searchQuery: args.searchQuery,
      limit: args.limit,
      offset: args.offset,
    }),
});

export const listMemoriesForTeamInternal = internalQuery({
  args: {
    profileId: v.string(),
    ...listFilterFields,
  },
  returns: memoryListResultValidator,
  handler: async (ctx, args) =>
    listMemoriesForTeam(ctx, args.profileId, {
      type: args.type,
      status: args.status,
      source: args.source,
      tags: args.tags,
      searchQuery: args.searchQuery,
      limit: args.limit,
      offset: args.offset,
    }),
});

export const collectScopedMemoriesInternal = internalQuery({
  args: {
    kind: v.union(v.literal("personal"), v.literal("team")),
    userId: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  returns: v.array(memoryWithTagsValidator),
  handler: async (ctx, args) => {
    if (args.kind === "team") {
      if (args.profileId === undefined) return [];
      return collectScopedMemories(ctx, {
        kind: "team",
        profileId: args.profileId,
      });
    }
    if (args.userId === undefined) return [];
    return collectScopedMemories(ctx, {
      kind: "personal",
      userId: args.userId,
      profileId: args.profileId,
    });
  },
});

export const updateMemoryInternal = internalMutation({
  args: {
    userId: v.string(),
    memoryId: v.string(),
    ...updateContentFields,
  },
  returns: v.union(memoryWithTagsValidator, v.null()),
  handler: async (ctx, args) =>
    updateMemory(ctx, args.userId, args.memoryId, {
      title: args.title,
      content: args.content,
      type: args.type,
      status: args.status,
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
    }),
});

const memoryScopeFields = {
  kind: v.union(v.literal("personal"), v.literal("team")),
  userId: v.optional(v.string()),
  profileId: v.optional(v.string()),
};

export const supersedeMemoriesInternal = internalMutation({
  args: {
    ...memoryScopeFields,
    predecessorIds: v.array(v.string()),
    successorId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (args.kind === "team") {
      if (args.profileId === undefined) return 0;
      return supersedeMemories(ctx, {
        scope: { kind: "team", profileId: args.profileId },
        predecessorIds: args.predecessorIds,
        successorId: args.successorId,
        reason: args.reason,
      });
    }
    if (args.userId === undefined) return 0;
    return supersedeMemories(ctx, {
      scope: {
        kind: "personal",
        userId: args.userId,
        profileId: args.profileId,
      },
      predecessorIds: args.predecessorIds,
      successorId: args.successorId,
      reason: args.reason,
    });
  },
});

export const deleteMemoryInternal = internalMutation({
  args: {
    userId: v.string(),
    memoryId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => deleteMemory(ctx, args.userId, args.memoryId),
});

export const deleteTeamMemoryAsOwnerInternal = internalMutation({
  args: {
    profileId: v.string(),
    memoryId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    deleteTeamMemoryAsOwner(ctx, args.profileId, args.memoryId),
});

export const deleteMemoriesForUserInternal = internalMutation({
  args: {
    userId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => deleteMemoriesForUser(ctx, args.userId),
});

export const deleteMemoriesByProfileInternal = internalMutation({
  args: { profileId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => deleteMemoriesByProfile(ctx, args.profileId),
});

export const reassignMemoriesProfileInternal = internalMutation({
  args: {
    fromProfileId: v.string(),
    toProfileId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) =>
    reassignMemoriesProfile(ctx, args.fromProfileId, args.toProfileId),
});

export const deleteMemoriesBySourceTypesInternal = internalMutation({
  args: {
    userId: v.string(),
    sourceTypes: v.array(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) =>
    deleteMemoriesBySourceTypes(ctx, args.userId, args.sourceTypes),
});

export const upsertMemoryFromSourceInternal = internalMutation({
  args: {
    userId: v.string(),
    profileId: v.string(),
    title: v.string(),
    content: v.string(),
    sourceType: v.string(),
    sourceId: v.string(),
    sourceUrl: v.string(),
  },
  returns: memoryWithTagsValidator,
  handler: async (ctx, args) =>
    upsertMemoryFromSource(ctx, {
      userId: args.userId,
      profileId: args.profileId,
      title: args.title,
      content: args.content,
      type: "knowledge",
      source: args.sourceType,
      tags: [],
      confidence: 1,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      sourceUrl: args.sourceUrl,
    }),
});

export const searchMemoriesTextInternal = internalQuery({
  args: {
    kind: v.union(v.literal("personal"), v.literal("team")),
    userId: v.optional(v.string()),
    profileId: v.optional(v.string()),
    query: v.string(),
  },
  returns: v.array(
    v.object({
      memory: memoryWithTagsValidator,
      rank: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.kind === "team") {
      if (args.profileId === undefined) return [];
      return searchMemoriesText(
        ctx,
        { kind: "team", profileId: args.profileId },
        args.query,
      );
    }
    if (args.userId === undefined) return [];
    return searchMemoriesText(
      ctx,
      {
        kind: "personal",
        userId: args.userId,
        profileId: args.profileId,
      },
      args.query,
    );
  },
});

export const getMemoriesByDocIdsInternal = internalQuery({
  args: { ids: v.array(v.id("memories")) },
  returns: v.array(v.union(memoryWithTagsValidator, v.null())),
  handler: async (ctx, args) => getMemoriesByDocIds(ctx, args.ids),
});

export const getMemoriesByMemoryIdsInternal = internalQuery({
  args: { ids: v.array(v.string()) },
  returns: v.array(v.union(memoryWithTagsValidator, v.null())),
  handler: async (ctx, args) => getMemoriesByMemoryIds(ctx, args.ids),
});

export const patchMemoryEmbeddingInternal = internalMutation({
  args: {
    memoryId: v.string(),
    embedding: v.array(v.float64()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    patchMemoryEmbedding(ctx, args.memoryId, args.embedding),
});

const memoryLinkEdgeValidator = v.object({
  sourceId: v.string(),
  targetId: v.string(),
  reason: v.string(),
});

export const linkMemoriesInternal = internalMutation({
  args: {
    userId: v.string(),
    profileId: v.optional(v.string()),
    memoryIdA: v.string(),
    memoryIdB: v.string(),
    reason: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => linkMemories(ctx, args),
});

export const unlinkMemoriesInternal = internalMutation({
  args: {
    userId: v.string(),
    memoryIdA: v.string(),
    memoryIdB: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => unlinkMemories(ctx, args),
});

export const listMemoryLinksForUserInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.array(memoryLinkEdgeValidator),
  handler: async (ctx, args) => listMemoryLinksForUser(ctx, args.userId),
});
