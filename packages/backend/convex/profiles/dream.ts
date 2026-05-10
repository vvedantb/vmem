/**
 * Dream Mode V2 — per-profile knobs.
 *
 * `dreamModeAutoAccept` controls whether the Dreamer's high-confidence
 * synthesis proposals materialize as new memories directly (true) or
 * are queued for explicit approval on /proposals (false, default).
 * Personal profiles use the user-wide setting on
 * `userSettings.dreamModeAutoAccept` — this handler is team-only.
 *
 * `runSetLastDreamRunAtInternal` is stamped by the per-profile runner
 * after every Dream Mode pass and used by the manual "Run Dream Mode"
 * button to enforce the 1-run-per-hour rate limit.
 */

import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { auditLog, ResourceTypes } from "../auditLog";

type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };

export async function runSetDreamModeAutoAccept(
  ctx: AuthMutationCtx,
  args: { profileId: Id<"profiles">; enabled: boolean },
): Promise<Doc<"profiles"> | null> {
  const profile = await ctx.db.get(args.profileId);
  if (!profile) throw new Error("Profile not found");

  if (!profile.teamId) {
    throw new Error(
      "Personal profiles use the user-wide Dream Mode auto-accept setting",
    );
  }

  const teamId = profile.teamId;
  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_user", (q) =>
      q.eq("teamId", teamId).eq("userId", ctx.userId),
    )
    .first();
  if (!membership || membership.role !== "owner") {
    throw new Error("Only team owners can configure Dream Mode");
  }

  await ctx.db.patch(args.profileId, {
    dreamModeAutoAccept: args.enabled,
    updatedAt: Date.now(),
  });

  await auditLog.log(ctx, {
    action: "profile.dream_mode_auto_accept_toggled",
    actorId: ctx.userId,
    resourceType: ResourceTypes.PROFILE,
    resourceId: args.profileId,
    metadata: { enabled: args.enabled },
    severity: "info",
  });

  return await ctx.db.get(args.profileId);
}

export async function runSetLastDreamRunAtInternal(
  ctx: MutationCtx,
  args: { profileId: Id<"profiles">; timestamp: number },
): Promise<null> {
  const profile = await ctx.db.get(args.profileId);
  if (!profile) return null;
  await ctx.db.patch(args.profileId, { lastDreamRunAt: args.timestamp });
  return null;
}
