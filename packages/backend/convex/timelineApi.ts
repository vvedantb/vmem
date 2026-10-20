import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import {
  clampTimelinePage,
  memoryTimeline,
  timelineEventFromMemory,
  topicTimeline,
} from "./memoryApi/timelineEvents";
import type { TimelineEvent } from "./memoryApi/types";
import { getMemoryForClerk, listMemoriesForClerk } from "./memoryRuntime";

export const getMemoryTimeline = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<TimelineEvent[]> => {
    const clerkId = await requireClerkId(ctx);
    return memoryTimeline(await getMemoryForClerk(ctx, clerkId, args.memoryId));
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
    return topicTimeline(
      (page) => listMemoriesForClerk(ctx, { clerkId, ...page }),
      args,
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
    const query = args.query.trim();
    if (query.length === 0) return [];
    const page = clampTimelinePage(args.limit, args.offset);
    const listed = await listMemoriesForClerk(ctx, {
      clerkId,
      searchQuery: query,
      limit: page.limit,
      offset: page.offset,
    });
    return listed.memories.map((memory) => timelineEventFromMemory(memory));
  },
});
