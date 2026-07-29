import type { Doc } from "../_generated/dataModel";
import { requireClerkId, type AuthActionCtx } from "../auth";
import { getAccessibleProfile } from "../profiles/accessibleProfile";

// team profile the caller can access, else null (personal / missing profileId)
export async function getTeamProfileIfApplicable(
  ctx: AuthActionCtx,
  profileId: string | undefined,
): Promise<Doc<"profiles"> | null> {
  if (!profileId) return null;
  const profile = await getAccessibleProfile(ctx, profileId);
  if (profile.teamId === undefined) return null;
  return profile;
}

// resolve clerkId + optional team profile, then dispatch
export async function routeMemoryByProfile<T>(
  ctx: AuthActionCtx,
  profileId: string | undefined,
  handlers: {
    // clerkId is the calling member, for attribution rather than scoping
    team: (teamProfile: Doc<"profiles">, clerkId: string) => Promise<T>;
    personal: (clerkId: string) => Promise<T>;
  },
): Promise<T> {
  const clerkId = await requireClerkId(ctx);
  const teamProfile = await getTeamProfileIfApplicable(ctx, profileId);
  if (teamProfile) {
    return handlers.team(teamProfile, clerkId);
  }
  return handlers.personal(clerkId);
}
