import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  authAction,
  authMutation,
  authQuery,
  requireClerkId,
  type AuthActionCtx,
} from "./auth";
import { routeMemoryByProfile } from "./memoryApi/routing";
import {
  runDeleteTeamMemory,
  runGetTeamMemory,
  runListTeamMemories,
  runUpdateTeamMemory,
} from "./memoryApi/team";
import {
  assertAccessibleProfileIfPresent,
  resolveAccessibleTeamScope,
} from "./profiles/accessibleProfile";
import type {
  MemoryListResult,
  MemoryWithTags,
  RetrieveMemoriesResult,
} from "./memoryApi/types";
import {
  memorySummaryFilterFields,
  memorySummaryValidator,
} from "./validators";
import { listMemorySummariesPaged } from "./memoryStore/walk";
import type { MemorySummary } from "./memoryStore/mappers";
import {
  createMemoryFields,
  listMemoriesFields,
  profileIdOptional,
  searchMemoriesFields,
  updateMemoryFields,
} from "./memoryApi/validators";
import {
  memoryListResultValidator,
  memoryWithTagsValidator,
  runCreate,
  runGet,
  runList,
  runListSummaries,
  runRemove,
  runUpdate,
} from "./memoryApi/client";
import {
  createMemoryForClerk,
  deleteMemoryForClerk,
  getMemoryForClerk,
  listMemoriesForClerk,
  retrieveMemoriesForClerk,
  retrieveMemoriesForTeamProfile,
  updateMemoryForClerk,
} from "./memoryRuntime";
import { enqueueMemoryAccess } from "./memoryUsefulness";

export const list = authQuery({
  args: listMemoriesFields,
  returns: memoryListResultValidator,
  handler: async (ctx, args) => runList(ctx, args),
});

// Slim, reactive, paginated list (usePaginatedQuery). Prefer this over `list`
// for anything shown in a long list: pages are independent reactive ranges and
// rows carry a preview, not content.
export const listSummaries = authQuery({
  args: {
    profileId: profileIdOptional,
    ...memorySummaryFilterFields,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => runListSummaries(ctx, args),
});

const MAX_ALL_SUMMARIES = 10_000;

// Non-reactive: every matching slim row in scope (capped), for facets (tag /
// source / type counts, tag suggestions) and the timeline. One scope walk per
// call, so callers cache it and only fetch on demand.
export const listAllSummaries = authAction({
  args: {
    profileId: profileIdOptional,
    ...memorySummaryFilterFields,
    limit: v.optional(v.number()),
  },
  returns: v.object({
    memories: v.array(memorySummaryValidator),
    truncated: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ memories: MemorySummary[]; truncated: boolean }> => {
    const clerkId = await requireClerkId(ctx);
    const { teamId } = await resolveAccessibleTeamScope(ctx, args.profileId);
    const scope =
      teamId !== undefined && args.profileId !== undefined
        ? ({ kind: "team", profileId: args.profileId } as const)
        : ({
            kind: "personal",
            userId: clerkId,
            profileId: args.profileId,
          } as const);
    const { rows, truncated } = await listMemorySummariesPaged(
      ctx,
      scope,
      {
        type: args.type,
        source: args.source,
        tags: args.tags,
        searchQuery: args.searchQuery,
      },
      Math.min(Math.max(1, args.limit ?? MAX_ALL_SUMMARIES), MAX_ALL_SUMMARIES),
    );
    return { memories: rows, truncated };
  },
});

export const get = authQuery({
  args: {
    memoryId: v.string(),
    profileId: profileIdOptional,
  },
  returns: v.union(memoryWithTagsValidator, v.null()),
  handler: async (ctx, args) => runGet(ctx, args),
});

export const create = authMutation({
  args: createMemoryFields,
  returns: memoryWithTagsValidator,
  handler: async (ctx, args) => runCreate(ctx, args),
});

export const update = authMutation({
  args: updateMemoryFields,
  returns: v.union(memoryWithTagsValidator, v.null()),
  handler: async (ctx, args) => runUpdate(ctx, args),
});

export const remove = authMutation({
  args: {
    memoryId: v.string(),
    profileId: profileIdOptional,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => runRemove(ctx, args),
});

export const generateMemoryUploadUrl = authMutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const createMemory = authAction({
  args: createMemoryFields,
  handler: async (ctx, args): Promise<MemoryWithTags> => {
    const clerkId = await requireClerkId(ctx);
    await assertAccessibleProfileIfPresent(ctx, args.profileId);
    return await createMemoryForClerk(ctx, {
      clerkId,
      profileId: args.profileId,
      title: args.title,
      content: args.content,
      type: args.type,
      source: args.source,
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
      url: args.url,
      externalId: args.externalId,
      sourceType: args.sourceType,
    });
  },
});

const openMemoryFields = {
  memoryId: v.string(),
  profileId: profileIdOptional,
};

async function readMemory(
  ctx: AuthActionCtx,
  args: { memoryId: string; profileId?: string },
): Promise<MemoryWithTags | null> {
  return await routeMemoryByProfile(ctx, args.profileId, {
    team: (teamProfile) =>
      runGetTeamMemory(ctx, {
        profileId: teamProfile._id,
        memoryId: args.memoryId,
      }),
    personal: (clerkId) => getMemoryForClerk(ctx, clerkId, args.memoryId),
  });
}

// Opening a memory counts as access ("search" kind in memoryUsage).
export const getMemory = authAction({
  args: openMemoryFields,
  handler: async (ctx, args): Promise<MemoryWithTags | null> => {
    const memory = await readMemory(ctx, args);
    if (memory !== null) await enqueueMemoryAccess(ctx, [memory.id], "search");
    return memory;
  },
});

// Dashboard: the user picked a memory in the command palette. The reactive
// `get` query cannot count, and counts on every rerender would be wrong.
export const recordMemoryOpen = authAction({
  args: openMemoryFields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const memory = await readMemory(ctx, args);
    if (memory !== null) await enqueueMemoryAccess(ctx, [memory.id], "search");
    return null;
  },
});

export const listMemories = authAction({
  args: listMemoriesFields,
  handler: async (ctx, args): Promise<MemoryListResult> =>
    routeMemoryByProfile(ctx, args.profileId, {
      team: (teamProfile) =>
        runListTeamMemories(ctx, {
          profileId: teamProfile._id,
          type: args.type,
          status: args.status,
          tags: args.tags,
          source: args.source,
          searchQuery: args.searchQuery,
          limit: args.limit,
          offset: args.offset,
        }),
      personal: (clerkId) =>
        listMemoriesForClerk(ctx, {
          clerkId,
          profileId: args.profileId,
          type: args.type,
          status: args.status,
          source: args.source,
          tags: args.tags,
          searchQuery: args.searchQuery,
          limit: args.limit,
          offset: args.offset,
        }),
    }),
});

export const updateMemory = authAction({
  args: updateMemoryFields,
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
        return updateMemoryForClerk(ctx, { clerkId, ...rest });
      },
    }),
});

