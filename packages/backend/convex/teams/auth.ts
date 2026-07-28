import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { AuthActionCtx } from "../auth";

export type AuthQueryCtx = QueryCtx & { userId: Id<"users"> };
export type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };
export type { AuthActionCtx };

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

// team-scoped profile row, or null when the team has none
export async function getTeamProfileOrNull(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
): Promise<Doc<"profiles"> | null> {
  return ctx.db
    .query("profiles")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .first();
}

// Clerk ids of every member of a team (members without a clerkId skipped)
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

interface ScopedContentDoc {
  userId: Id<"users">;
  teamId?: Id<"teams">;
}

// list/create gate: membership when a teamId scope is requested
export async function requireContentScopeAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<void> {
  if (teamId === undefined) return;
  const membership = await getMembershipOrNull(ctx, teamId, userId);
  if (!membership) throw new Error("Not a member of this team");
}

// true when the caller may read this doc (owner, or team member)
export async function isContentReadable(
  ctx: QueryCtx | MutationCtx,
  doc: ScopedContentDoc,
  userId: Id<"users">,
): Promise<boolean> {
  if (doc.teamId === undefined) return doc.userId === userId;
  const membership = await getMembershipOrNull(ctx, doc.teamId, userId);
  return membership !== null;
}

// edit gate: personal → owner only; team → any member (collaborative)
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

// delete gate: personal → owner; team → creator or team owner
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
    // creator must still be a member to act on team content
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
  profileId?: string;
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

  const profileId = ctx.db.normalizeId("profiles", args.profileId);
  if (!profileId) throw new Error("Profile not found");

  const profile = await ctx.db.get(profileId);
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

interface GetOwnerUserIdArgs {
  teamId: Id<"teams">;
}

// current owner of a team, or null if no owner row exists (e.g. team mid-transfer)
export async function runGetOwnerUserIdInternal(
  ctx: QueryCtx,
  args: GetOwnerUserIdArgs,
): Promise<Id<"users"> | null> {
  const members = await ctx.db
    .query("teamMembers")
    .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
    .collect();
  const owner = members.find((m) => m.role === "owner");
  return owner?.userId ?? null;
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

  // non-creator: must be the team's owner. Personal-profile mutations
  // by non-creators are never allowed
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
