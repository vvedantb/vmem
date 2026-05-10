/**
 * Auth helpers for the memoryApi action handlers. Centralises the two
 * patterns repeated across every entry point:
 *
 *   1. `requireClerkId(ctx)` — fetch the Clerk subject id for the
 *      current Convex user and throw "User not found" if it's missing.
 *      Called from every personal-scoped action (9 sites pre-split).
 *
 *   2. `assertTeamAccess(ctx, profileId)` — verify membership on a team
 *      profile. No-op for the personal-profile happy path because the
 *      underlying Cypher is already userId-scoped; only invoked when a
 *      profileId is provided.
 *
 * Helpers accept an `AuthActionCtx` so the same pair works for both
 * personal and team handler bodies.
 */

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

export type AuthActionCtx = ActionCtx & { userId: Id<"users"> };

export async function requireClerkId(ctx: AuthActionCtx): Promise<string> {
  const clerkId: string | null = await ctx.runQuery(
    internal.auth.getClerkIdInternal,
    { userId: ctx.userId },
  );
  if (!clerkId) throw new Error("User not found");
  return clerkId;
}

export async function assertTeamAccess(
  ctx: AuthActionCtx,
  profileId: string,
): Promise<void> {
  await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
    profileId,
    userId: ctx.userId,
  });
}
