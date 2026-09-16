import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authAction, requireClerkId } from "./auth";
import type { MemoryWithTags } from "./memoryApi/types";
import {
  relatedMemoriesForClerk,
  relatedMemoriesForTeamProfile,
} from "./memoryRuntime";
import { getProfileKind } from "./memoryScope";

type RelatedMemory = { memory: MemoryWithTags; reason: string };

export const linkMemories = authAction({
  args: {
    memoryIdA: v.string(),
    memoryIdB: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runMutation(
      internal.memoryStore.functions.linkMemoriesInternal,
      {
        userId: clerkId,
        memoryIdA: args.memoryIdA,
        memoryIdB: args.memoryIdB,
        reason: args.reason,
      },
    );
  },
});

export const unlinkMemories = authAction({
  args: {
    memoryIdA: v.string(),
    memoryIdB: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runMutation(
      internal.memoryStore.functions.unlinkMemoriesInternal,
      {
        userId: clerkId,
        memoryIdA: args.memoryIdA,
        memoryIdB: args.memoryIdB,
      },
    );
  },
});

export const getRelatedMemories = authAction({
  args: {
    memoryId: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RelatedMemory[]> => {
    const clerkId = await requireClerkId(ctx);
    const kind = await getProfileKind(ctx, args.profileId);
    if (kind === "team" && args.profileId !== undefined) {
      return relatedMemoriesForTeamProfile(ctx, {
        profileId: args.profileId,
        memoryId: args.memoryId,
      });
    }
    return relatedMemoriesForClerk(ctx, {
      clerkId,
      profileId: args.profileId,
      memoryId: args.memoryId,
    });
  },
});
