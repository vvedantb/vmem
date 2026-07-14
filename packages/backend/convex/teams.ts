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

// get a single team (must be a member)
export const get = authQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runGet(ctx, args),
});

// create a team
export const create = authMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => runCreate(ctx, args),
});

// rename a team (owner-only)
export const updateTeam = authMutation({
  args: { teamId: v.string(), name: v.string() },
  handler: async (ctx, args) => runUpdateTeam(ctx, args),
});

// add a member by email
export const addMember = authMutation({
  args: { teamId: v.string(), email: v.string() },
  handler: async (ctx, args) => runAddMember(ctx, args),
});

// remove a member (owner-only)
export const removeMember = authMutation({
  args: { teamId: v.string(), userId: v.string() },
  handler: async (ctx, args) => runRemoveMember(ctx, args),
});

// leave a team (self)
export const leaveTeam = authMutation({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runLeaveTeam(ctx, args),
});

// delete a team (owner-only)
export const deleteTeam = authAction({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runDeleteTeam(ctx, args),
});

export const prepareDeleteTeamInternal = internalMutation({
  args: { teamId: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => runPrepareDeleteTeamInternal(ctx, args),
});

// phase 2: drop memberships, profile, team (Neo4j already purged)
export const finalizeDeleteTeamInternal = internalMutation({
  args: { teamId: v.string(), actorUserId: v.id("users") },
  handler: async (ctx, args) => runFinalizeDeleteTeamInternal(ctx, args),
});

// return clerkIds of every member of a team
export const getTeamMemberClerkIdsInternal = internalQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runGetTeamMemberClerkIdsInternal(ctx, args),
});

// assert the caller (by Convex userId) has access to a profile:
export const assertProfileAccessInternal = internalQuery({
  args: { profileId: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => runAssertProfileAccessInternal(ctx, args),
});

// resolve a Neo4j memory scope for a given Convex user + optional profileId
export const resolveMemoryScopeInternal = internalQuery({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => runResolveMemoryScopeInternal(ctx, args),
});

// given a memoryId (Neo4j) and its creator clerkId, check whether the caller can mutate
export const assertMemoryMutablePermissionInternal = internalQuery({
  args: {
    userId: v.id("users"),
    memoryCreatorClerkId: v.string(),
    profileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) =>
    runAssertMemoryMutablePermissionInternal(ctx, args),
});
