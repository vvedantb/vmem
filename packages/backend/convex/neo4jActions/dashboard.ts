"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { getRecentActivity, getStats } from "../../engine/neo4j/memory/stats";
import { runWithNeo4jDriver } from "./_shared/driver";

export const getStatsInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    strictProfile: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) =>
    runWithNeo4jDriver(args, ({ driver, userId, profileId, strictProfile }) =>
      getStats(driver, userId, profileId ?? null, strictProfile === true),
    ),
});

export const getProfilesStatsInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileIds: v.array(v.string()),
  },
  handler: async (_ctx, args) =>
    runWithNeo4jDriver(args, async ({ driver, userId, profileIds }) => {
      const results: Record<string, { total: number; today: number }> = {};
      await Promise.all(
        profileIds.map(async (profileId) => {
          const stats = await getStats(driver, userId, profileId);
          results[profileId] = {
            total: stats.totalMemories,
            today: stats.memoriesAddedToday,
          };
        }),
      );
      return results;
    }),
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
        getRecentActivity(
          driver,
          userId,
          profileId ?? null,
          limit ?? 10,
          strictProfile === true,
        ),
    ),
});
