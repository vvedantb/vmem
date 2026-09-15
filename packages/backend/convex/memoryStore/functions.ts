import { v } from "convex/values";
import { zodToConvex } from "convex-helpers/server/zod";
import { memoryWithTagsSchema } from "@vmem/sdk";
import { internalMutation, internalQuery } from "../_generated/server";
import { memoryStatusValidator, memoryTypeValidator } from "../validators";
import {
  createMemory,
  deleteMemoriesForUser,
  deleteMemory,
  deleteTeamMemoryAsOwner,
  existingMemoryIds,
  getMemory,
  getMemoryForTeam,
  insertBackfillBatch,
  listMemories,
  listMemoriesForTeam,
  updateMemory,
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

const backfillRowFields = {
  memoryId: v.string(),
  userId: v.string(),
  profileId: v.optional(v.string()),
  title: v.string(),
  content: v.string(),
  type: memoryTypeValidator,
  source: v.string(),
  tags: v.array(v.string()),
  confidence: v.number(),
  contentHash: v.string(),
  status: memoryStatusValidator,
  createdAt: v.string(),
  updatedAt: v.string(),
  expiresAt: v.optional(v.string()),
  sourceType: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  sourceSyncedAt: v.optional(v.string()),
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
    contentHash: v.string(),
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

export const existingMemoryIdsInternal = internalQuery({
  args: {
    memoryIds: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => existingMemoryIds(ctx, args.memoryIds),
});

export const insertBackfillBatchInternal = internalMutation({
  args: {
    rows: v.array(v.object(backfillRowFields)),
  },
  returns: v.number(),
  handler: async (ctx, args) => insertBackfillBatch(ctx, args.rows),
});
