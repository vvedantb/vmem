"use node";

import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { getDriver } from "../engine/neo4j/driver";
import {
  getMemoryTimeline as fetchMemoryTimeline,
  getSearchTimeline as fetchSearchTimeline,
  getTopicTimeline as fetchTopicTimeline,
} from "../engine/neo4j/memory/timeline";
import type { TimelineEvent } from "../engine/neo4j/memory/types";

export const getMemoryTimeline = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<TimelineEvent[]> => {
    const clerkId = await requireClerkId(ctx);
    return await fetchMemoryTimeline(getDriver(), clerkId, args.memoryId);
  },
});

export const getTopicTimeline = authAction({
  args: {
    tag: v.string(),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<TimelineEvent[]> => {
    const clerkId = await requireClerkId(ctx);
    return await fetchTopicTimeline(
      getDriver(),
      clerkId,
      args.tag,
      args.limit,
      args.offset,
    );
  },
});

export const getSearchTimeline = authAction({
  args: {
    query: v.string(),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<TimelineEvent[]> => {
    const clerkId = await requireClerkId(ctx);
    return await fetchSearchTimeline(
      getDriver(),
      clerkId,
      args.query,
      args.limit,
      args.offset,
    );
  },
});
