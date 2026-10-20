import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { AuthActionCtx } from "../auth";
import { auditLog, ResourceTypes } from "../auditLog";

interface RemoveArgs {
  profileId: Id<"profiles">;
  // when set, move memories here before deletion
  moveMemoriesToProfileId?: Id<"profiles">;
}

// Every check runs before any memory is moved or deleted: the memory
// mutations below do not check the user.
export async function runRemoveWithMemories(
  ctx: AuthActionCtx,
  args: RemoveArgs,
): Promise<{ deleted: true }> {
  const profile = await ctx.runQuery(internal.profiles.getByIdInternal, {
    profileId: args.profileId,
  });
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
    if (args.moveMemoriesToProfileId === args.profileId) {
      throw new Error("Choose a different profile to move memories to");
    }
    const target = await ctx.runQuery(internal.profiles.getByIdInternal, {
      profileId: args.moveMemoriesToProfileId,
    });
    if (!target || target.userId !== ctx.userId || target.teamId) {
      throw new Error("Target profile not found");
    }
  }

  if (args.moveMemoriesToProfileId) {
    await ctx.runMutation(
      internal.memoryStore.functions.reassignMemoriesProfileInternal,
      {
        fromProfileId: args.profileId,
        toProfileId: args.moveMemoriesToProfileId,
      },
    );
  } else {
    await ctx.runMutation(
      internal.memoryStore.functions.deleteMemoriesByProfileInternal,
      { profileId: args.profileId },
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
  if (!profile || profile.userId !== args.actorUserId) {
    throw new Error("Profile not found");
  }

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

// clear source defaults, delete the row, and write the audit entry
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
