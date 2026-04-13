"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

export const getMemoryTimelineInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.getMemoryTimeline(args.clerkId, args.memoryId);
  },
});

export const getTopicTimelineInternal = internalAction({
  args: {
    clerkId: v.string(),
    tag: v.string(),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.getTopicTimeline(
      args.clerkId,
      args.tag,
      args.limit,
      args.offset,
    );
  },
});

export const getSearchTimelineInternal = internalAction({
  args: {
    clerkId: v.string(),
    query: v.string(),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.getSearchTimeline(
      args.clerkId,
      args.query,
      args.limit,
      args.offset,
    );
  },
});
