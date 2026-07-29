import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { QUIET_MS } from "./dreamTriggerDecision";

type DreamTriggerCtx = Pick<ActionCtx, "runMutation" | "scheduler">;

// debounced dream check after memory writes. skips dream mode source
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
