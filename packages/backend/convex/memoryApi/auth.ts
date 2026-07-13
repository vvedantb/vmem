/**
 * Auth helpers for the memoryApi action handlers.
 *
 * `requireClerkId` is re-exported so personal and team handlers share one
 * import path. `getAccessibleProfile` / `assertTeamAccess` verify the
 * caller can use a profile before scoped operations.
 */

import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { AuthActionCtx } from "../auth";

export type { AuthActionCtx };
export { requireClerkId } from "../auth";

/** Assert access to a profile and return it (for team vs personal branching). */
export async function getAccessibleProfile(
  ctx: AuthActionCtx,
  profileId: string,
): Promise<Doc<"profiles">> {
  return await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
    profileId,
    userId: ctx.userId,
  });
}

export async function assertTeamAccess(
  ctx: AuthActionCtx,
  profileId: string,
): Promise<void> {
  await getAccessibleProfile(ctx, profileId);
}
