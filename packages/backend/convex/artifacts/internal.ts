import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { purgeDeletedArtifactsBatch } from "./store";

// trash purge on its own; the hourly mcpTraces.purgeExpired sweep runs the
// same batch step. Reschedules itself while work is left.
export const purgeDeletedInternal = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const more = await purgeDeletedArtifactsBatch(ctx, Date.now());
    if (more) {
      await ctx.scheduler.runAfter(
        0,
        internal.artifacts.internal.purgeDeletedInternal,
        {},
      );
    }
    return more;
  },
});
