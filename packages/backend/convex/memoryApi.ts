import { v } from "convex/values";
import { authAction, authMutation } from "./auth";
import {
  runCreateMemory,
  runDeleteAllMemories,
  runDeleteMemory,
  runGetMemory,
  runGetMemoryEvents,
  runListMemories,
  runRetrieveMemories,
  runSearchMemories,
  runUpdateMemory,
} from "./memoryApi/personal";
import {
  runDeleteTeamMemory,
  runGetTeamMemory,
  runListTeamMemories,
  runSearchTeamMemories,
  runUpdateTeamMemory,
} from "./memoryApi/team";
import type {
  MemoryEvent,
  MemoryListResult,
  MemoryWithTags,
  RetrieveMemoriesResult,
} from "./memoryApi/types";

export const generateMemoryUploadUrl = authMutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const createMemory = authAction({
  args: {
    title: v.string(),
    content: v.string(),
    type: v.string(),
    source: v.string(),
    tags: v.array(v.string()),
    confidence: v.number(),
    expiresAt: v.optional(v.string()),
    url: v.optional(v.string()),
    profileId: v.optional(v.string()),
    // External ID idempotency. Callers that have a stable upstream
    // identifier (file content hash, Twitter bookmark id, …) can pass
    // both `externalId` and `sourceType`; the backend short-circuits to
    // the existing memory on re-import instead of duplicating.
    externalId: v.optional(v.string()),
    sourceType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MemoryWithTags> =>
    runCreateMemory(ctx, args),
});

export const getMemory = authAction({
  args: {
    memoryId: v.string(),
    /** Active workspace; team profiles read via the member-wide path. */
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> =>
    runGetMemory(ctx, args),
});

export const listMemories = authAction({
  args: {
    profileId: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    searchQuery: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryListResult> =>
    runListMemories(ctx, args),
});

export const updateMemory = authAction({
  args: {
    memoryId: v.string(),
    /** Active workspace; team profiles use creator-or-owner permissions. */
    profileId: v.optional(v.string()),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> =>
    runUpdateMemory(ctx, args),
});

export const deleteMemory = authAction({
  args: {
    memoryId: v.string(),
    /** Active workspace; team profiles use creator-or-owner permissions. */
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<boolean> => runDeleteMemory(ctx, args),
});

/**
 * Delete every memory the calling user owns, along with all per-user
 * dependents (chunks, events, proposed updates, entities) and orphaned
 * tag/source nodes. Returns the number of memories that were deleted.
 *
 * Destructive and irreversible — the UI gates this behind a confirmation
 * dialog in /settings/data-controls.
 */
export const deleteAllMemories = authAction({
  args: {},
  handler: async (ctx): Promise<number> => runDeleteAllMemories(ctx),
});

export const searchMemories = authAction({
  args: {
    /** Active workspace; team profiles search member-wide. */
    profileId: v.optional(v.string()),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryListResult> =>
    runSearchMemories(ctx, args),
});

export const retrieveMemories = authAction({
  args: {
    query: v.string(),
    /** Active workspace to ground retrieval in. */
    profileId: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<RetrieveMemoriesResult> =>
    runRetrieveMemories(ctx, args),
});

export const getMemoryEvents = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<MemoryEvent[]> =>
    runGetMemoryEvents(ctx, args),
});

export const listTeamMemories = authAction({
  args: {
    profileId: v.id("profiles"),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryListResult> =>
    runListTeamMemories(ctx, args),
});

export const getTeamMemory = authAction({
  args: {
    profileId: v.id("profiles"),
    memoryId: v.string(),
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> =>
    runGetTeamMemory(ctx, args),
});

export const searchTeamMemories = authAction({
  args: {
    profileId: v.id("profiles"),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryListResult> =>
    runSearchTeamMemories(ctx, args),
});

/**
 * Update a team memory. Allowed if caller is the original creator OR is a
 * team owner of the memory's team. Uses the creator-scoped Cypher path for
 * creator edits and a profile-scoped path for owner overrides.
 */
export const updateTeamMemory = authAction({
  args: {
    profileId: v.id("profiles"),
    memoryId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> =>
    runUpdateTeamMemory(ctx, args),
});

/**
 * Delete a team memory. Creator uses the standard per-user delete path;
 * team owner override uses a profile-scoped delete (doesn't require caller
 * to be the creator).
 */
export const deleteTeamMemory = authAction({
  args: {
    profileId: v.id("profiles"),
    memoryId: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> =>
    runDeleteTeamMemory(ctx, args),
});
