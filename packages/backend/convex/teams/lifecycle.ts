/**
 * Lifecycle bodies for `teams.ts` — create / rename / delete plus the
 * deleteTeam internals.
 *
 * `runDeleteTeam` is a public action that drives the two-phase delete:
 * phase 1 verifies ownership and looks up the team profile id (mutation
 * for txn safety), phase 2 purges Neo4j memories per-creator, phase 3
 * finalizes the DB cleanup. Splitting around the action lets the Neo4j
 * round-trip happen between two mutation phases.
 */

import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { auditLog, ResourceTypes } from "../auditLog";
import {
  getMembershipOrNull,
  getTeamMemberClerkIds,
  requireTeamRole,
} from "./auth";

type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };
type AuthActionCtx = ActionCtx & { userId: Id<"users"> };

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

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .first();
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

/**
 * Delete a team. Two-phase so Neo4j can be purged between DB-bound
 * phases — actions can't use `ctx.db` directly.
 *
 *   1. `prepareDeleteTeamInternal` — verify ownership, return profile id.
 *   2. `getTeamMemberClerkIdsInternal` + `deleteMemoriesByProfile` per
 *      creator — team memories may belong to many creators.
 *   3. `finalizeDeleteTeamInternal` — drop memberships, profile, and
 *      team rows. Audits before deletion to keep the team name available.
 */
export async function runDeleteTeam(
  ctx: AuthActionCtx,
  args: { teamId: string },
): Promise<{ deleted: true }> {
  const teamProfileId: Id<"profiles"> = await ctx.runMutation(
    internal.teams.prepareDeleteTeamInternal,
    { teamId: args.teamId, userId: ctx.userId },
  );

  const memberClerkIds: string[] = await ctx.runQuery(
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
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .first();
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

  for (const m of members) {
    await ctx.db.delete(m._id);
  }
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .first();
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