export const deleteMemory = authAction({
  args: {
    memoryId: v.string(),
    profileId: profileIdOptional,
  },
  handler: async (ctx, args): Promise<boolean> =>
    routeMemoryByProfile(ctx, args.profileId, {
      team: (teamProfile) =>
        runDeleteTeamMemory(ctx, {
          profileId: teamProfile._id,
          memoryId: args.memoryId,
        }),
      personal: (clerkId) => deleteMemoryForClerk(ctx, clerkId, args.memoryId),
    }),
});

export const deleteAllMemories = authAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runMutation(
      internal.memoryStore.functions.deleteMemoriesForUserInternal,
      { userId: clerkId },
    );
  },
});

export const searchMemories = authAction({
  args: searchMemoriesFields,
  handler: async (ctx, args): Promise<MemoryListResult> => {
    const result = await routeMemoryByProfile(ctx, args.profileId, {
      team: (teamProfile) =>
        runListTeamMemories(ctx, {
          profileId: teamProfile._id,
          type: args.type,
          tags: args.tags,
          source: args.source,
          searchQuery: args.query,
          limit: args.limit,
          offset: args.offset,
        }),
      personal: (clerkId) =>
        listMemoriesForClerk(ctx, {
          clerkId,
          profileId: args.profileId,
          type: args.type,
          source: args.source,
          tags: args.tags,
          searchQuery: args.query,
          limit: args.limit,
          offset: args.offset,
        }),
    });
    // no access tracking: this runs on every palette keystroke (debounced)
    return result;
  },
});

export const retrieveMemories = authAction({
  args: {
    query: v.string(),
    profileId: profileIdOptional,
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    status: v.optional(v.string()),
    source: v.optional(v.string()),
    limit: v.number(),
    threshold: v.optional(v.number()),
    rerank: v.optional(v.union(v.boolean(), v.literal("jev"))),
    judge: v.optional(v.union(v.literal("jev"), v.literal("off"))),
    referenceDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RetrieveMemoriesResult> => {
    const [memories, userContext] = await Promise.all([
      routeMemoryByProfile(ctx, args.profileId, {
        team: (teamProfile, clerkId) =>
          retrieveMemoriesForTeamProfile(ctx, {
            clerkId,
            profileId: teamProfile._id,
            query: args.query,
            type: args.type,
            tags: args.tags,
            status: args.status,
            source: args.source,
            limit: args.limit,
            threshold: args.threshold,
            rerank: args.rerank,
            judge: args.judge,
            referenceDate: args.referenceDate,
          }),
        personal: (clerkId) =>
          retrieveMemoriesForClerk(ctx, {
            clerkId,
            profileId: args.profileId,
            query: args.query,
            type: args.type,
            tags: args.tags,
            status: args.status,
            source: args.source,
            limit: args.limit,
            threshold: args.threshold,
            rerank: args.rerank,
            judge: args.judge,
            referenceDate: args.referenceDate,
          }),
      }),
      ctx.runQuery(internal.userSettings.getUserContextInternal, {
        userId: ctx.userId,
      }),
    ]);
    return { memories, userContext };
  },
});
