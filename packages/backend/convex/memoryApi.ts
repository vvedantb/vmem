import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authAction, authMutation, requireClerkId } from "./auth";
import { assertTeamAccess } from "./memoryApi/auth";
import { routeMemoryByProfile } from "./memoryApi/routing";
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
  handler: async (ctx, args): Promise<MemoryWithTags> => {
    const clerkId = await requireClerkId(ctx);
    // Personal profiles inherit ownership via matching userId; team
    // profiles require membership before we hit the graph.
    if (args.profileId) await assertTeamAccess(ctx, args.profileId);
    return await ctx.runAction(
      internal.neo4jActions.memories.createMemoryInternal,
      { clerkId, ...args },
    );
  },
});

export const getMemory = authAction({
  args: {
    memoryId: v.string(),
    /** Active workspace; team profiles read via the member-wide path. */
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> =>
    routeMemoryByProfile(ctx, args.profileId, {
      team: (teamProfile) =>
        runGetTeamMemory(ctx, {
          profileId: teamProfile._id,
          memoryId: args.memoryId,
        }),
      personal: (clerkId) =>
        ctx.runAction(internal.neo4jActions.memories.getMemoryInternal, {
          clerkId,
          memoryId: args.memoryId,
        }),
    }),
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
    routeMemoryByProfile(ctx, args.profileId, {
      team: async (teamProfile) => {
        // Team workspace: member-wide listing. Free-text / source filters map
        // onto the team search variant (the team list path has no
        // searchQuery/source support of its own).
        if (args.searchQuery !== undefined || args.source !== undefined) {
          return runSearchTeamMemories(ctx, {
            profileId: teamProfile._id,
            query: args.searchQuery,
            type: args.type,
            tags: args.tags,
            source: args.source,
            limit: args.limit,
            offset: args.offset,
          });
        }
        return runListTeamMemories(ctx, {
          profileId: teamProfile._id,
          type: args.type,
          status: args.status,
          tags: args.tags,
          limit: args.limit,
          offset: args.offset,
        });
      },
      personal: (clerkId) =>
        ctx.runAction(internal.neo4jActions.memories.listMemoriesInternal, {
          clerkId,
          ...args,
        }),
    }),
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
    routeMemoryByProfile(ctx, args.profileId, {
      team: (teamProfile) => {
        const { profileId: _profileId, ...rest } = args;
        return runUpdateTeamMemory(ctx, {
          profileId: teamProfile._id,
          ...rest,
        });
      },
      personal: (clerkId) => {
        const { profileId: _profileId, ...rest } = args;
        return ctx.runAction(
          internal.neo4jActions.memories.updateMemoryInternal,
          { clerkId, ...rest },
        );
      },
    }),
});

export const deleteMemory = authAction({
  args: {
    memoryId: v.string(),
    /** Active workspace; team profiles use creator-or-owner permissions. */
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<boolean> =>
    routeMemoryByProfile(ctx, args.profileId, {
      team: (teamProfile) =>
        runDeleteTeamMemory(ctx, {
          profileId: teamProfile._id,
          memoryId: args.memoryId,
        }),
      personal: (clerkId) =>
        ctx.runAction(internal.neo4jActions.memories.deleteMemoryInternal, {
          clerkId,
          memoryId: args.memoryId,
        }),
    }),
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
  handler: async (ctx): Promise<number> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.memories.deleteAllMemoriesInternal,
      { clerkId },
    );
  },
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
    routeMemoryByProfile(ctx, args.profileId, {
      team: (teamProfile) => {
        const { profileId: _profileId, ...rest } = args;
        return runSearchTeamMemories(ctx, {
          profileId: teamProfile._id,
          ...rest,
        });
      },
      personal: (clerkId) =>
        ctx.runAction(internal.neo4jActions.memories.searchMemoriesInternal, {
          clerkId,
          ...args,
        }),
    }),
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
  handler: async (ctx, args): Promise<RetrieveMemoriesResult> => {
    const clerkId = await requireClerkId(ctx);
    // Workspace grounding: assert access before scoping retrieval. Team
    // profiles currently retrieve only the caller's own memories in that
    // profile (hybrid retrieval is per-user) — member-wide team retrieval is
    // a follow-up.
    if (args.profileId) await assertTeamAccess(ctx, args.profileId);
    // Memories + userContext run in parallel — userContext doesn't depend
    // on the retrieval result, so the LLM caller can stitch them once both
    // resolve. Saves ~1 RTT vs sequential.
    const [memories, userContext] = await Promise.all([
      ctx.runAction(internal.neo4jActions.memories.retrieveMemoriesInternal, {
        clerkId,
        ...args,
      }),
      ctx.runQuery(internal.userSettings.getUserContextInternal, {
        userId: ctx.userId,
      }),
    ]);
    return { memories, userContext };
  },
});

export const getMemoryEvents = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<MemoryEvent[]> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.memories.getMemoryEventsInternal,
      { clerkId, ...args },
    );
  },
});
