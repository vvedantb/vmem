"use node";

import { v } from "convex/values";
import { ActionCache } from "@convex-dev/action-cache";
import { authAction, requireClerkId, type AuthActionCtx } from "./auth";
import { components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  getRecentActivity as fetchRecentActivity,
  getStats as fetchStats,
} from "../engine/neo4j/memory/stats";
import { runWithNeo4jDriver } from "./neo4jActions/_shared/driver";

const DASHBOARD_CACHE_TTL_MS = 30_000;

type StatsResult = Awaited<ReturnType<typeof fetchStats>>;
type ActivityItem = Awaited<ReturnType<typeof fetchRecentActivity>>[number];

export const getStatsInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    strictProfile: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) =>
    runWithNeo4jDriver(args, ({ driver, userId, profileId, strictProfile }) =>
      fetchStats(driver, userId, profileId ?? null, strictProfile === true),
    ),
});

export const getRecentActivityInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    strictProfile: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) =>
    runWithNeo4jDriver(
      args,
      ({ driver, userId, profileId, strictProfile, limit }) =>
        fetchRecentActivity(
          driver,
          userId,
          profileId ?? null,
          limit ?? 10,
          strictProfile === true,
        ),
    ),
});

const statsCache = new ActionCache(components.actionCache, {
  action: internal.dashboardApi.getStatsInternal,
  name: "getStatsInternal-v2",
  ttl: DASHBOARD_CACHE_TTL_MS,
});

const recentActivityCache = new ActionCache(components.actionCache, {
  action: internal.dashboardApi.getRecentActivityInternal,
  name: "getRecentActivityInternal-v2",
  ttl: DASHBOARD_CACHE_TTL_MS,
});

async function resolveStrictProfile(
  ctx: AuthActionCtx,
  profileId: string | undefined,
): Promise<boolean> {
  if (profileId === undefined) return false;
  const profile = await ctx.runQuery(
    internal.teams.assertProfileAccessInternal,
    { profileId, userId: ctx.userId },
  );
  return profile.teamId !== undefined;
}

export const getStats = authAction({
  args: {
    profileId: v.optional(v.string()),
    fresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<StatsResult> => {
    const clerkId = await requireClerkId(ctx);
    const strictProfile = await resolveStrictProfile(ctx, args.profileId);
    return await statsCache.fetch(
      ctx,
      { clerkId, profileId: args.profileId, strictProfile },
      args.fresh ? { force: true } : undefined,
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
    const strictProfile = await resolveStrictProfile(ctx, args.profileId);
    return await recentActivityCache.fetch(ctx, {
      clerkId,
      profileId: args.profileId,
      strictProfile,
      limit: args.limit,
    });
  },
});
