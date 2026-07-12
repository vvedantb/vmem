/**
 * MCP profile access: personal vs team connector scopes share one OAuth
 * server but list/validate/default profiles differently.
 */

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getUserByClerkId } from "../auth";
import { getMembershipOrNull } from "../teams/auth";

export const mcpScopeValidator = v.union(
  v.literal("personal"),
  v.literal("team"),
);

export type McpScope = "personal" | "team";

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

  if (scope === "personal") {
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

  const teamProfiles = await listTeamProfiles(ctx, user._id);
  return teamProfiles[0] ?? null;
}

/**
 * Normalize a profile id string and verify it's accessible to `userId` at
 * the given MCP scope. Throws "Invalid profile id" / "Profile not found"
 * on failure — shared by every path that resolves an explicit profileId.
 */
async function requireAccessibleProfileId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  profileId: string,
  scope: McpScope,
): Promise<Id<"profiles">> {
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
  return normalizedProfileId;
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
    return await requireAccessibleProfileId(
      ctx,
      user._id,
      explicitProfileId,
      scope,
    );
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
