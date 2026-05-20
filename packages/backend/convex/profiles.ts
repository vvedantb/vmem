import { v } from "convex/values";
import { authQuery, authMutation, authAction } from "./auth";
import { internalQuery, internalMutation } from "./_generated/server";
import { getOrCreateDefaultProfile } from "./profiles/helpers";
import {
  runCreate,
  runGet,
  runGetOrCreateDefault,
  runList,
  runUpdate,
} from "./profiles/handlers";
import {
  runRemove,
  runRemoveInternalMutation,
  runRemoveWithMemories,
} from "./profiles/lifecycle";
import { runSetLastDreamRunAtInternal } from "./profiles/dream";

export { PROFILE_COLORS, PROFILE_ICONS } from "./profiles/helpers";

// ─────────────────────────────────────────────────────────────────────────────
// Public queries/mutations (require auth)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all profiles visible to the current user.
 * Includes:
 *  - personal profiles owned by the user (teamId undefined)
 *  - team profiles for every team the user is a member of
 *
 * Personal profiles owned by a different user that happen to be shared via
 * team membership are NOT included here — team access is strictly through
 * team profiles.
 */
export const list = authQuery({
  args: {},
  handler: async (ctx) => runList(ctx),
});

/** Get a single profile by ID (must belong to user OR be a team profile where user is a member) */
export const get = authQuery({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => runGet(ctx, args),
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

/** Delete a profile (cannot delete default, must handle memories) */
export const remove = authMutation({
  args: {
    profileId: v.id("profiles"),
    /** If set, move memories to this profile. If not set, memories are orphaned (null profileId). */
    moveMemoriesToProfileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => runRemove(ctx, args),
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

// ─────────────────────────────────────────────────────────────────────────────
// Internal queries/mutations (for MCP and internal use)
// ─────────────────────────────────────────────────────────────────────────────

/** Get a profile by ID (internal, no auth check) */
export const getByIdInternal = internalQuery({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.profileId);
  },
});

/**
 * Get default profile by Clerk ID
 * @deprecated Use specific source defaults from userSettings instead
 */
export const getActiveByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) return null;

    return await ctx.db
      .query("profiles")
      .withIndex("by_user_default", (q) =>
        q.eq("userId", user._id).eq("isDefault", true),
      )
      .first();
  },
});

/** Get or create default profile by Clerk ID (for MCP) */
export const getOrCreateDefaultByClerkIdInternal = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    return await getOrCreateDefaultProfile(ctx, user._id);
  },
});

/** List profiles by Clerk ID (for MCP) */
export const listByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) return [];

    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
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

/** Get default profile by user ID (internal) */
export const getDefaultByUserIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_user_default", (q) =>
        q.eq("userId", args.userId).eq("isDefault", true),
      )
      .first();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Dream Mode V2 — per-profile rate-limit stamp
//
// `lastDreamRunAt` is stamped after every Dream Mode pass and used by the
// manual "Run Dream Mode" button to enforce a 1-run-per-hour rate limit.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal: stamp `lastDreamRunAt` on a profile. Called by the per-profile
 * Dream Mode runner on every pass (success or empty) so the manual button's
 * rate-limit accounting stays accurate.
 */
export const setLastDreamRunAtInternal = internalMutation({
  args: {
    profileId: v.id("profiles"),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => runSetLastDreamRunAtInternal(ctx, args),
});
