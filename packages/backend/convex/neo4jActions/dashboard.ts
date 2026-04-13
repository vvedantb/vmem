"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

export const getStatsInternal = internalAction({
  args: { clerkId: v.string() },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.getStats(args.clerkId);
  },
});

export const getRecentActivityInternal = internalAction({
  args: {
    clerkId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.getRecentActivity(args.clerkId, args.limit ?? 10);
  },
});
