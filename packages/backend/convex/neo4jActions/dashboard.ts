"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

export const getStatsInternal = internalAction({
  args: { clerkId: v.string(), profileId: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.getStats(args.clerkId, args.profileId ?? null);
  },
});

export const getProfilesStatsInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileIds: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    const results: Record<string, { total: number; today: number }> = {};
    // Fetch stats for each profile in parallel
    await Promise.all(
      args.profileIds.map(async (profileId) => {
        const stats = await service.getStats(args.clerkId, profileId);
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
    const service = new MemoryService(getDriver());
    return await service.getRecentActivity(
      args.clerkId,
      args.profileId ?? null,
      args.limit ?? 10,
    );
  },
});
