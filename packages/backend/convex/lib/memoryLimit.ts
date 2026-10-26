import { FREE_MEMORY_LIMIT, MEMORY_LIMIT_MESSAGE } from "@vmem/shared";
import { getUserByClerkId } from "../auth";
import type { MutationCtx } from "../_generated/server";
import { userFacingError } from "./userFacingError";
import { getUserMemoryCountRow } from "./userMemoryCount";
import { userHasVPlan } from "./vPlan";

export { FREE_MEMORY_LIMIT };

// Call right before a true insert. Counts across all profiles of the user
// with one `userMemoryCounts` row (missing row = 0). V Pro skips the count.
export async function assertCanCreateMemory(
  ctx: MutationCtx,
  clerkId: string,
): Promise<void> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (userHasVPlan(user)) return;
  const row = await getUserMemoryCountRow(ctx, clerkId);
  if ((row?.count ?? 0) >= FREE_MEMORY_LIMIT) {
    userFacingError(MEMORY_LIMIT_MESSAGE);
  }
}
