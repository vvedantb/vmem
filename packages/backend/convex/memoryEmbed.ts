import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { bestEffortEmbedOne } from "./lib/openRouter/bestEffortEmbed";

export const embedMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    profileId: v.optional(v.string()),
    text: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const embedding = await bestEffortEmbedOne({
      ctx,
      clerkId: args.clerkId,
      profileId: args.profileId,
      feature: "mcp-embed",
      failureLog: "[memoryEmbed] embedding failed",
      text: args.text,
    });
    if (!embedding) return false;
    return await ctx.runMutation(
      internal.memoryStore.functions.patchMemoryEmbeddingInternal,
      { memoryId: args.memoryId, embedding },
    );
  },
});
