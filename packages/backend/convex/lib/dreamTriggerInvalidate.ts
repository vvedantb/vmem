import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { QUIET_MS } from "./dreamTriggerDecision";

type DreamTriggerCtx = Pick<ActionCtx, "runMutation" | "scheduler">;

/**
 * Record a memory write for Dynamic Dreaming and, on the first
 * qualifying write of a burst, schedule the debounced dream check one
 * quiet-window out. Mirrors `contextPromptInvalidate.ts`: only the write
 * that flips `checkPending` schedules a job; the check itself
 * reschedules while the user keeps writing.
 *
 * Callers must skip memories with `source === "dream-mode"` — dream
 * output re-triggering dreaming would loop.
 */
export async function scheduleDreamTriggerCheck(
  ctx: DreamTriggerCtx,
  clerkId: string,
  count = 1,
): Promise<void> {
  const shouldSchedule = await ctx.runMutation(
    internal.dreamTrigger.bumpActivityByClerkIdInternal,
    { clerkId, count },
  );
  if (shouldSchedule) {
    await ctx.scheduler.runAfter(
      QUIET_MS,
      internal.neo4jActions.dreamMode.maybeRunDreamInternal,
      { clerkId },
    );
  }
}
