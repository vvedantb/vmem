import type { ActionCtx, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

type ContextPromptInvalidationCtx = Pick<
  ActionCtx,
  "runMutation" | "scheduler"
>;

/**
 * Mark the user's cached MCP context prompt as stale and schedule a
 * debounced regeneration (60s). Only the first invalidation in a burst
 * schedules the job.
 */
export async function scheduleContextPromptInvalidationByClerkId(
  ctx: ContextPromptInvalidationCtx,
  clerkId: string,
): Promise<void> {
  const shouldSchedule = await ctx.runMutation(
    internal.contextPromptCache.markPendingByClerkIdInternal,
    { clerkId },
  );
  if (shouldSchedule) {
    await ctx.scheduler.runAfter(
      60_000,
      internal.contextPromptActions.regenerateIfPendingInternal,
      { clerkId },
    );
  }
}

/**
 * Same debounce as memory CRUD, keyed by Convex user id (e.g. skills mutations).
 */
export async function scheduleContextPromptInvalidationForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!user?.clerkId) return;
  await scheduleContextPromptInvalidationByClerkId(ctx, user.clerkId);
}
