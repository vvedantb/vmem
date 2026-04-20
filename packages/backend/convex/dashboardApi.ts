import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";

interface StatsResult {
  totalMemories: number;
  memoriesThisWeek: number;
  memoriesThisMonth: number;
  memoriesAddedToday: number;
  totalTags: number;
  growthData: { date: string; total: number; new: number }[];
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  relativeTime: string;
}

export const getStats = authAction({
  args: { profileId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<StatsResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.dashboard.getStatsInternal,
      { clerkId, profileId: args.profileId },
    );
  },
});

interface ProfileStats {
  total: number;
  today: number;
}

export const getProfilesStats = authAction({
  args: { profileIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<Record<string, ProfileStats>> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.dashboard.getProfilesStatsInternal,
      { clerkId, profileIds: args.profileIds },
    );
  },
});

export const getRecentActivity = authAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<ActivityItem[]> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.dashboard.getRecentActivityInternal,
      {
        clerkId,
        limit: args.limit,
      },
    );
  },
});
