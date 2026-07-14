import { v } from "convex/values";
import { authQuery, authMutation, authAction, getUserByClerkId } from "./auth";
import { internalQuery, internalMutation } from "./_generated/server";
import { getOrCreateDefaultProfile } from "./profiles/helpers";
import {
  runCreate,
  runGetOrCreateDefault,
  runList,
  runUpdate,
} from "./profiles/handlers";
import {
  runRemoveInternalMutation,
  runRemoveWithMemories,
} from "./profiles/lifecycle";
import {
  getActiveProfileForMcpScope,
  listProfilesByClerkIdAndScope,
  mcpScopeValidator,
  resolveProfileIdForMcpScope,
} from "./profiles/mcpAccess";

export const list = authQuery({
  args: {},
  handler: async (ctx) => runList(ctx),
});

/** Get the currently active profile, or create default if none exists */
export const getOrCreateDefault = authMutation({
  args: {},
  handler: async (ctx) => runGetOrCreateDefault(ctx),
});

/** Create a new profile */
export const create = authMutation({
  args: {
    name: v.string(),
    color: v.string(),
    icon: v.string(),
  },
  handler: async (ctx, args) => runCreate(ctx, args),
});

/**
 * Update an existing profile (rename, recolor, re-icon).
 * Personal profile: owner only.
 * Team profile: must be a team owner. Renaming a team profile here also syncs
 * the team's name so the two stay in lockstep.
 */
export const update = authMutation({
  args: {
    profileId: v.id("profiles"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => runUpdate(ctx, args),
});

/** Delete a profile and handle its memories (action that can call Neo4j) */
export const removeWithMemories = authAction({
  args: {
    profileId: v.id("profiles"),
    /** If set, move memories to this profile. If not set, memories will be deleted. */
    moveMemoriesToProfileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => runRemoveWithMemories(ctx, args),
});

/** Internal mutation for deleting a profile (used by action) */
export const removeInternalMutation = internalMutation({
  args: {
    profileId: v.id("profiles"),
    actorUserId: v.id("users"),
    movedMemoriesToProfileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => runRemoveInternalMutation(ctx, args),
});

export const getByIdInternal = internalQuery({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.profileId);
  },
});

/**
 * Profile used for MCP memory tools when no profileId is passed.
 * Personal connector only — use getActiveProfileForMcpScopeInternal for team.
 */
export const getActiveProfileForMcpInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return getActiveProfileForMcpScope(ctx, args.clerkId, "personal");
  },
});

export const getActiveProfileForMcpScopeInternal = internalQuery({
  args: { clerkId: v.string(), scope: mcpScopeValidator },
  handler: async (ctx, args) => {
    return getActiveProfileForMcpScope(ctx, args.clerkId, args.scope);
  },
});

export const resolveProfileIdForMcpScopeInternal = internalQuery({
  args: {
    clerkId: v.string(),
    scope: mcpScopeValidator,
    profileId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    return resolveProfileIdForMcpScope(
      ctx,
      args.clerkId,
      args.scope,
      args.profileId,
    );
  },
});

export const getOrCreateDefaultByClerkIdInternal = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);

    if (!user) {
      throw new Error("User not found");
    }

    return await getOrCreateDefaultProfile(ctx, user._id);
  },
});

export const listByClerkIdAndScopeInternal = internalQuery({
  args: { clerkId: v.string(), scope: mcpScopeValidator },
  handler: async (ctx, args) => {
    return listProfilesByClerkIdAndScope(ctx, args.clerkId, args.scope);
  },
});

/**
 * List personal (non-team) profiles owned by a user. Used by the
 * user-level Dream Mode orchestrator to iterate every personal profile
 * in one pass.
 */
export const listPersonalByUserIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return all.filter((p) => p.teamId === undefined);
  },
});

/**
 * Get a team's profile (every team has exactly one — created with the team).
 * Used by file indexing to write team-drive file memories under the team
 * profile so they surface in team-scoped memory reads.
 */
export const getByTeamInternal = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();
  },
});

export const setLastDreamRunAtInternal = internalMutation({
  args: {
    profileId: v.id("profiles"),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) return null;
    await ctx.db.patch(args.profileId, { lastDreamRunAt: args.timestamp });
    return null;
  },
});

/**
 * Dream Mode V3 — store the evolving portrait the Dreamer produced for
 * this profile, with the memory ids it is grounded in.
 */
export const setDreamPortraitInternal = internalMutation({
  args: {
    profileId: v.id("profiles"),
    portrait: v.string(),
    sourceMemoryIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) return null;
    await ctx.db.patch(args.profileId, {
      dreamPortrait: args.portrait,
      dreamPortraitUpdatedAt: Date.now(),
      dreamPortraitSources: args.sourceMemoryIds,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Portrait for the user-wide MCP context prompt: the MCP-active personal
 * profile's dream portrait (the same profile MCP memory tools write to
 * by default). Null when no portrait has been dreamt yet.
 */
export const getPortraitForContextPromptInternal = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(
    v.object({ portrait: v.string(), updatedAt: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const profile = await getActiveProfileForMcpScope(
      ctx,
      args.clerkId,
      "personal",
    );
    if (!profile?.dreamPortrait) return null;
    return {
      portrait: profile.dreamPortrait,
      updatedAt: profile.dreamPortraitUpdatedAt ?? 0,
    };
  },
});
