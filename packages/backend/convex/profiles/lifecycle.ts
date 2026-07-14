import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { AuthActionCtx } from "../auth";
import { auditLog, ResourceTypes } from "../auditLog";

interface RemoveArgs {
  profileId: Id<"profiles">;
  /** When set, move Neo4j memories here before deletion. */
  moveMemoriesToProfileId?: Id<"profiles">;
}

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

  await deleteProfileRow(
    ctx,
    profile,
    args.actorUserId,
    args.movedMemoriesToProfileId ?? null,
  );

  return { deleted: true };
}

/** Clear source defaults, delete the row, and write the audit entry. */
async function deleteProfileRow(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  actorUserId: Id<"users">,
  movedMemoriesTo: Id<"profiles"> | null,
): Promise<void> {
  await clearSourceDefaultsForDeletedProfile(ctx, profile.userId, profile._id);
  await ctx.db.delete(profile._id);

  await auditLog.log(ctx, {
    action: "profile.deleted",
    actorId: actorUserId,
    resourceType: ResourceTypes.PROFILE,
    resourceId: profile._id,
    metadata: {
      name: profile.name,
      movedMemoriesTo,
    },
    severity: "warning",
  });
}

type DefaultProfileKeys = "web" | "extension" | "mcp" | "mcpTeam";

const DEFAULT_PROFILE_KEYS: readonly DefaultProfileKeys[] = [
  "web",
  "extension",
  "mcp",
  "mcpTeam",
];

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

  const current = settings.defaultProfiles;
  const updated: Partial<Record<DefaultProfileKeys, Id<"profiles">>> = {};
  let changed = false;

  for (const key of DEFAULT_PROFILE_KEYS) {
    const value = current[key];
    if (value === undefined) continue;
    if (value === deletedProfileId) {
      changed = true;
      continue;
    }
    updated[key] = value;
  }

  if (!changed) return;
  await ctx.db.patch(settings._id, { defaultProfiles: updated });
}
