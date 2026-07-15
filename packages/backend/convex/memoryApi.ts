import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authAction, authMutation, requireClerkId } from "./auth";
import { assertTeamAccess } from "./memoryApi/auth";
import { routeMemoryByProfile } from "./memoryApi/routing";
import {
  runDeleteTeamMemory,
  runGetTeamMemory,
  runListTeamMemories,
  runUpdateTeamMemory,
} from "./memoryApi/team";
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
    // personal profiles inherit ownership via matching userId; team
    // profiles require membership before we hit the graph
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
    // active workspace; team profiles read via the member-wide path
    profileId: profileIdOptional,
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
        ctx.runAction(internal.neo4jActions.memories.listMemoriesInternal, {
          clerkId,
          ...args,
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
    // active workspace; team profiles use creator-or-owner permissions
    profileId: profileIdOptional,
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

// delete every memory the calling user owns, along with all per-user dependents
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
        ctx.runAction(internal.neo4jActions.memories.listMemoriesInternal, {
          clerkId,
          profileId: args.profileId,
          type: args.type,
          tags: args.tags,
          source: args.source,
          searchQuery: args.query,
          limit: args.limit,
          offset: args.offset,
        }),
    }),
});

export const retrieveMemories = authAction({
  args: {
    query: v.string(),
    // active workspace to ground retrieval in
    profileId: profileIdOptional,
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<RetrieveMemoriesResult> => {
    const clerkId = await requireClerkId(ctx);
    // workspace grounding: assert access before scoping retrieval
    if (args.profileId) await assertTeamAccess(ctx, args.profileId);
    // memories + userContext run in parallel
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
