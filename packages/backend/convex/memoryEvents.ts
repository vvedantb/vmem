import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const eventTypeValidator = v.union(
  v.literal("memory_created"),
  v.literal("memory_updated"),
  v.literal("memory_deleted"),
  v.literal("relationship_created"),
  v.literal("relationship_deleted"),
);

export const pushEvent = mutation({
  args: {
    secret: v.string(),
    clerkId: v.string(),
    eventType: eventTypeValidator,
    memoryId: v.string(),
    payload: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const expected = process.env.CONVEX_EVENT_SECRET;
    if (!expected || args.secret !== expected) {
      throw new Error("Unauthorized");
    }

    await ctx.db.insert("memoryEvents", {
      clerkId: args.clerkId,
      eventType: args.eventType,
      memoryId: args.memoryId,
      payload: args.payload,
    });

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const oldEvents = await ctx.db
      .query("memoryEvents")
      .withIndex("by_clerk", (q) =>
        q.eq("clerkId", args.clerkId).lt("_creationTime", fiveMinutesAgo),
      )
      .collect();

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    return null;
  },
});

export const pushEventInternal = internalMutation({
  args: {
    clerkId: v.string(),
    eventType: eventTypeValidator,
    memoryId: v.string(),
    payload: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("memoryEvents", {
      clerkId: args.clerkId,
      eventType: args.eventType,
      memoryId: args.memoryId,
      payload: args.payload,
    });

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const oldEvents = await ctx.db
      .query("memoryEvents")
      .withIndex("by_clerk", (q) =>
        q.eq("clerkId", args.clerkId).lt("_creationTime", fiveMinutesAgo),
      )
      .collect();

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    return null;
  },
});

export const getRecentEvents = query({
  args: {
    since: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id("memoryEvents"),
      _creationTime: v.number(),
      clerkId: v.string(),
      eventType: eventTypeValidator,
      memoryId: v.string(),
      payload: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const clerkId = identity.subject;
    if (!clerkId) return [];

    return await ctx.db
      .query("memoryEvents")
      .withIndex("by_clerk", (q) =>
        q.eq("clerkId", clerkId).gt("_creationTime", args.since),
      )
      .collect();
  },
});
