import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import type { TimelineEvent } from "./memoryApi/types";

export const getMemoryTimeline = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx): Promise<TimelineEvent[]> => {
    await requireClerkId(ctx);
    return [];
  },
});

export const getTopicTimeline = authAction({
  args: {
    tag: v.string(),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx): Promise<TimelineEvent[]> => {
    await requireClerkId(ctx);
    return [];
  },
});

export const getSearchTimeline = authAction({
  args: {
    query: v.string(),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx): Promise<TimelineEvent[]> => {
    await requireClerkId(ctx);
    return [];
  },
});
