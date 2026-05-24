import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

/**
 * Mark the user's cached MCP context prompt as stale after non-memory writes
 * (e.g. skills). Mirrors the debounce pattern used by memory CRUD actions.
 */
export async function scheduleContextPromptInvalidationForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!user) return;

  const shouldSchedule = await ctx.runMutation(
    internal.contextPromptCache.markPendingByClerkIdInternal,
    { clerkId: user.clerkId },
  );
  if (shouldSchedule) {
    await ctx.scheduler.runAfter(
      60_000,
      internal.contextPromptActions.regenerateIfPendingInternal,
      { clerkId: user.clerkId },
    );
  }
}
