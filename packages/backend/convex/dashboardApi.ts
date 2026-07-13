import { v } from "convex/values";
import { ActionCache } from "@convex-dev/action-cache";
import { authAction, requireClerkId } from "./auth";
import { components, internal } from "./_generated/api";

const DASHBOARD_CACHE_TTL_MS = 30_000;

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

const statsCache = new ActionCache(components.actionCache, {
  action: internal.neo4jActions.dashboard.getStatsInternal,
  name: "getStatsInternal-v1",
  ttl: DASHBOARD_CACHE_TTL_MS,
});

const recentActivityCache = new ActionCache(components.actionCache, {
  action: internal.neo4jActions.dashboard.getRecentActivityInternal,
  name: "getRecentActivityInternal-v1",
  ttl: DASHBOARD_CACHE_TTL_MS,
});

export const getStats = authAction({
  args: {
    profileId: v.optional(v.string()),
    fresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<StatsResult> => {
    const clerkId = await requireClerkId(ctx);
    return await statsCache.fetch(
      ctx,
      { clerkId, profileId: args.profileId },
      args.fresh ? { force: true } : undefined,
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
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.dashboard.getProfilesStatsInternal,
      { clerkId, profileIds: args.profileIds },
    );
  },
});

export const getRecentActivity = authAction({
  args: {
    profileId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ActivityItem[]> => {
    const clerkId = await requireClerkId(ctx);
    return await recentActivityCache.fetch(ctx, {
      clerkId,
      profileId: args.profileId,
      limit: args.limit,
    });
  },
});
