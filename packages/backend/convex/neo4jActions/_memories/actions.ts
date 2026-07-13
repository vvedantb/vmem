"use node";

import { internalAction, type ActionCtx } from "../../_generated/server";
import { v } from "convex/values";
import { runBackfillChunks, runChunkMemory } from "./chunks";
import {
  runGetMemory,
  runGetMemoryEvents,
  runGetRecentMemoryTitles,
  runListMemories,
  runRetrieveMemories,
  runSearchMemories,
} from "./read";
import { runUpdateMemory } from "./update";
import { runDeleteAllMemories, runDeleteMemory } from "./delete";
import {
  runDeleteTeamMemoryAsOwner,
  runGetMemoryForTeam,
  runListMemoriesForTeam,
  runSearchMemoriesForTeam,
} from "./team";
import { runCreateMemory } from "./create";
import { resolveProfileIdForClerkId } from "./shared";

async function withResolvedProfileId<
  T extends { clerkId: string; profileId?: string },
>(ctx: ActionCtx, args: T) {
  const profileId = await resolveProfileIdForClerkId(
    ctx,
    args.clerkId,
    args.profileId,
  );
  return { ...args, profileId };
}

export const createMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    title: v.string(),
    content: v.string(),
    type: v.string(),
    source: v.string(),
    tags: v.array(v.string()),
    confidence: v.number(),
    expiresAt: v.optional(v.string()),
    url: v.optional(v.string()),
    externalId: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    storageId: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    originalFilename: v.optional(v.string()),
  },
  handler: async (ctx, args) => runCreateMemory(ctx, args),
});

export const chunkMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    content: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => runChunkMemory(ctx, args),
});

export const backfillChunksInternal = internalAction({
  args: {
    clerkId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => runBackfillChunks(ctx, args),
});

export const getMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => runGetMemory(args),
});

export const listMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    searchQuery: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) =>
    runListMemories(await withResolvedProfileId(ctx, args)),
});

export const updateMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => runUpdateMemory(ctx, args),
});

export const deleteMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args) => runDeleteMemory(ctx, args),
});

export const deleteAllMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => runDeleteAllMemories(ctx, args),
});

export const searchMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) =>
    runSearchMemories(await withResolvedProfileId(ctx, args)),
});

export const retrieveMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    query: v.string(),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
  },
  handler: async (ctx, args) =>
    runRetrieveMemories(ctx, await withResolvedProfileId(ctx, args)),
});

export const getMemoryEventsInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => runGetMemoryEvents(args),
});

export const getRecentMemoryTitlesInternal = internalAction({
  args: {
    clerkId: v.string(),
    excludeMemoryId: v.string(),
  },
  handler: async (_ctx, args) => runGetRecentMemoryTitles(args),
});

export const listMemoriesForTeamInternal = internalAction({
  args: {
    profileId: v.string(),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (_ctx, args) => runListMemoriesForTeam(args),
});

export const getMemoryForTeamInternal = internalAction({
  args: {
    profileId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => runGetMemoryForTeam(args),
});

export const searchMemoriesForTeamInternal = internalAction({
  args: {
    profileId: v.string(),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (_ctx, args) => runSearchMemoriesForTeam(args),
});

export const deleteTeamMemoryAsOwnerInternal = internalAction({
  args: {
    profileId: v.string(),
    memoryId: v.string(),
    ownerClerkId: v.string(),
  },
  handler: async (ctx, args) => runDeleteTeamMemoryAsOwner(ctx, args),
});
