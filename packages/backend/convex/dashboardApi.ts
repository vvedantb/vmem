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
  args: {},
  handler: async (ctx): Promise<StatsResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.dashboard.getStatsInternal,
      { clerkId },
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
