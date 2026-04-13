"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

export const getGraphDataInternal = internalAction({
  args: {
    clerkId: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    if (args.focus) {
      return await service.getLocalGraph(args.clerkId, args.focus);
    }
    return await service.getGraphData(args.clerkId);
  },
});

export const getLocalGraphInternal = internalAction({
  args: {
    clerkId: v.string(),
    focusId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.getLocalGraph(args.clerkId, args.focusId);
  },
});
