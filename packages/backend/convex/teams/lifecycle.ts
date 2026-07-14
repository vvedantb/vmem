import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { auditLog, ResourceTypes } from "../auditLog";
import {
  type AuthActionCtx,
  type AuthMutationCtx,
  getMembershipOrNull,
  getTeamMemberClerkIds,
  getTeamProfileOrNull,
  requireTeamRole,
} from "./auth";

const TEAM_PROFILE_COLOR = "#8B5CF6"; // violet — visually distinct from personal default
const TEAM_PROFILE_ICON = "briefcase";

export async function runCreate(
  ctx: AuthMutationCtx,
  args: { name: string },
): Promise<{ teamId: Id<"teams">; profileId: Id<"profiles"> }> {
  const name = args.name.trim();
  if (!name) throw new Error("Team name is required");

  const now = Date.now();
  const teamId = await ctx.db.insert("teams", {
    name,
    createdBy: ctx.userId,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("teamMembers", {
    teamId,
    userId: ctx.userId,
    role: "owner",
    joinedAt: now,
  });

  const profileId = await ctx.db.insert("profiles", {
    userId: ctx.userId,
    name,
    color: TEAM_PROFILE_COLOR,
    icon: TEAM_PROFILE_ICON,
    isDefault: false,
    teamId,
    createdAt: now,
    updatedAt: now,
  });

  await auditLog.log(ctx, {
    action: "team.created",
    actorId: ctx.userId,
    resourceType: ResourceTypes.TEAM,
    resourceId: teamId,
    metadata: { name, profileId },
    severity: "info",
  });

  return { teamId, profileId };
}

export async function runUpdateTeam(
  ctx: AuthMutationCtx,
  args: { teamId: string; name: string },
): Promise<{ updated: true }> {
  const teamId = ctx.db.normalizeId("teams", args.teamId);
  if (!teamId) throw new Error("Team not found");

  await requireTeamRole(ctx, teamId, ctx.userId, ["owner"]);
  const name = args.name.trim();
  if (!name) throw new Error("Team name is required");

  const before = await ctx.db.get(teamId);
  const now = Date.now();
  await ctx.db.patch(teamId, { name, updatedAt: now });

  const profile = await getTeamProfileOrNull(ctx, teamId);
  if (profile) {
    await ctx.db.patch(profile._id, { name, updatedAt: now });
  }

  await auditLog.logChange(ctx, {
    action: "team.renamed",
    actorId: ctx.userId,
    resourceType: ResourceTypes.TEAM,
    resourceId: teamId,
    before: { name: before?.name ?? null },
    after: { name },
    severity: "info",
  });

  return { updated: true };
}

// delete a team
export async function runDeleteTeam(
  ctx: AuthActionCtx,
  args: { teamId: string },
): Promise<{ deleted: true }> {
  const teamProfileId = await ctx.runMutation(
    internal.teams.prepareDeleteTeamInternal,
    { teamId: args.teamId, userId: ctx.userId },
  );

  const memberClerkIds = await ctx.runQuery(
    internal.teams.getTeamMemberClerkIdsInternal,
    { teamId: args.teamId },
  );
  for (const clerkId of memberClerkIds) {
    await ctx.runAction(
      internal.neo4jActions.migration.deleteMemoriesByProfile,
      { clerkId, profileId: teamProfileId },
    );
  }

  await ctx.runMutation(internal.teams.finalizeDeleteTeamInternal, {
    teamId: args.teamId,
    actorUserId: ctx.userId,
  });
  return { deleted: true };
}

export async function runPrepareDeleteTeamInternal(
  ctx: MutationCtx,
  args: { teamId: string; userId: Id<"users"> },
): Promise<Id<"profiles">> {
  const teamId = ctx.db.normalizeId("teams", args.teamId);
  if (!teamId) throw new Error("Team not found");

  const membership = await getMembershipOrNull(ctx, teamId, args.userId);
  if (!membership || membership.role !== "owner") {
    throw new Error("Owner role required");
  }
  const profile = await getTeamProfileOrNull(ctx, teamId);
  if (!profile) throw new Error("Team profile missing");
  return profile._id;
}

export async function runFinalizeDeleteTeamInternal(
  ctx: MutationCtx,
  args: { teamId: string; actorUserId: Id<"users"> },
): Promise<void> {
  const teamId = ctx.db.normalizeId("teams", args.teamId);
  if (!teamId) throw new Error("Team not found");

  const team = await ctx.db.get(teamId);
  const members = await ctx.db
    .query("teamMembers")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();

  await auditLog.log(ctx, {
    action: "team.deleted",
    actorId: args.actorUserId,
    resourceType: ResourceTypes.TEAM,
    resourceId: teamId,
    metadata: {
      name: team?.name ?? null,
      memberCount: members.length,
    },
    severity: "warning",
  });

  for (const member of members) {
    await ctx.db.delete(member._id);
  }
  const profile = await getTeamProfileOrNull(ctx, teamId);
  if (profile) {
    await ctx.db.delete(profile._id);
  }
  await ctx.db.delete(teamId);
}

export async function runGetTeamMemberClerkIdsInternal(
  ctx: QueryCtx,
  args: { teamId: string },
): Promise<string[]> {
  const teamId = ctx.db.normalizeId("teams", args.teamId);
  if (!teamId) return [];

  return getTeamMemberClerkIds(ctx, teamId);
}
