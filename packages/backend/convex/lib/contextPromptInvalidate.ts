import type { ActionCtx, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

type ContextPromptInvalidationCtx = Pick<
  ActionCtx,
  "runMutation" | "scheduler"
>;

// debounced mcp context prompt invalidation (60s)
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

export async function scheduleContextPromptInvalidationForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!user?.clerkId) return;
  await scheduleContextPromptInvalidationByClerkId(ctx, user.clerkId);
}
