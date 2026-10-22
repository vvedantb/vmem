import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getUserByClerkId } from "../auth";
import { getUserIdByClerkId } from "../lib/clerkUser";
import { getMembershipOrNull, requireContentScopeAccess } from "../teams/auth";

export const mcpScopeValidator = v.union(
  v.literal("personal"),
  v.literal("team"),
);

export type McpScope = "personal" | "team";

// args of *ByClerkIdInternal functions that act on scoped content
export const mcpContentScopeArgs = {
  clerkId: v.string(),
  scope: mcpScopeValidator,
};

export async function listPersonalProfiles(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles">[]> {
  const owned = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return owned.filter((profile) => profile.teamId === undefined);
}

export async function listTeamProfiles(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles">[]> {
  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const teamProfiles: Doc<"profiles">[] = [];
  for (const membership of memberships) {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_team", (q) => q.eq("teamId", membership.teamId))
      .first();
    if (profile) {
      teamProfiles.push(profile);
    }
  }
  return teamProfiles;
}

export async function listProfilesByClerkIdAndScope(
  ctx: QueryCtx,
  clerkId: string,
  scope: McpScope,
): Promise<Doc<"profiles">[]> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (!user) return [];

  if (scope === "personal") {
    return listPersonalProfiles(ctx, user._id);
  }
  return listTeamProfiles(ctx, user._id);
}

export async function canAccessProfileForMcpScope(
  ctx: QueryCtx,
  userId: Id<"users">,
  profile: Doc<"profiles">,
  scope: McpScope,
): Promise<boolean> {
  if (scope === "personal") {
    return profile.teamId === undefined && profile.userId === userId;
  }

  if (!profile.teamId) {
    return false;
  }

  const membership = await getMembershipOrNull(ctx, profile.teamId, userId);
  return membership !== null;
}

export async function getActiveProfileForMcpScope(
  ctx: QueryCtx,
  clerkId: string,
  scope: McpScope,
): Promise<Doc<"profiles"> | null> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (!user) return null;

  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();

  const defaultProfileId =
    scope === "personal"
      ? settings?.defaultProfiles?.mcp
      : settings?.defaultProfiles?.mcpTeam;

  if (defaultProfileId !== undefined) {
    const defaultProfile = await ctx.db.get(defaultProfileId);
    if (
      defaultProfile &&
      (await canAccessProfileForMcpScope(ctx, user._id, defaultProfile, scope))
    ) {
      return defaultProfile;
    }
  }

  if (scope === "team") {
    const teamProfiles = await listTeamProfiles(ctx, user._id);
    return teamProfiles[0] ?? null;
  }

  const defaultOwned = await ctx.db
    .query("profiles")
    .withIndex("by_user_default", (q) =>
      q.eq("userId", user._id).eq("isDefault", true),
    )
    .first();
  if (
    defaultOwned &&
    (await canAccessProfileForMcpScope(ctx, user._id, defaultOwned, scope))
  ) {
    return defaultOwned;
  }

  const personalProfiles = await listPersonalProfiles(ctx, user._id);
  return personalProfiles[0] ?? null;
}

// team for team-scope MCP tools: always the active team profile's team, never
// a tool param. Personal scope has no team.
export async function resolveMcpTeamId(
  ctx: QueryCtx,
  clerkId: string,
  scope: McpScope,
): Promise<Id<"teams"> | undefined> {
  if (scope !== "team") return undefined;
  const profile = await getActiveProfileForMcpScope(ctx, clerkId, "team");
  if (!profile?.teamId) {
    throw new Error("No team profiles available. Join or create a team first.");
  }
  return profile.teamId;
}

// scoped content (files, artifacts) for an mcp connector: the caller's
// personal rows, or on the team connector the active team profile's team
// (never a teamId param)
export async function resolveMcpContentScope(
  ctx: QueryCtx,
  args: { clerkId: string; scope: McpScope },
): Promise<{ userId: Id<"users">; teamId: Id<"teams"> | undefined }> {
  const userId = await getUserIdByClerkId(ctx, args.clerkId);
  const teamId = await resolveMcpTeamId(ctx, args.clerkId, args.scope);
  await requireContentScopeAccess(ctx, userId, teamId);
  return { userId, teamId };
}

async function requireAccessibleProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  profileId: string,
  scope: McpScope,
): Promise<Doc<"profiles">> {
  const normalizedProfileId = ctx.db.normalizeId("profiles", profileId);
  if (!normalizedProfileId) {
    throw new Error("Invalid profile id");
  }
  const profile = await ctx.db.get(normalizedProfileId);
  if (
    !profile ||
    !(await canAccessProfileForMcpScope(ctx, userId, profile, scope))
  ) {
    throw new Error("Profile not found");
  }
  return profile;
}

async function requireAccessibleProfileId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  profileId: string,
  scope: McpScope,
): Promise<Id<"profiles">> {
  return (await requireAccessibleProfile(ctx, userId, profileId, scope))._id;
}

// a profile this MCP connector may see; anything else is "Profile not found"
export async function requireProfileForMcpScope(
  ctx: QueryCtx,
  clerkId: string,
  scope: McpScope,
  profileId: string,
): Promise<Doc<"profiles">> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (!user) {
    throw new Error("User not found");
  }
  return requireAccessibleProfile(ctx, user._id, profileId, scope);
}

export async function resolveProfileIdForMcpScope(
  ctx: QueryCtx,
  clerkId: string,
  scope: McpScope,
  explicitProfileId?: string,
): Promise<string> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (!user) {
    throw new Error("User not found");
  }

  if (explicitProfileId !== undefined) {
    return requireAccessibleProfileId(ctx, user._id, explicitProfileId, scope);
  }

  const activeProfile = await getActiveProfileForMcpScope(ctx, clerkId, scope);
  if (!activeProfile) {
    throw new Error(
      scope === "team"
        ? "No team profiles available. Join or create a team first."
        : "No personal profiles available",
    );
  }
  return activeProfile._id;
}

export async function setMcpDefaultProfileForScope(
  ctx: MutationCtx,
  clerkId: string,
  profileId: string,
  scope: McpScope,
): Promise<void> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (!user) {
    throw new Error("User not found");
  }

  const normalizedProfileId = await requireAccessibleProfileId(
    ctx,
    user._id,
    profileId,
    scope,
  );

  const existing = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();

  const currentDefaults = existing?.defaultProfiles ?? {};
  const updatedDefaults =
    scope === "personal"
      ? { ...currentDefaults, mcp: normalizedProfileId }
      : { ...currentDefaults, mcpTeam: normalizedProfileId };

  if (existing) {
    await ctx.db.patch(existing._id, { defaultProfiles: updatedDefaults });
    return;
  }

  await ctx.db.insert("userSettings", {
    userId: user._id,
    defaultProfiles: updatedDefaults,
  });
}
