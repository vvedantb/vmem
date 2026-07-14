import { v } from "convex/values";
import { authQuery, authMutation, authAction } from "./auth";
import { internalQuery, internalMutation } from "./_generated/server";
import { runGet, runList } from "./teams/handlers";
import {
  runAddMember,
  runLeaveTeam,
  runRemoveMember,
} from "./teams/membership";
import {
  runCreate,
  runDeleteTeam,
  runFinalizeDeleteTeamInternal,
  runGetTeamMemberClerkIdsInternal,
  runPrepareDeleteTeamInternal,
  runUpdateTeam,
} from "./teams/lifecycle";
import {
  runAssertMemoryMutablePermissionInternal,
  runAssertProfileAccessInternal,
  runResolveMemoryScopeInternal,
} from "./teams/auth";

export const list = authQuery({
  args: {},
  handler: async (ctx) => runList(ctx),
});

/**
 * Get a single team (must be a member). Returns team + caller role + profile + members.
 *
 * Accepts `teamId` as a plain string and normalizes server-side so the caller
 * (e.g. a TanStack Router param) doesn't need to cast a branded `Id`.
 */
export const get = authQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runGet(ctx, args),
});

/** Create a team. Creator becomes owner. Auto-creates a shared team profile. */
export const create = authMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => runCreate(ctx, args),
});

/** Rename a team (owner-only). Also renames the linked team profile to match. */
export const updateTeam = authMutation({
  args: { teamId: v.string(), name: v.string() },
  handler: async (ctx, args) => runUpdateTeam(ctx, args),
});

/** Add a member by email. Owner-only. User must already have a vmem account. */
export const addMember = authMutation({
  args: { teamId: v.string(), email: v.string() },
  handler: async (ctx, args) => runAddMember(ctx, args),
});

/** Remove a member (owner-only). Cannot remove the last owner. Memories stay. */
export const removeMember = authMutation({
  args: { teamId: v.string(), userId: v.string() },
  handler: async (ctx, args) => runRemoveMember(ctx, args),
});

/** Leave a team (self). Owner must hand off ownership first if they are the last owner. */
export const leaveTeam = authMutation({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runLeaveTeam(ctx, args),
});

/**
 * Delete a team (owner-only). Cascades: removes all memberships, deletes team
 * profile and its Neo4j memories, then deletes the team row.
 *
 * Accepts a string id; the internal mutation normalizes + validates.
 */
export const deleteTeam = authAction({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runDeleteTeam(ctx, args),
});

export const prepareDeleteTeamInternal = internalMutation({
  args: { teamId: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => runPrepareDeleteTeamInternal(ctx, args),
});

/** Phase 2: drop memberships, profile, team (Neo4j already purged). */
export const finalizeDeleteTeamInternal = internalMutation({
  args: { teamId: v.string(), actorUserId: v.id("users") },
  handler: async (ctx, args) => runFinalizeDeleteTeamInternal(ctx, args),
});

/** Return clerkIds of every member of a team. Used for Neo4j team-scope reads. */
export const getTeamMemberClerkIdsInternal = internalQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runGetTeamMemberClerkIdsInternal(ctx, args),
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
  handler: async (ctx, args) => runAssertProfileAccessInternal(ctx, args),
});

/**
 * Resolve a Neo4j memory scope for a given Convex user + optional profileId.
 *
 * Returns either:
 *   { kind: "personal", clerkId }                    for personal profile or no profile
 *   { kind: "team", allowedClerkIds, profileId, … }  for a team profile
 *
 * Throws if the user has no access.
 */
export const resolveMemoryScopeInternal = internalQuery({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => runResolveMemoryScopeInternal(ctx, args),
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
  handler: async (ctx, args) =>
    runAssertMemoryMutablePermissionInternal(ctx, args),
});
