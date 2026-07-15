import type { Doc } from "../_generated/dataModel";
import type { AuthActionCtx } from "../auth";
import { getAccessibleProfile as getAccessibleProfileShared } from "../profiles/accessibleProfile";

export async function getAccessibleProfile(
  ctx: AuthActionCtx,
  profileId: string,
): Promise<Doc<"profiles">> {
  return await getAccessibleProfileShared(ctx, profileId);
}

export async function assertTeamAccess(
  ctx: AuthActionCtx,
  profileId: string,
): Promise<void> {
  await getAccessibleProfile(ctx, profileId);
}
