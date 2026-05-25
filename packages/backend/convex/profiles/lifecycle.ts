/**
 * Profile-deletion bodies. Two paths:
 *
 *   - `runRemove` (mutation) — the synchronous DB-only delete called
 *     from contexts that have already cleaned up the Neo4j side, plus
 *     the bookkeeping for clearing source-default profile pointers.
 *   - `runRemoveWithMemories` (action) — the orchestrating
 *     entry point used by the dashboard. Cleans Neo4j first, then
 *     calls the internal mutation to drop the DB row.
 *
 * `runRemoveInternalMutation` is the server-only twin of `runRemove`
 * called by the action — same DB cleanup, but the actor id is supplied
 * explicitly so the audit row attributes correctly.
 */

import type { ActionCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { auditLog, ResourceTypes } from "../auditLog";

type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };
type AuthActionCtx = ActionCtx & { userId: Id<"users"> };

interface RemoveArgs {
  profileId: Id<"profiles">;
  /** When set, the action moves Neo4j memories to this profile before deletion. */
  moveMemoriesToProfileId?: Id<"profiles">;
}

interface RemoveResult {
  deleted: boolean;
  profileId: Id<"profiles">;
  moveMemoriesToProfileId: Id<"profiles"> | null;
}

export async function runRemove(
  ctx: AuthMutationCtx,
  args: RemoveArgs,
): Promise<RemoveResult> {
  const profile = await ctx.db.get(args.profileId);
  if (!profile || profile.userId !== ctx.userId) {
    throw new Error("Profile not found");
  }

  if (profile.teamId) {
    throw new Error("Use teams.deleteTeam to remove a team profile");
  }

  if (profile.isDefault) {
    throw new Error("Cannot delete the default profile");
  }

  if (args.moveMemoriesToProfileId) {
    const targetProfile = await ctx.db.get(args.moveMemoriesToProfileId);
    if (!targetProfile || targetProfile.userId !== ctx.userId) {
      throw new Error("Target profile not found");
    }
  }

  await clearSourceDefaultsForDeletedProfile(ctx, ctx.userId, args.profileId);
  await ctx.db.delete(args.profileId);

  await auditLog.log(ctx, {
    action: "profile.deleted",
    actorId: ctx.userId,
    resourceType: ResourceTypes.PROFILE,
    resourceId: args.profileId,
    metadata: {
      name: profile.name,
      movedMemoriesTo: args.moveMemoriesToProfileId ?? null,
    },
    severity: "warning",
  });

  return {
    deleted: true,
    profileId: args.profileId,
    moveMemoriesToProfileId: args.moveMemoriesToProfileId ?? null,
  };
}

/**
 * Public action — orchestrates Neo4j cleanup + DB delete. The Convex
 * runtime separates the two because mutation contexts can't fetch from
 * Neo4j; the action drives both phases.
 */
export async function runRemoveWithMemories(
  ctx: AuthActionCtx,
  args: RemoveArgs,
): Promise<{ deleted: true }> {
  const profile = await ctx.runQuery(internal.profiles.getByIdInternal, {
    profileId: args.profileId,
  });
  if (profile?.teamId) {
    throw new Error("Use teams.deleteTeam to remove a team profile");
  }

  const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
    userId: ctx.userId,
  });
  if (!clerkId) throw new Error("User not found");

  if (args.moveMemoriesToProfileId) {
    await ctx.runAction(
      internal.neo4jActions.migration.moveMemoriesBetweenProfiles,
      {
        clerkId,
        fromProfileId: args.profileId,
        toProfileId: args.moveMemoriesToProfileId,
      },
    );
  } else {
    await ctx.runAction(
      internal.neo4jActions.migration.deleteMemoriesByProfile,
      { clerkId, profileId: args.profileId },
    );
  }

  await ctx.runMutation(internal.profiles.removeInternalMutation, {
    profileId: args.profileId,
    actorUserId: ctx.userId,
    movedMemoriesToProfileId: args.moveMemoriesToProfileId,
  });

  return { deleted: true };
}

interface RemoveInternalArgs {
  profileId: Id<"profiles">;
  actorUserId: Id<"users">;
  movedMemoriesToProfileId?: Id<"profiles">;
}

export async function runRemoveInternalMutation(
  ctx: MutationCtx,
  args: RemoveInternalArgs,
): Promise<{ deleted: true }> {
  const profile = await ctx.db.get(args.profileId);
  if (!profile) throw new Error("Profile not found");

  if (profile.isDefault) {
    throw new Error("Cannot delete the default profile");
  }

  await clearSourceDefaultsForDeletedProfile(
    ctx,
    profile.userId,
    args.profileId,
  );
  await ctx.db.delete(args.profileId);

  await auditLog.log(ctx, {
    action: "profile.deleted",
    actorId: args.actorUserId,
    resourceType: ResourceTypes.PROFILE,
    resourceId: args.profileId,
    metadata: {
      name: profile.name,
      movedMemoriesTo: args.movedMemoriesToProfileId ?? null,
    },
    severity: "warning",
  });

  return { deleted: true };
}

/**
 * If the soon-to-be-deleted profile is currently set as the default for
 * any client surface (web, browser extension), drop the pointer so the
 * UI falls back to "no default" instead of dangling at a tombstone id.
 */
async function clearSourceDefaultsForDeletedProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  deletedProfileId: Id<"profiles">,
): Promise<void> {
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!settings?.defaultProfiles) return;

  const currentDefaults = settings.defaultProfiles;
  const updatedDefaults: {
    web?: Id<"profiles">;
    extension?: Id<"profiles">;
    mcp?: Id<"profiles">;
    mcpTeam?: Id<"profiles">;
  } = {};

  if (currentDefaults.web && currentDefaults.web !== deletedProfileId) {
    updatedDefaults.web = currentDefaults.web;
  }
  if (
    currentDefaults.extension &&
    currentDefaults.extension !== deletedProfileId
  ) {
    updatedDefaults.extension = currentDefaults.extension;
  }
  if (currentDefaults.mcp && currentDefaults.mcp !== deletedProfileId) {
    updatedDefaults.mcp = currentDefaults.mcp;
  }
  if (currentDefaults.mcpTeam && currentDefaults.mcpTeam !== deletedProfileId) {
    updatedDefaults.mcpTeam = currentDefaults.mcpTeam;
  }

  const webChanged = currentDefaults.web === deletedProfileId;
  const extensionChanged = currentDefaults.extension === deletedProfileId;
  const mcpChanged = currentDefaults.mcp === deletedProfileId;
  const mcpTeamChanged = currentDefaults.mcpTeam === deletedProfileId;
  if (webChanged || extensionChanged || mcpChanged || mcpTeamChanged) {
    await ctx.db.patch(settings._id, { defaultProfiles: updatedDefaults });
  }
}
