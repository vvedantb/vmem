import { v } from "convex/values";
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
  handler: async (ctx): Promise<boolean> => {
    await requireClerkId(ctx);
    return false;
  },
});

export const unlinkMemories = authAction({
  args: {
    memoryIdA: v.string(),
    memoryIdB: v.string(),
  },
  handler: async (ctx): Promise<boolean> => {
    await requireClerkId(ctx);
    return false;
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
