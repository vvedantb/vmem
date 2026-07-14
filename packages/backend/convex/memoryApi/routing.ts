import type { Doc } from "../_generated/dataModel";
import { requireClerkId, type AuthActionCtx } from "../auth";
import { getAccessibleProfile } from "./auth";

/** Team profile the caller can access, else null (personal / missing profileId). */
export async function getTeamProfileIfApplicable(
  ctx: AuthActionCtx,
  profileId: string | undefined,
): Promise<Doc<"profiles"> | null> {
  if (!profileId) return null;
  const profile = await getAccessibleProfile(ctx, profileId);
  if (profile.teamId === undefined) return null;
  return profile;
}

/**
 * Resolve clerkId + optional team profile, then dispatch.
 * Callers own team vs personal domain policy; this owns the branch.
 */
export async function routeMemoryByProfile<T>(
  ctx: AuthActionCtx,
  profileId: string | undefined,
  handlers: {
    team: (teamProfile: Doc<"profiles">) => Promise<T>;
    personal: (clerkId: string) => Promise<T>;
  },
): Promise<T> {
  const clerkId = await requireClerkId(ctx);
  const teamProfile = await getTeamProfileIfApplicable(ctx, profileId);
  if (teamProfile) {
    return handlers.team(teamProfile);
  }
  return handlers.personal(clerkId);
}
