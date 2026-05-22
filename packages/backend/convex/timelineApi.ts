import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";

interface MemorySnapshot {
  title: string;
  content: string;
  type: string;
  status: string;
  confidence: number;
  tags: string[];
}

interface TimelineEvent {
  id: string;
  action: string;
  actor: string;
  details: Record<string, string> | null;
  snapshot: MemorySnapshot | null;
  createdAt: string;
  memoryId: string;
  memoryTitle: string;
  connectionType?: "tag" | "related";
}

export const getMemoryTimeline = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<TimelineEvent[]> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.timeline.getMemoryTimelineInternal,
      {
        clerkId,
        memoryId: args.memoryId,
      },
    );
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
    return await ctx.runAction(
      internal.neo4jActions.timeline.getTopicTimelineInternal,
      {
        clerkId,
        tag: args.tag,
        limit: args.limit,
        offset: args.offset,
      },
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
    return await ctx.runAction(
      internal.neo4jActions.timeline.getSearchTimelineInternal,
      {
        clerkId,
        query: args.query,
        limit: args.limit,
        offset: args.offset,
      },
    );
  },
});
