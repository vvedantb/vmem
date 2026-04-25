import { v } from "convex/values";
import { authQuery, authMutation, authAction } from "./auth";
import { internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { auditLog, ResourceTypes } from "./auditLog";

/**
 * Teams & team memberships.
 *
 * A team owns exactly one shared "team profile". Members save/view memories
 * against that profile. Memory rows keep userId (clerkId) of the original
 * creator for attribution; access control is enforced at the Convex layer
 * by consulting teamMembers before calling Neo4j.
 */

const TEAM_PROFILE_COLOR = "#8B5CF6"; // violet — visually distinct from personal default
const TEAM_PROFILE_ICON = "briefcase";

// ─────────────────────────────────────────────────────────────────────────────
// Public queries/mutations (require auth)
// ─────────────────────────────────────────────────────────────────────────────

/** List all teams the current user is a member of, with their role + profile. */
export const list = authQuery({
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    const results = [];
    for (const membership of memberships) {
      const team = await ctx.db.get(membership.teamId);
      if (!team) continue;
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .first();
      results.push({
        team,
        role: membership.role,
        profile,
        memberCount: (
          await ctx.db
            .query("teamMembers")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .collect()
        ).length,
      });
    }
    return results;
  },
});

/**
 * Get a single team (must be a member). Returns team + caller role + profile + members.
 *
 * Accepts `teamId` as a plain string and normalizes server-side so the caller
 * (e.g. a TanStack Router param) doesn't need to cast a branded `Id`.
 */
export const get = authQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    const teamId = ctx.db.normalizeId("teams", args.teamId);
    if (!teamId) return null;

    const membership = await getMembershipOrNull(ctx, teamId, ctx.userId);
    if (!membership) return null;

    const team = await ctx.db.get(teamId);
    if (!team) return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .first();

    const memberRows = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();

    const members = [];
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
  },
});

/** Create a team. Creator becomes owner. Auto-creates a shared team profile. */
export const create = authMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
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
  },
});

/** Rename a team (owner-only). Also renames the linked team profile to match. */
export const updateTeam = authMutation({
  args: { teamId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
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
  },
});

/** Add a member by email. Owner-only. User must already have a vmem account. */
export const addMember = authMutation({
  args: { teamId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const teamId = ctx.db.normalizeId("teams", args.teamId);
    if (!teamId) throw new Error("Team not found");

    await requireTeamRole(ctx, teamId, ctx.userId, ["owner"]);

    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user) {
      throw new Error("No vmem account for that email");
    }

    const existing = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", user._id),
      )
      .first();
    if (existing) {
      throw new Error("User is already a member of this team");
    }

    const now = Date.now();
    await ctx.db.insert("teamMembers", {
      teamId,
      userId: user._id,
      role: "member",
      joinedAt: now,
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
  },
});

/** Remove a member (owner-only). Cannot remove the last owner. Memories stay. */
export const removeMember = authMutation({
  args: { teamId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const teamId = ctx.db.normalizeId("teams", args.teamId);
    if (!teamId) throw new Error("Team not found");

    const targetUserId = ctx.db.normalizeId("users", args.userId);
    if (!targetUserId) throw new Error("User not found");

    await requireTeamRole(ctx, teamId, ctx.userId, ["owner"]);

    const target = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", targetUserId),
      )
      .first();
    if (!target) throw new Error("User is not a member");

    if (target.role === "owner") {
      const owners = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect();
      const ownerCount = owners.filter((m) => m.role === "owner").length;
      if (ownerCount <= 1) {
        throw new Error("Cannot remove the last owner");
      }
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
  },
});

/** Leave a team (self). Owner must hand off ownership first if they are the last owner. */
export const leaveTeam = authMutation({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    const teamId = ctx.db.normalizeId("teams", args.teamId);
    if (!teamId) throw new Error("Team not found");

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", ctx.userId),
      )
      .first();
    if (!membership) throw new Error("Not a member of this team");

    if (membership.role === "owner") {
      const members = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect();
      const ownerCount = members.filter((m) => m.role === "owner").length;
      if (ownerCount <= 1) {
        throw new Error(
          "You are the last owner. Transfer ownership before leaving.",
        );
      }
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
  },
});

/**
 * Delete a team (owner-only). Cascades: removes all memberships, deletes team
 * profile and its Neo4j memories, then deletes the team row.
 *
 * Accepts a string id; the internal mutation normalizes + validates.
 */
