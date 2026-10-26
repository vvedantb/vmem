import { FREE_MEMORY_LIMIT, MEMORY_LIMIT_MESSAGE } from "@vmem/shared";
import { getUserByClerkId } from "../auth";
import type { MutationCtx } from "../_generated/server";
import { userFacingError } from "./userFacingError";
import {
  countUserMemories,
  getUserMemoryCountRow,
  setUserMemoryCount,
} from "./userMemoryCount";
import { userHasVPlan } from "./vPlan";

export { FREE_MEMORY_LIMIT };

// Call right before a true insert. Steady state reads one `userMemoryCounts`
// row (O(1)). A missing row is filled once from a paginated recount when the
// create is allowed; at-cap misses rely on the deploy backfill (a throw would
// roll back an in-transaction counter write). V Pro skips the count.
export async function assertCanCreateMemory(
  ctx: MutationCtx,
  clerkId: string,
): Promise<void> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (userHasVPlan(user)) return;

  const existing = await getUserMemoryCountRow(ctx, clerkId);
  if (existing !== null) {
    if (existing.count >= FREE_MEMORY_LIMIT) {
      userFacingError(MEMORY_LIMIT_MESSAGE);
    }
    return;
  }

  // Backfill gap / first touch for under-cap users: recount and persist.
  const count = await countUserMemories(ctx, clerkId);
  if (count >= FREE_MEMORY_LIMIT) userFacingError(MEMORY_LIMIT_MESSAGE);
  await setUserMemoryCount(ctx, clerkId, count);
}
