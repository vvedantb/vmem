import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { getUserByClerkId } from "./auth";
import { applyItemToPlanSlugs } from "./lib/vPlan";

// Writers for users.planSlugs, called by the Clerk Billing webhook and backfill.
// A missing user row is a no-op: ensureUserExists reads no plan, and the next
// event or a backfill run fills the slugs in.

export const replacePlanSlugsInternal = internalMutation({
  args: { clerkId: v.string(), planSlugs: v.array(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, { clerkId, planSlugs }) => {
    const user = await getUserByClerkId(ctx, clerkId);
    if (!user) return false;
    await ctx.db.patch(user._id, { planSlugs });
    return true;
  },
});

export const applyPlanItemInternal = internalMutation({
  args: {
    clerkId: v.string(),
    status: v.string(),
    slug: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { clerkId, status, slug }) => {
    const user = await getUserByClerkId(ctx, clerkId);
    if (!user) return false;
    await ctx.db.patch(user._id, {
      planSlugs: applyItemToPlanSlugs(user.planSlugs ?? [], {
        status,
        plan: { slug },
      }),
    });
    return true;
  },
});

export const listClerkIdsPageInternal = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: v.object({
    clerkIds: v.array(v.string()),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor, numItems }) => {
    const page = await ctx.db.query("users").paginate({ cursor, numItems });
    return {
      clerkIds: page.page.flatMap((user) =>
        user.clerkId ? [user.clerkId] : [],
      ),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
