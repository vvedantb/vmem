import { v } from "convex/values";
import { authQuery, authMutation, authAction } from "./auth";
import { internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** Default profile colors (8 preset options) */
export const PROFILE_COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#6366F1", // indigo
] as const;

/** Default profile icons (12 options) */
export const PROFILE_ICONS = [
  "user",
  "briefcase",
  "home",
  "code",
  "book",
  "heart",
  "star",
  "rocket",
  "lightbulb",
  "music",
  "camera",
  "gamepad",
] as const;

const DEFAULT_PROFILE_NAME = "Personal";
const DEFAULT_PROFILE_COLOR = "#3B82F6";
const DEFAULT_PROFILE_ICON = "user";

// ─────────────────────────────────────────────────────────────────────────────
// Public queries/mutations (require auth)
// ─────────────────────────────────────────────────────────────────────────────

/** List all profiles for the current user */
export const list = authQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
  },
});

/** Get a single profile by ID (must belong to user) */
export const get = authQuery({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.userId !== ctx.userId) {
      return null;
    }
    return profile;
  },
});

/** Get the currently active profile, or create default if none exists */
export const getOrCreateDefault = authMutation({
  args: {},
  handler: async (ctx) => {
    return await getOrCreateDefaultProfile(ctx, ctx.userId);
  },
});

/** Create a new profile */
export const create = authMutation({
  args: {
    name: v.string(),
    color: v.string(),
    icon: v.string(),
  },
  handler: async (ctx, args) => {
    // Check name uniqueness within user
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", ctx.userId).eq("name", args.name),
      )
      .first();

    if (existing) {
      throw new Error(`Profile "${args.name}" already exists`);
    }

    const now = Date.now();
    const profileId = await ctx.db.insert("profiles", {
      userId: ctx.userId,
      name: args.name,
      color: args.color,
      icon: args.icon,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get(profileId);
  },
});

/** Update an existing profile (rename, recolor, re-icon) */
export const update = authMutation({
  args: {
    profileId: v.id("profiles"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.userId !== ctx.userId) {
      throw new Error("Profile not found");
    }

    // Check name uniqueness if changing name
    if (args.name !== undefined && args.name !== profile.name) {
      const newName = args.name;
      const existing = await ctx.db
        .query("profiles")
        .withIndex("by_user_name", (q) =>
          q.eq("userId", ctx.userId).eq("name", newName),
        )
        .first();

      if (existing) {
        throw new Error(`Profile "${newName}" already exists`);
      }
    }

    const updates: Partial<Doc<"profiles">> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.color !== undefined) updates.color = args.color;
    if (args.icon !== undefined) updates.icon = args.icon;

    await ctx.db.patch(args.profileId, updates);
    return await ctx.db.get(args.profileId);
  },
});

/** Delete a profile (cannot delete default, must handle memories) */
export const remove = authMutation({
  args: {
    profileId: v.id("profiles"),
    /** If set, move memories to this profile. If not set, memories are orphaned (null profileId). */
    moveMemoriesToProfileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.userId !== ctx.userId) {
      throw new Error("Profile not found");
    }

    if (profile.isDefault) {
      throw new Error("Cannot delete the default profile");
    }

    // Validate target profile if moving memories
    if (args.moveMemoriesToProfileId) {
      const targetProfile = await ctx.db.get(args.moveMemoriesToProfileId);
      if (!targetProfile || targetProfile.userId !== ctx.userId) {
        throw new Error("Target profile not found");
      }
    }

    // If this profile is a default for any source, clear it
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (settings?.defaultProfiles) {
      const currentDefaults = settings.defaultProfiles;
      const updatedDefaults: {
        web?: Id<"profiles">;
        extension?: Id<"profiles">;
      } = {};

      // Preserve web default if not the deleted profile
      if (currentDefaults.web && currentDefaults.web !== args.profileId) {
        updatedDefaults.web = currentDefaults.web;
      }
      // Preserve extension default if not the deleted profile
      if (
        currentDefaults.extension &&
        currentDefaults.extension !== args.profileId
      ) {
        updatedDefaults.extension = currentDefaults.extension;
      }

      // Only update if something changed
      const webChanged = currentDefaults.web === args.profileId;
      const extensionChanged = currentDefaults.extension === args.profileId;
      if (webChanged || extensionChanged) {
        await ctx.db.patch(settings._id, { defaultProfiles: updatedDefaults });
      }
    }

    // Delete the profile
    await ctx.db.delete(args.profileId);

    // Return info for the action to handle memory migration
    return {
      deleted: true,
      profileId: args.profileId,
      moveMemoriesToProfileId: args.moveMemoriesToProfileId ?? null,
    };
  },
});

