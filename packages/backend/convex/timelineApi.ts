import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import {
  clampTimelinePage,
  timelineEventFromMemory,
} from "./memoryApi/timelineEvents";
import type { TimelineEvent } from "./memoryApi/types";
import { getMemoryForClerk, listMemoriesForClerk } from "./memoryRuntime";

export const getMemoryTimeline = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<TimelineEvent[]> => {
    const clerkId = await requireClerkId(ctx);
    const memory = await getMemoryForClerk(ctx, clerkId, args.memoryId);
    if (memory === null) return [];
    return [timelineEventFromMemory(memory)];
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
    const tag = args.tag.trim();
    if (tag.length === 0) return [];
    const page = clampTimelinePage(args.limit, args.offset);
    const listed = await listMemoriesForClerk(ctx, {
      clerkId,
      tags: [tag],
      limit: page.limit,
      offset: page.offset,
    });
    return listed.memories.map((memory) =>
      timelineEventFromMemory(memory, { connectionType: "tag" }),
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
