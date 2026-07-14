import type { Doc, Id } from "../_generated/dataModel";
import { auditLog, ResourceTypes } from "../auditLog";
import {
  getMembershipOrNull,
  type AuthMutationCtx,
  type AuthQueryCtx,
} from "../teams/auth";
import { getOrCreateDefaultProfile } from "./helpers";
import { listPersonalProfiles, listTeamProfiles } from "./mcpAccess";

export async function runList(ctx: AuthQueryCtx): Promise<Doc<"profiles">[]> {
  const [personal, teamProfiles] = await Promise.all([
    listPersonalProfiles(ctx, ctx.userId),
    listTeamProfiles(ctx, ctx.userId),
  ]);
  return [...personal, ...teamProfiles];
}

export async function runGet(
  ctx: AuthQueryCtx,
  args: { profileId: Id<"profiles"> },
): Promise<Doc<"profiles"> | null> {
  const profile = await ctx.db.get(args.profileId);
  if (!profile) return null;

  if (!profile.teamId) {
    return profile.userId === ctx.userId ? profile : null;
  }

  const membership = await getMembershipOrNull(ctx, profile.teamId, ctx.userId);
  return membership ? profile : null;
}

export async function runGetOrCreateDefault(
  ctx: AuthMutationCtx,
): Promise<Doc<"profiles">> {
  return getOrCreateDefaultProfile(ctx, ctx.userId);
}

export async function runCreate(
  ctx: AuthMutationCtx,
  args: { name: string; color: string; icon: string },
): Promise<Doc<"profiles"> | null> {
  const existing = await ctx.db
    .query("profiles")
    .withIndex("by_user_name", (q) =>
      q.eq("userId", ctx.userId).eq("name", args.name),
    )
    .first();

  if (existing) {
    throw new Error(`Profile "${args.name}" already exists`);
  }

  const now = Date.now();
  const profileId = await ctx.db.insert("profiles", {
    userId: ctx.userId,
    name: args.name,
    color: args.color,
    icon: args.icon,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  });

  await auditLog.log(ctx, {
    action: "profile.created",
    actorId: ctx.userId,
    resourceType: ResourceTypes.PROFILE,
    resourceId: profileId,
    metadata: { name: args.name, color: args.color, icon: args.icon },
    severity: "info",
  });

  return ctx.db.get(profileId);
}

interface UpdateArgs {
  profileId: Id<"profiles">;
  name?: string;
  color?: string;
  icon?: string;
}

export async function runUpdate(
  ctx: AuthMutationCtx,
  args: UpdateArgs,
): Promise<Doc<"profiles"> | null> {
  const profile = await ctx.db.get(args.profileId);
  if (!profile) throw new Error("Profile not found");

  if (profile.teamId) {
    const membership = await getMembershipOrNull(
      ctx,
      profile.teamId,
      ctx.userId,
    );
    if (!membership || membership.role !== "owner") {
      throw new Error("Only team owners can edit a team profile");
    }
  } else if (profile.userId !== ctx.userId) {
    throw new Error("Profile not found");
  }

  // Personal profiles: unique name per user. Team profiles share the team namespace.
  if (
    !profile.teamId &&
    args.name !== undefined &&
    args.name !== profile.name
  ) {
    const newName = args.name;
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", ctx.userId).eq("name", newName),
      )
      .first();

    if (existing) {
      throw new Error(`Profile "${newName}" already exists`);
    }
  }

  const now = Date.now();
  const updates: Partial<Doc<"profiles">> = { updatedAt: now };
  if (args.name !== undefined) updates.name = args.name;
  if (args.color !== undefined) updates.color = args.color;
  if (args.icon !== undefined) updates.icon = args.icon;

  await ctx.db.patch(args.profileId, updates);

  if (profile.teamId && args.name !== undefined) {
    await ctx.db.patch(profile.teamId, { name: args.name, updatedAt: now });
  }

  await auditLog.logChange(ctx, {
    action: "profile.updated",
    actorId: ctx.userId,
    resourceType: ResourceTypes.PROFILE,
    resourceId: args.profileId,
    before: { name: profile.name, color: profile.color, icon: profile.icon },
    after: {
      name: args.name ?? profile.name,
      color: args.color ?? profile.color,
      icon: args.icon ?? profile.icon,
    },
    severity: "info",
  });

  return ctx.db.get(args.profileId);
}
