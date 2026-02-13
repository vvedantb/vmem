import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const clerkUserId = identity.subject;
  if (!clerkUserId) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
    .first();

  return user?._id ?? null;
}

export const ensureUserExists = mutation({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    wasCreated: v.boolean(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkUserId = identity.subject;
    if (!clerkUserId) {
      throw new Error("Clerk user ID is required");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
      .first();

    if (existingUser) {
      return { userId: existingUser._id, wasCreated: false };
    }

    const email = identity.email || undefined;
    const firstName =
      typeof identity.givenName === "string" ? identity.givenName : undefined;
    const lastName =
      typeof identity.familyName === "string" ? identity.familyName : undefined;
    const fullName =
      typeof identity.name === "string" ? identity.name : undefined;

    const userId = await ctx.db.insert("users", {
      clerkId: clerkUserId,
      email,
      firstName,
      lastName,
      fullName,
    });

    return { userId, wasCreated: true };
  },
});

export const me = query({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => {
    return await getCurrentUserId(ctx);
  },
});
