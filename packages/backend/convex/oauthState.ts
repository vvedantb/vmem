import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { oauthStateFields, oauthStatePayloadFields } from "./validators";

export const insertOAuthStateInternal = internalMutation({
  args: oauthStateFields,
  handler: async (ctx, args) => {
    return await ctx.db.insert("oauthStates", args);
  },
});

// atomically consumes an OAuth state entry (read + delete)
export const consumeOAuthStateInternal = internalMutation({
  args: { state: v.string() },
  returns: v.union(v.object(oauthStatePayloadFields), v.null()),
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (!entry) return null;

    await ctx.db.delete(entry._id);
    return {
      userId: entry.userId,
      returnUrl: entry.returnUrl,
      expiresAt: entry.expiresAt,
      connectorId: entry.connectorId,
      provider: entry.provider,
    };
  },
});
