"use node";

import { internalAction, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { MemoryWithTags } from "@vmem/sdk";
import { runBackfillChunks, runChunkMemory } from "./_memories/chunks";
import { runBackfillMemoryStore } from "./_memories/backfill";
import {
  runRetrieveMemories,
  runRetrieveMemoriesForTeam,
  runSearchMemories,
} from "./_memories/read";
import { runUpdateMemory } from "./_memories/update";
import { runDeleteAllMemories, runDeleteMemory } from "./_memories/delete";
import {
  runDeleteTeamMemoryAsOwner,
  runSearchMemoriesForTeam,
} from "./_memories/team";
import { runCreateMemory } from "./_memories/create";
import { resolveProfileScopeForClerkId } from "./_memories/shared";
import type { MemoryListResult } from "../memoryApi/types";
import {
  createMemoryInternalFields,
  listMemoriesFields,
  searchMemoriesFields,
  teamListMemoriesFields,
  teamRetrieveMemoriesFields,
  teamSearchMemoriesFields,
  updateMemoryInternalFields,
} from "../memoryApi/validators";

async function withResolvedProfileId<
  T extends { clerkId: string; profileId?: string },
>(ctx: ActionCtx, args: T) {
  const { profileId } = await resolveProfileScopeForClerkId(
    ctx,
    args.clerkId,
    args.profileId,
  );
  return { ...args, profileId };
}

export const createMemoryInternal = internalAction({
  args: createMemoryInternalFields,
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
  handler: async (ctx, args): Promise<MemoryWithTags | null> =>
    ctx.runQuery(internal.memoryStore.functions.getMemoryInternal, {
      userId: args.clerkId,
      memoryId: args.memoryId,
    }),
});

export const listMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    ...listMemoriesFields,
  },
  handler: async (ctx, args): Promise<MemoryListResult> => {
    const resolved = await withResolvedProfileId(ctx, args);
    return await ctx.runQuery(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: resolved.clerkId,
        profileId: resolved.profileId,
        type: resolved.type,
        status: resolved.status,
        source: resolved.source,
        tags: resolved.tags,
        searchQuery: resolved.searchQuery,
        limit: resolved.limit,
        offset: resolved.offset,
      },
    );
  },
});

export const updateMemoryInternal = internalAction({
  args: updateMemoryInternalFields,
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
    ...searchMemoriesFields,
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

export const retrieveMemoriesForTeamInternal = internalAction({
  args: teamRetrieveMemoriesFields,
  handler: async (ctx, args) => runRetrieveMemoriesForTeam(ctx, args),
});

export const listMemoriesForTeamInternal = internalAction({
  args: teamListMemoriesFields,
  handler: async (ctx, args): Promise<MemoryListResult> =>
    ctx.runQuery(internal.memoryStore.functions.listMemoriesForTeamInternal, {
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

export const getMemoryForTeamInternal = internalAction({
  args: {
    profileId: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> =>
    ctx.runQuery(internal.memoryStore.functions.getMemoryForTeamInternal, {
      profileId: args.profileId,
      memoryId: args.memoryId,
    }),
});

export const searchMemoriesForTeamInternal = internalAction({
  args: teamSearchMemoriesFields,
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

const backfillPageResultValidator = v.object({
  scanned: v.number(),
  inserted: v.number(),
  wouldInsert: v.number(),
  skipped: v.number(),
  invalid: v.number(),
  nextCursor: v.union(
    v.object({ createdAt: v.string(), id: v.string() }),
    v.null(),
  ),
  done: v.boolean(),
  dryRun: v.boolean(),
});

// Operator-only Neo4j → Convex copy. Defaults to dry-run. Repeat with the
// returned cursor until done=true. Do not schedule from product paths.
export const backfillMemoryStoreInternal = internalAction({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    cursorCreatedAt: v.optional(v.string()),
    cursorId: v.optional(v.string()),
    userId: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  returns: backfillPageResultValidator,
  handler: async (ctx, args) => runBackfillMemoryStore(ctx, args),
});
