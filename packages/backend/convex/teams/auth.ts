/**
 * Auth helpers and internal authorization queries for `teams.ts`.
 *
 * Module-private:
 *   - `getMembershipOrNull` / `requireTeamRole` — DB lookups used by
 *     every mutation in `teams.ts` to gate access by role.
 *
 * Cross-module (called via `internal.teams.*` from memoryApi,
 * fileImport, etc.):
 *   - `runAssertProfileAccessInternal` — caller is owner of personal
 *     profile or member of team profile.
 *   - `runAssertMemoryMutablePermissionInternal` — caller is the
 *     memory's creator or a team owner.
 *   - `runResolveMemoryScopeInternal` — returns the Neo4j scope
 *     (`{ kind: "personal", clerkId }` or
 *     `{ kind: "team", allowedClerkIds, profileId, teamId }`).
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function getMembershipOrNull(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
  userId: Id<"users">,
): Promise<Doc<"teamMembers"> | null> {
  return await ctx.db
    .query("teamMembers")
    .withIndex("by_team_user", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .first();
}

export async function requireTeamRole(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  userId: Id<"users">,
  allowed: Array<"owner" | "member">,
): Promise<Doc<"teamMembers">> {
  const membership = await getMembershipOrNull(ctx, teamId, userId);
  if (!membership) throw new Error("Not a member of this team");
  if (!allowed.includes(membership.role)) {
    throw new Error(`Requires role: ${allowed.join(" or ")}`);
  }
  return membership;
}

interface AssertProfileAccessArgs {
  profileId: string;
  userId: Id<"users">;
}

export async function runAssertProfileAccessInternal(
  ctx: QueryCtx,
  args: AssertProfileAccessArgs,
): Promise<Doc<"profiles">> {
  const profileId = ctx.db.normalizeId("profiles", args.profileId);
  if (!profileId) throw new Error("Profile not found");

  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Profile not found");
  if (profile.teamId) {
    const teamId = profile.teamId;
    const membership = await getMembershipOrNull(ctx, teamId, args.userId);
    if (!membership) throw new Error("Not a member of this team");
  } else if (profile.userId !== args.userId) {
    throw new Error("Profile not accessible");
  }
  return profile;
}

interface ResolveMemoryScopeArgs {
  userId: Id<"users">;
  profileId?: Id<"profiles">;
}

type MemoryScope =
  | { kind: "personal"; clerkId: string }
  | {
      kind: "team";
      allowedClerkIds: string[];
      profileId: Id<"profiles">;
      teamId: Id<"teams">;
    };

export async function runResolveMemoryScopeInternal(
  ctx: QueryCtx,
  args: ResolveMemoryScopeArgs,
): Promise<MemoryScope> {
  const user = await ctx.db.get(args.userId);
  if (!user?.clerkId) throw new Error("User has no clerkId");

  if (!args.profileId) {
    return { kind: "personal", clerkId: user.clerkId };
  }

  const profile = await ctx.db.get(args.profileId);
  if (!profile) throw new Error("Profile not found");

  if (profile.teamId) {
    const teamId = profile.teamId;
    const membership = await getMembershipOrNull(ctx, teamId, args.userId);
    if (!membership) throw new Error("Not a member of this team");

    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const allowedClerkIds: string[] = [];
    for (const m of members) {
      const u = await ctx.db.get(m.userId);
      if (u?.clerkId) allowedClerkIds.push(u.clerkId);
    }
    return {
      kind: "team",
      allowedClerkIds,
      profileId: profile._id,
      teamId: profile.teamId,
    };
  }

  if (profile.userId !== args.userId) {
    throw new Error("Profile not accessible");
  }
  return { kind: "personal", clerkId: user.clerkId };
}

interface AssertMemoryMutablePermissionArgs {
  userId: Id<"users">;
  memoryCreatorClerkId: string;
  profileId?: Id<"profiles">;
}

export async function runAssertMemoryMutablePermissionInternal(
  ctx: QueryCtx,
  args: AssertMemoryMutablePermissionArgs,
): Promise<true> {
  const user = await ctx.db.get(args.userId);
  if (!user?.clerkId) throw new Error("User has no clerkId");

  if (user.clerkId === args.memoryCreatorClerkId) return true;

  // Non-creator: must be the team's owner. Personal-profile mutations
  // by non-creators are never allowed.
  if (!args.profileId) throw new Error("Not allowed");
  const profile = await ctx.db.get(args.profileId);
  if (!profile?.teamId) throw new Error("Not allowed");

  const teamId = profile.teamId;
  const membership = await getMembershipOrNull(ctx, teamId, args.userId);
  if (!membership || membership.role !== "owner") {
    throw new Error("Not allowed");
  }
  return true;
}
