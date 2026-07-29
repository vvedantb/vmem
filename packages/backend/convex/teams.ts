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
  runGetOwnerUserIdInternal,
  runResolveMemoryScopeInternal,
} from "./teams/auth";

export const list = authQuery({
  args: {},
  handler: async (ctx) => runList(ctx),
});

export const get = authQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runGet(ctx, args),
});

export const create = authMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => runCreate(ctx, args),
});

export const updateTeam = authMutation({
  args: { teamId: v.string(), name: v.string() },
  handler: async (ctx, args) => runUpdateTeam(ctx, args),
});

export const addMember = authMutation({
  args: { teamId: v.string(), email: v.string() },
  handler: async (ctx, args) => runAddMember(ctx, args),
});

export const removeMember = authMutation({
  args: { teamId: v.string(), userId: v.string() },
  handler: async (ctx, args) => runRemoveMember(ctx, args),
});

export const leaveTeam = authMutation({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runLeaveTeam(ctx, args),
});

export const deleteTeam = authAction({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runDeleteTeam(ctx, args),
});

export const prepareDeleteTeamInternal = internalMutation({
  args: { teamId: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => runPrepareDeleteTeamInternal(ctx, args),
});

// phase 2, drop memberships, profile, team (neo4j already purged)
export const finalizeDeleteTeamInternal = internalMutation({
  args: { teamId: v.string(), actorUserId: v.id("users") },
  handler: async (ctx, args) => runFinalizeDeleteTeamInternal(ctx, args),
});

export const getTeamMemberClerkIdsInternal = internalQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args) => runGetTeamMemberClerkIdsInternal(ctx, args),
});

export const assertProfileAccessInternal = internalQuery({
  args: { profileId: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => runAssertProfileAccessInternal(ctx, args),
});

export const resolveMemoryScopeInternal = internalQuery({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => runResolveMemoryScopeInternal(ctx, args),
});

export const assertMemoryMutablePermissionInternal = internalQuery({
  args: {
    userId: v.id("users"),
    memoryCreatorClerkId: v.string(),
    profileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) =>
    runAssertMemoryMutablePermissionInternal(ctx, args),
});

export const getOwnerUserIdInternal = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => runGetOwnerUserIdInternal(ctx, args),
});