/** Delete a profile and handle its memories (action that can call Neo4j) */
export const removeWithMemories = authAction({
  args: {
    profileId: v.id("profiles"),
    /** If set, move memories to this profile. If not set, memories will be deleted. */
    moveMemoriesToProfileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => {
    // Get user's clerkId
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: ctx.userId,
    });
    if (!clerkId) {
      throw new Error("User not found");
    }

    // Handle memories first (before deleting the profile)
    if (args.moveMemoriesToProfileId) {
      await ctx.runAction(
        internal.neo4jActions.migration.moveMemoriesBetweenProfiles,
        {
          clerkId,
          fromProfileId: args.profileId,
          toProfileId: args.moveMemoriesToProfileId,
        },
      );
    } else {
      await ctx.runAction(
        internal.neo4jActions.migration.deleteMemoriesByProfile,
        {
          clerkId,
          profileId: args.profileId,
        },
      );
    }

    // Delete the profile via the mutation
    await ctx.runMutation(internal.profiles.removeInternalMutation, {
      profileId: args.profileId,
    });

    return { deleted: true };
  },
});

/** Internal mutation for deleting a profile (used by action) */
export const removeInternalMutation = internalMutation({
  args: {
    profileId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    if (profile.isDefault) {
      throw new Error("Cannot delete the default profile");
    }

    // If this profile is a default for any source, clear it
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", profile.userId))
      .first();

    if (settings?.defaultProfiles) {
      const currentDefaults = settings.defaultProfiles;
      const updatedDefaults: {
        web?: Id<"profiles">;
        extension?: Id<"profiles">;
      } = {};

      // Preserve web default if not the deleted profile
      if (currentDefaults.web && currentDefaults.web !== args.profileId) {
        updatedDefaults.web = currentDefaults.web;
      }
      // Preserve extension default if not the deleted profile
      if (
        currentDefaults.extension &&
        currentDefaults.extension !== args.profileId
      ) {
        updatedDefaults.extension = currentDefaults.extension;
      }

      // Only update if something changed
      const webChanged = currentDefaults.web === args.profileId;
      const extensionChanged = currentDefaults.extension === args.profileId;
      if (webChanged || extensionChanged) {
        await ctx.db.patch(settings._id, { defaultProfiles: updatedDefaults });
      }
    }

    await ctx.db.delete(args.profileId);
    return { deleted: true };
  },
});

/**
 * Get the user's default profile.
 * @deprecated Use specific source defaults from userSettings instead
 */
export const getActive = authQuery({
  args: {},
  handler: async (ctx) => {
    // Return the user's default profile
    const defaultProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_default", (q) =>
        q.eq("userId", ctx.userId).eq("isDefault", true),
      )
      .first();
    return defaultProfile ?? null;
  },
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

    // Return default profile
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
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getOrCreateDefaultProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles">> {
  // Check for existing default
  const existing = await ctx.db
    .query("profiles")
    .withIndex("by_user_default", (q) =>
      q.eq("userId", userId).eq("isDefault", true),
    )
    .first();

  if (existing) {
    return existing;
  }

  // Create default profile (only if we have mutation context)
  if (!("insert" in ctx.db)) {
    throw new Error("No default profile found and cannot create in query");
  }

  const now = Date.now();
  const profileId = await (ctx as MutationCtx).db.insert("profiles", {
    userId,
    name: DEFAULT_PROFILE_NAME,
    color: DEFAULT_PROFILE_COLOR,
    icon: DEFAULT_PROFILE_ICON,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  });

  const profile = await ctx.db.get(profileId);
  if (!profile) {
    throw new Error("Failed to create default profile");
  }
  return profile;
}
