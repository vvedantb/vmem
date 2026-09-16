import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { auditLog, ResourceTypes } from "../auditLog";
import { userFacingError } from "../lib/userFacingError";
import { normalizeAccountEmail } from "../lib/accountEmail";
import {
  type AuthMutationCtx,
  getMembershipOrNull,
  requireTeamRole,
} from "./auth";

async function countTeamOwners(
  ctx: MutationCtx,
  teamId: Id<"teams">,
): Promise<number> {
  const members = await ctx.db
    .query("teamMembers")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();
  return members.filter((m) => m.role === "owner").length;
}

export async function runAddMember(
  ctx: AuthMutationCtx,
  args: { teamId: string; email: string },
): Promise<{ added: true; userId: Id<"users"> }> {
  const teamId = ctx.db.normalizeId("teams", args.teamId);
  if (!teamId) userFacingError("Team not found");

  await requireTeamRole(ctx, teamId, ctx.userId, ["owner"]);

  const email = normalizeAccountEmail(args.email);
  if (!email) userFacingError("Email is required");

  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (!user) {
    userFacingError("No vmem account for that email");
  }

  const existing = await getMembershipOrNull(ctx, teamId, user._id);
  if (existing) {
    userFacingError("User is already a member of this team");
  }

  await ctx.db.insert("teamMembers", {
    teamId,
    userId: user._id,
    role: "member",
    joinedAt: Date.now(),
  });

  await auditLog.log(ctx, {
    action: "team.member_added",
    actorId: ctx.userId,
    resourceType: ResourceTypes.TEAM_MEMBER,
    resourceId: `${teamId}:${user._id}`,
    metadata: { teamId, memberUserId: user._id, role: "member" },
    severity: "info",
  });

  return { added: true, userId: user._id };
}

export async function runRemoveMember(
  ctx: AuthMutationCtx,
  args: { teamId: string; userId: string },
): Promise<{ removed: true }> {
  const teamId = ctx.db.normalizeId("teams", args.teamId);
  if (!teamId) userFacingError("Team not found");

  const targetUserId = ctx.db.normalizeId("users", args.userId);
  if (!targetUserId) userFacingError("User not found");

  await requireTeamRole(ctx, teamId, ctx.userId, ["owner"]);

  const target = await getMembershipOrNull(ctx, teamId, targetUserId);
  if (!target) userFacingError("User is not a member");

  if (target.role === "owner" && (await countTeamOwners(ctx, teamId)) <= 1) {
    userFacingError("Cannot remove the last owner");
  }

  await ctx.db.delete(target._id);

  await auditLog.log(ctx, {
    action: "team.member_removed",
    actorId: ctx.userId,
    resourceType: ResourceTypes.TEAM_MEMBER,
    resourceId: `${teamId}:${targetUserId}`,
    metadata: { teamId, memberUserId: targetUserId, role: target.role },
    severity: "warning",
  });

  return { removed: true };
}

export async function runLeaveTeam(
  ctx: AuthMutationCtx,
  args: { teamId: string },
): Promise<{ left: true }> {
  const teamId = ctx.db.normalizeId("teams", args.teamId);
  if (!teamId) userFacingError("Team not found");

  const membership = await getMembershipOrNull(ctx, teamId, ctx.userId);
  if (!membership) userFacingError("Not a member of this team");

  if (
    membership.role === "owner" &&
    (await countTeamOwners(ctx, teamId)) <= 1
  ) {
    userFacingError(
      "You are the last owner. Transfer ownership before leaving.",
    );
  }

  await ctx.db.delete(membership._id);

  await auditLog.log(ctx, {
    action: "team.member_left",
    actorId: ctx.userId,
    resourceType: ResourceTypes.TEAM_MEMBER,
    resourceId: `${teamId}:${ctx.userId}`,
    metadata: { teamId, role: membership.role },
    severity: "info",
  });

  return { left: true };
}
