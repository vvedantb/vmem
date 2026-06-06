"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import {
  countMemoryEvents,
  getRecentActivity,
  getStats,
} from "../../src/neo4j/memory/stats";
import { getDriver } from "../../src/neo4j/driver";

export const getStatsInternal = internalAction({
  args: { clerkId: v.string(), profileId: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getStats(driver, args.clerkId, args.profileId ?? null);
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
    // Fetch stats for each profile in parallel
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
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getRecentActivity(
      driver,
      args.clerkId,
      args.profileId ?? null,
      args.limit ?? 10,
    );
  },
});

/** Diagnostic: count MemoryEvent nodes for a user. Run from Convex dashboard. */
export const debugCountEvents = internalAction({
  args: { clerkId: v.string() },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    const { total, breakdown } = await countMemoryEvents(driver, args.clerkId);
    console.log(`[debugCountEvents] total=${total}`, breakdown);
    return { total, breakdown };
  },
});
