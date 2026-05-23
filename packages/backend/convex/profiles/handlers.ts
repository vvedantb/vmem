/**
 * Public CRUD bodies for `profiles.ts`. Each `runFoo` is the body of a
 * matching `authQuery`/`authMutation` declared in the barrel. Returns
 * documents directly from `ctx.db`; no Neo4j round-trips.
 */

import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { auditLog, ResourceTypes } from "../auditLog";
import { getOrCreateDefaultProfile } from "./helpers";

type AuthQueryCtx = QueryCtx & { userId: Id<"users"> };
type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };

/**
 * List profiles visible to the caller:
 *  - personal profiles they own (`teamId` undefined)
 *  - team profiles for every team they're a member of
 *
 * Personal profiles owned by other users that happen to be shared via
 * team membership are NOT included — team access only flows through the
 * single team profile.
 */
export async function runList(ctx: AuthQueryCtx): Promise<Doc<"profiles">[]> {
  const personal = (
    await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect()
  ).filter((p) => p.teamId === undefined);

  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
    .collect();
  const teamProfiles: Doc<"profiles">[] = [];
  for (const m of memberships) {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_team", (q) => q.eq("teamId", m.teamId))
      .first();
    if (profile) teamProfiles.push(profile);
  }

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

  const teamId = profile.teamId;
  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_user", (q) =>
      q.eq("teamId", teamId).eq("userId", ctx.userId),
    )
    .first();
  return membership ? profile : null;
}

export async function runGetOrCreateDefault(
  ctx: AuthMutationCtx,
): Promise<Doc<"profiles">> {
  return await getOrCreateDefaultProfile(ctx, ctx.userId);
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

  return await ctx.db.get(profileId);
}

interface UpdateArgs {
  profileId: Id<"profiles">;
  name?: string;
  color?: string;
  icon?: string;
}

/**
 * Update a profile. Personal profiles: owner only. Team profiles: only
 * an owner of the team can edit; renaming the team profile syncs the
 * team's name so they stay in lockstep.
 */
export async function runUpdate(
  ctx: AuthMutationCtx,
  args: UpdateArgs,
): Promise<Doc<"profiles"> | null> {
  const profile = await ctx.db.get(args.profileId);
  if (!profile) throw new Error("Profile not found");

  if (profile.teamId) {
    const teamId = profile.teamId;
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", ctx.userId),
      )
      .first();
    if (!membership || membership.role !== "owner") {
      throw new Error("Only team owners can edit a team profile");
    }
  } else if (profile.userId !== ctx.userId) {
    throw new Error("Profile not found");
  }

  // Per-user name uniqueness applies only to personal profiles. Team
  // profiles intentionally don't compete with personal ones for names
  // since they belong to the team, not a single user.
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

  return await ctx.db.get(args.profileId);
}
