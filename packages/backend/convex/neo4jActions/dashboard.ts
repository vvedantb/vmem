"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { getRecentActivity, getStats } from "../../engine/neo4j/memory/stats";
import { getDriver } from "../../engine/neo4j/driver";

export const getStatsInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    strictProfile: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getStats(
      driver,
      args.clerkId,
      args.profileId ?? null,
      args.strictProfile === true,
    );
  },
});

export const getProfilesStatsInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileIds: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    const results: Record<string, { total: number; today: number }> = {};
    await Promise.all(
      args.profileIds.map(async (profileId) => {
        const stats = await getStats(driver, args.clerkId, profileId);
        results[profileId] = {
          total: stats.totalMemories,
          today: stats.memoriesAddedToday,
        };
      }),
    );
    return results;
  },
});

export const getRecentActivityInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    strictProfile: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getRecentActivity(
      driver,
      args.clerkId,
      args.profileId ?? null,
      args.limit ?? 10,
      args.strictProfile === true,
    );
  },
});
