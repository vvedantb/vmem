import type { ActionCtx } from "../_generated/server";

type DreamTriggerCtx = Pick<ActionCtx, "runMutation" | "scheduler">;

export async function scheduleDreamTriggerCheck(
  _ctx: DreamTriggerCtx,
  _clerkId: string,
  _count = 1,
): Promise<void> {
  // Dream Mode is not backed by Convex memories; skip scheduling.
}
