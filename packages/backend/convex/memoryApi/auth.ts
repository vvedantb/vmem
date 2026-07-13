import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { AuthActionCtx } from "../auth";

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
