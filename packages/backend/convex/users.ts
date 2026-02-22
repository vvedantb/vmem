import { query } from "./_generated/server";
import { authMutation } from "./auth";
import { v } from "convex/values";

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
  },
});

export const setTheme = authMutation({
  args: { theme: v.union(v.literal("light"), v.literal("dark")) },
  handler: async (ctx, args) => {
    await ctx.db.patch(ctx.userId, { theme: args.theme });
  },
});
