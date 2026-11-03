import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { vPro } from "./vPro";

// The one writer for users.planSlugs, called by the Clerk Billing webhook and
// backfill. `replace` overwrites the set; `item` merges one item into it. A
// missing user row is a no-op (returns false): the next event or a backfill
// run fills the slugs in.
export const applyBillingChangeInternal = internalMutation({
  args: {
    change: v.union(
      v.object({
        kind: v.literal("replace"),
        clerkId: v.string(),
        planSlugs: v.array(v.string()),
      }),
      v.object({
        kind: v.literal("item"),
        clerkId: v.string(),
        status: v.string(),
        slug: v.string(),
      }),
    ),
  },
  returns: v.boolean(),
  handler: (ctx, { change }) => vPro.writeBillingChange(ctx, change),
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
