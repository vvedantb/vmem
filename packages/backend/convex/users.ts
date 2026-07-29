import { query, internalQuery } from "./_generated/server";
import { authQuery, getUserByClerkId } from "./auth";
import { v } from "convex/values";

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return null;
    return getUserByClerkId(ctx, identity.subject);
  },
});

export const getByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => getUserByClerkId(ctx, args.clerkId),
});

// resolve clerkIds to minimal user info for attribution in team memory lists
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
      const user = await getUserByClerkId(ctx, clerkId);
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
