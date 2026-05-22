/**
 * Auth helpers for the memoryApi action handlers.
 *
 * `requireClerkId` lives in `auth.ts` and is re-exported here so personal
 * and team memory handlers share one import path. `assertTeamAccess`
 * verifies membership on a team profile before team-scoped operations.
 */

import type { AuthActionCtx } from "../auth";
export type { AuthActionCtx };
export { requireClerkId } from "../auth";
import { internal } from "../_generated/api";

export async function assertTeamAccess(
  ctx: AuthActionCtx,
  profileId: string,
): Promise<void> {
  await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
    profileId,
    userId: ctx.userId,
  });
}
