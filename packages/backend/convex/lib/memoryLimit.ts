import { FREE_MEMORY_LIMIT, MEMORY_LIMIT_MESSAGE } from "@vmem/shared";
import { getUserByClerkId } from "../auth";
import type { MutationCtx } from "../_generated/server";
import { userFacingError } from "./userFacingError";
import { userHasVPlan } from "./vPlan";

export { FREE_MEMORY_LIMIT };

// Call right before a true insert. Counts across all profiles of the user,
// reading at most FREE_MEMORY_LIMIT rows. V Pro skips the count.
export async function assertCanCreateMemory(
  ctx: MutationCtx,
  clerkId: string,
): Promise<void> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (userHasVPlan(user)) return;
  const rows = await ctx.db
    .query("memories")
    .withIndex("by_user_created", (q) => q.eq("userId", clerkId))
    .take(FREE_MEMORY_LIMIT);
  if (rows.length >= FREE_MEMORY_LIMIT) userFacingError(MEMORY_LIMIT_MESSAGE);
}
