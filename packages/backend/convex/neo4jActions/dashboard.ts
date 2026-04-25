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

/** Diagnostic: count MemoryEvent nodes for a user. Run from Convex dashboard. */
export const debugCountEvents = internalAction({
  args: { clerkId: v.string() },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    const session = driver.session();
    try {
      const r1 = await session.run(
        `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
         RETURN count(e) AS total`,
        { userId: args.clerkId },
      );
      const total = r1.records[0]?.get("total")?.toNumber() ?? 0;

      const r2 = await session.run(
        `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
         RETURN e.action AS action, count(*) AS cnt
         ORDER BY cnt DESC`,
        { userId: args.clerkId },
      );
      const breakdown = r2.records.map((r) => ({
        action: String(r.get("action")),
        count: r.get("cnt").toNumber(),
      }));

      console.log(`[debugCountEvents] total=${total}`, breakdown);
      return { total, breakdown };
    } finally {
      await session.close();
    }
  },
});