export const deleteTeam = authAction({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    // Owner check + gather profile id (via internal mutation for txn safety).
    // The internal mutation validates the Id string and throws if invalid.
    const teamProfileId: Id<"profiles"> = await ctx.runMutation(
      internal.teams.prepareDeleteTeamInternal,
      {
        teamId: args.teamId,
        userId: ctx.userId,
      },
    );

    // Purge Neo4j memories tied to the team profile (single creator clerkId is
    // insufficient — team memories may have many creators, so iterate members).
    const memberClerkIds: string[] = await ctx.runQuery(
      internal.teams.getTeamMemberClerkIdsInternal,
      { teamId: args.teamId },
    );
    for (const clerkId of memberClerkIds) {
      await ctx.runAction(
        internal.neo4jActions.migration.deleteMemoriesByProfile,
        {
          clerkId,
          profileId: teamProfileId,
        },
      );
    }

    // Now delete DB rows (finalize logs the audit event before deletion so
    // the team name is still available).
    await ctx.runMutation(internal.teams.finalizeDeleteTeamInternal, {
      teamId: args.teamId,
      actorUserId: ctx.userId,
    });
    return { deleted: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal mutations / queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Phase 1 of deleteTeam: verify ownership and return the profile id.
 * Split from finalize so we can run Neo4j cleanup in between (action cannot use ctx.db).
 */
export const prepareDeleteTeamInternal = internalMutation({
  args: { teamId: v.string(), userId: v.id("users") },
  handler: async (ctx, args): Promise<Id<"profiles">> => {
    const teamId = ctx.db.normalizeId("teams", args.teamId);
    if (!teamId) throw new Error("Team not found");

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", args.userId),
      )
      .first();
    if (!membership || membership.role !== "owner") {
      throw new Error("Owner role required");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    if (!profile) throw new Error("Team profile missing");
    return profile._id;
  },
});

/** Phase 2: drop memberships, profile, team (Neo4j already purged). */
export const finalizeDeleteTeamInternal = internalMutation({
  args: { teamId: v.string(), actorUserId: v.id("users") },
  handler: async (ctx, args) => {
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
  },
});

/** Return clerkIds of every member of a team. Used for Neo4j team-scope reads. */
export const getTeamMemberClerkIdsInternal = internalQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args): Promise<string[]> => {
    const teamId = ctx.db.normalizeId("teams", args.teamId);
    if (!teamId) return [];

    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const clerkIds: string[] = [];
    for (const m of members) {
      const u = await ctx.db.get(m.userId);
      if (u?.clerkId) clerkIds.push(u.clerkId);
    }
    return clerkIds;
  },
});

/**
 * Assert the caller (by Convex userId) has access to a profile:
 *  - Owner of a personal profile, OR
 *  - Member of the profile's team.
 * Returns the profile. Throws on denial or not-found.
 *
 * Accepts `profileId` as a string so callers (e.g. memory actions that take
 * `v.optional(v.string())`) can pass it through without a branded cast.
 */
export const assertProfileAccessInternal = internalQuery({
  args: { profileId: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (!profileId) throw new Error("Profile not found");

    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.teamId) {
      const teamId = profile.teamId;
      const membership = await ctx.db
        .query("teamMembers")
        .withIndex("by_team_user", (q) =>
          q.eq("teamId", teamId).eq("userId", args.userId),
        )
        .first();
      if (!membership) throw new Error("Not a member of this team");
    } else if (profile.userId !== args.userId) {
      throw new Error("Profile not accessible");
    }
    return profile;
  },
});

/**
 * Resolve a Neo4j memory scope for a given Convex user + optional profileId.
 *
 * Returns either:
 *   { kind: "personal", clerkId }             for personal profile or no profile
 *   { kind: "team", allowedClerkIds, profileId } for a team profile
 *
 * Throws if the user has no access.
 */
export const resolveMemoryScopeInternal = internalQuery({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.clerkId) throw new Error("User has no clerkId");

    if (!args.profileId) {
      return { kind: "personal" as const, clerkId: user.clerkId };
    }

    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");

    if (profile.teamId) {
      const teamId = profile.teamId;
      const membership = await ctx.db
        .query("teamMembers")
        .withIndex("by_team_user", (q) =>
          q.eq("teamId", teamId).eq("userId", args.userId),
        )
        .first();
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
        kind: "team" as const,
        allowedClerkIds,
        profileId: profile._id,
        teamId: profile.teamId,
      };
    }

    if (profile.userId !== args.userId) {
      throw new Error("Profile not accessible");
    }
    return { kind: "personal" as const, clerkId: user.clerkId };
  },
});

/**
 * Given a memoryId (Neo4j) and its creator clerkId, check whether the caller
 * can mutate (update/delete) it. Rule: creator OR team owner of the profile's team.
 *
 * Returns `true` if allowed, throws otherwise.
 */
export const assertMemoryMutablePermissionInternal = internalQuery({
  args: {
    userId: v.id("users"),
    memoryCreatorClerkId: v.string(),
    profileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.clerkId) throw new Error("User has no clerkId");

    // Creator can always mutate
    if (user.clerkId === args.memoryCreatorClerkId) return true;

    // Otherwise must be owner of the memory's team
    if (!args.profileId) throw new Error("Not allowed");
    const profile = await ctx.db.get(args.profileId);
    if (!profile?.teamId) throw new Error("Not allowed");

    const teamId = profile.teamId;
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", args.userId),
      )
      .first();
    if (!membership || membership.role !== "owner") {
      throw new Error("Not allowed");
    }
    return true;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers (module-local)
// ─────────────────────────────────────────────────────────────────────────────

async function getMembershipOrNull(
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

async function requireTeamRole(
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
