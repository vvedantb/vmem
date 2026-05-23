"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import {
  getMemoryTimeline,
  getSearchTimeline,
  getTopicTimeline,
} from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

export const getMemoryTimelineInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getMemoryTimeline(driver, args.clerkId, args.memoryId);
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
    const driver = getDriver();
    return await getTopicTimeline(
      driver,
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
    const driver = getDriver();
    return await getSearchTimeline(
      driver,
      args.clerkId,
      args.query,
      args.limit,
      args.offset,
    );
  },
});
