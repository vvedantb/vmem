/**
 * Read-only public query bodies for `teams.ts`.
 *
 *  - `runList` — every team the caller belongs to, with the team's
 *     profile and a member count for the cards view.
 *  - `runGet` — a single team plus the caller's role, the team profile,
 *     and the full member list. Accepts `teamId` as a string and
 *     normalizes it server-side so router params don't need branding.
 */

import type { Doc, Id } from "../_generated/dataModel";
import {
  type AuthQueryCtx,
  getMembershipOrNull,
  getTeamProfileOrNull,
} from "./auth";

interface TeamListEntry {
  team: Doc<"teams">;
  role: "owner" | "member";
  profile: Doc<"profiles"> | null;
  memberCount: number;
}

export async function runList(ctx: AuthQueryCtx): Promise<TeamListEntry[]> {
  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
    .collect();

  const results: TeamListEntry[] = [];
  for (const membership of memberships) {
    const team = await ctx.db.get(membership.teamId);
    if (!team) continue;

    const profile = await getTeamProfileOrNull(ctx, team._id);
    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();

    results.push({
      team,
      role: membership.role,
      profile,
      memberCount: members.length,
    });
  }
  return results;
}

interface TeamMemberView {
  userId: Id<"users">;
  role: "owner" | "member";
  joinedAt: number;
  email: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface TeamGetResult {
  team: Doc<"teams">;
  role: "owner" | "member";
  profile: Doc<"profiles"> | null;
  members: TeamMemberView[];
}

export async function runGet(
  ctx: AuthQueryCtx,
  args: { teamId: string },
): Promise<TeamGetResult | null> {
  const teamId = ctx.db.normalizeId("teams", args.teamId);
  if (!teamId) return null;

  const membership = await getMembershipOrNull(ctx, teamId, ctx.userId);
  if (!membership) return null;

  const team = await ctx.db.get(teamId);
  if (!team) return null;

  const profile = await getTeamProfileOrNull(ctx, team._id);
  const memberRows = await ctx.db
    .query("teamMembers")
    .withIndex("by_team", (q) => q.eq("teamId", team._id))
    .collect();

  const members: TeamMemberView[] = [];
  for (const row of memberRows) {
    const user = await ctx.db.get(row.userId);
    members.push({
      userId: row.userId,
      role: row.role,
      joinedAt: row.joinedAt,
      email: user?.email ?? null,
      fullName: user?.fullName ?? null,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
    });
  }

  return {
    team,
    role: membership.role,
    profile,
    members,
  };
}
