import { query, internalQuery } from "./_generated/server";
import { authQuery, authMutation } from "./auth";
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

/** Get user by Clerk ID (internal, for MCP profile resolution) */
export const getByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

/**
 * Resolve clerkIds → minimal user info for attribution in team memory lists.
 * Returns a map keyed by clerkId; unknown clerkIds are simply omitted.
 * Intentionally only exposes display fields (no Convex _id, no theme, etc.).
 */
export const getByClerkIds = authQuery({
  args: { clerkIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const unique = Array.from(new Set(args.clerkIds));
    const result: Record<
      string,
      {
        firstName: string | null;
        lastName: string | null;
        fullName: string | null;
        email: string | null;
      }
    > = {};
    for (const clerkId of unique) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
        .first();
      if (!user) continue;
      result[clerkId] = {
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        fullName: user.fullName ?? null,
        email: user.email ?? null,
      };
    }
    return result;
  },
});
