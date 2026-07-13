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
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

export type AuthQueryCtx = QueryCtx & { userId: Id<"users"> };
export type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };
export type AuthActionCtx = ActionCtx & { userId: Id<"users"> };

export async function getMembershipOrNull(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
  userId: Id<"users">,
): Promise<Doc<"teamMembers"> | null> {
  return ctx.db
    .query("teamMembers")
    .withIndex("by_team_user", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .first();
}

export async function requireTeamRole(
  ctx: QueryCtx | MutationCtx,
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

/** Team-scoped profile row, or null when the team has none. */
export async function getTeamProfileOrNull(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
): Promise<Doc<"profiles"> | null> {
  return ctx.db
    .query("profiles")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .first();
}

/** Clerk ids of every member of a team (members without a clerkId skipped). */
export async function getTeamMemberClerkIds(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
): Promise<string[]> {
  const members = await ctx.db
    .query("teamMembers")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();
  const clerkIds: string[] = [];
  for (const member of members) {
    const user = await ctx.db.get(member.userId);
    if (user?.clerkId) clerkIds.push(user.clerkId);
  }
  return clerkIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Content scoping (skills / wikiNodes / fileNodes) — "user-wide + team".
//
// A content doc carries `userId` (creator) and optional `teamId`:
//   - teamId absent → personal: only the owner can read or mutate.
//   - teamId set    → team: any member reads AND edits (collaborative);
//                     delete requires the creator or a team owner.
// ─────────────────────────────────────────────────────────────────────────────

interface ScopedContentDoc {
  userId: Id<"users">;
  teamId?: Id<"teams">;
}

/** List/create gate: membership when a teamId scope is requested. */
export async function requireContentScopeAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<void> {
  if (teamId === undefined) return;
  const membership = await getMembershipOrNull(ctx, teamId, userId);
  if (!membership) throw new Error("Not a member of this team");
}

/** True when the caller may read this doc (owner, or team member). */
export async function isContentReadable(
  ctx: QueryCtx | MutationCtx,
  doc: ScopedContentDoc,
  userId: Id<"users">,
): Promise<boolean> {
  if (doc.teamId === undefined) return doc.userId === userId;
  const membership = await getMembershipOrNull(ctx, doc.teamId, userId);
  return membership !== null;
}

/** Edit gate: personal → owner only; team → any member (collaborative). */
export async function assertContentEditable(
  ctx: QueryCtx | MutationCtx,
  doc: ScopedContentDoc,
  userId: Id<"users">,
): Promise<void> {
  if (doc.teamId === undefined) {
    if (doc.userId !== userId) throw new Error("Not found");
    return;
  }
  const membership = await getMembershipOrNull(ctx, doc.teamId, userId);
  if (!membership) throw new Error("Not found");
}

/** Delete gate: personal → owner; team → creator or team owner. */
export async function assertContentDeletable(
  ctx: QueryCtx | MutationCtx,
  doc: ScopedContentDoc,
  userId: Id<"users">,
): Promise<void> {
  if (doc.teamId === undefined) {
    await assertContentEditable(ctx, doc, userId);
    return;
  }

  const membership = await getMembershipOrNull(ctx, doc.teamId, userId);
  if (doc.userId === userId) {
    // Creator must still be a member to act on team content.
    if (!membership) throw new Error("Not found");
    return;
  }
  if (!membership || membership.role !== "owner") {
    throw new Error("Only the creator or a team owner can delete this");
  }
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
    const membership = await getMembershipOrNull(
      ctx,
      profile.teamId,
      args.userId,
    );
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

    return {
      kind: "team",
      allowedClerkIds: await getTeamMemberClerkIds(ctx, teamId),
      profileId: profile._id,
      teamId,
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

  const membership = await getMembershipOrNull(
    ctx,
    profile.teamId,
    args.userId,
  );
  if (!membership || membership.role !== "owner") {
    throw new Error("Not allowed");
  }
  return true;
}
