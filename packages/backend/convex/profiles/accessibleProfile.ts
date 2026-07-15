import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { AuthActionCtx } from "../auth";

type ProfileAccessCtx = {
  runQuery: AuthActionCtx["runQuery"];
};

export async function getAccessibleProfileForUser(
  ctx: ProfileAccessCtx,
  userId: Id<"users">,
  profileId: string,
): Promise<Doc<"profiles">> {
  return await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
    profileId,
    userId,
  });
}

export async function getAccessibleProfile(
  ctx: AuthActionCtx,
  profileId: string,
): Promise<Doc<"profiles">> {
  return await getAccessibleProfileForUser(ctx, ctx.userId, profileId);
}

export async function assertAccessibleProfileIfPresent(
  ctx: AuthActionCtx,
  profileId: string | undefined,
): Promise<void> {
  if (profileId === undefined) return;
  await getAccessibleProfile(ctx, profileId);
}

export async function resolveAccessibleTeamScope(
  ctx: AuthActionCtx,
  profileId: string | undefined,
): Promise<{
  strictProfile: boolean;
  teamId: Id<"teams"> | undefined;
}> {
  if (profileId === undefined) {
    return { strictProfile: false, teamId: undefined };
  }
  const profile = await getAccessibleProfile(ctx, profileId);
  return {
    strictProfile: profile.teamId !== undefined,
    teamId: profile.teamId,
  };
}
