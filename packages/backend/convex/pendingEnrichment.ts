import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { authMutation, authQuery } from "./auth";

const sourceValidator = v.union(
  v.literal("mcp"),
  v.literal("import"),
  v.literal("web"),
);

export const enqueuePendingInternal = internalMutation({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    source: sourceValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pendingMemoryEnrichment")
      .withIndex("by_clerk_memory", (q) =>
        q.eq("clerkId", args.clerkId).eq("memoryId", args.memoryId),
      )
      .first();
    if (existing) {
      return { inserted: false };
    }
    await ctx.db.insert("pendingMemoryEnrichment", {
      clerkId: args.clerkId,
      memoryId: args.memoryId,
      source: args.source,
      queuedAt: Date.now(),
    });
    return { inserted: true };
  },
});

export const removePendingInternal = internalMutation({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pendingMemoryEnrichment")
      .withIndex("by_clerk_memory", (q) =>
        q.eq("clerkId", args.clerkId).eq("memoryId", args.memoryId),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const enqueuePendingEnrichment = authMutation({
  args: {
    memoryId: v.string(),
    source: sourceValidator,
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(ctx.userId);
    const clerkId = user?.clerkId;
    if (clerkId === undefined || clerkId === "") {
      throw new Error("User not found");
    }
    const existing = await ctx.db
      .query("pendingMemoryEnrichment")
      .withIndex("by_clerk_memory", (q) =>
        q.eq("clerkId", clerkId).eq("memoryId", args.memoryId),
      )
      .first();
    if (existing) {
      return;
    }
    await ctx.db.insert("pendingMemoryEnrichment", {
      clerkId,
      memoryId: args.memoryId,
      source: args.source,
      queuedAt: Date.now(),
    });
  },
});

export const removePendingEnrichment = authMutation({
  args: { memoryId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(ctx.userId);
    const clerkId = user?.clerkId;
    if (clerkId === undefined || clerkId === "") {
      throw new Error("User not found");
    }
    const existing = await ctx.db
      .query("pendingMemoryEnrichment")
      .withIndex("by_clerk_memory", (q) =>
        q.eq("clerkId", clerkId).eq("memoryId", args.memoryId),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const listPendingEnrichment = authQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(ctx.userId);
    const clerkId = user?.clerkId;
    if (clerkId === undefined || clerkId === "") return [];
    const limit = args.limit ?? 100;
    const rows = await ctx.db
      .query("pendingMemoryEnrichment")
      .withIndex("by_clerk_queued", (q) => q.eq("clerkId", clerkId))
      .order("asc")
      .take(limit);
    return rows.map((r) => ({
      _id: r._id,
      memoryId: r.memoryId,
      source: r.source,
      queuedAt: r.queuedAt,
    }));
  },
});
