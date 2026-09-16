import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authAction, authMutation, requireClerkId } from "./auth";
import { routeMemoryByProfile } from "./memoryApi/routing";
import {
  runDeleteTeamMemory,
  runGetTeamMemory,
  runListTeamMemories,
  runUpdateTeamMemory,
} from "./memoryApi/team";
import { assertAccessibleProfileIfPresent } from "./profiles/accessibleProfile";
import type {
  MemoryListResult,
  MemoryWithTags,
  RetrieveMemoriesResult,
} from "./memoryApi/types";
import {
  createMemoryFields,
  listMemoriesFields,
  profileIdOptional,
  searchMemoriesFields,
  updateMemoryFields,
} from "./memoryApi/validators";
import {
  createMemoryForClerk,
  deleteMemoryForClerk,
  getMemoryForClerk,
  listMemoriesForClerk,
  retrieveMemoriesForClerk,
  retrieveMemoriesForTeamProfile,
  updateMemoryForClerk,
} from "./memoryRuntime";

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

export const getMemory = authAction({
  args: {
    memoryId: v.string(),
    profileId: profileIdOptional,
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> =>
    routeMemoryByProfile(ctx, args.profileId, {
      team: (teamProfile) =>
        runGetTeamMemory(ctx, {
          profileId: teamProfile._id,
          memoryId: args.memoryId,
        }),
      personal: (clerkId) => getMemoryForClerk(ctx, clerkId, args.memoryId),
    }),
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
  handler: async (ctx, args): Promise<MemoryListResult> =>
    routeMemoryByProfile(ctx, args.profileId, {
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
    }),
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
          }),
      }),
      ctx.runQuery(internal.userSettings.getUserContextInternal, {
        userId: ctx.userId,
      }),
    ]);
    return { memories, userContext };
  },
});
