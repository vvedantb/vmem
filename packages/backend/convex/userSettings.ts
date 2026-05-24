import { authQuery, authMutation } from "./auth";
import { internalQuery, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

type ThemeValue = "light" | "dark" | "system";
type DefaultProfilesValue = {
  web?: Id<"profiles">;
  extension?: Id<"profiles">;
  mcp?: Id<"profiles">;
} | null;

const defaults: {
  theme: ThemeValue;
  language: string;
  memoryAutoTag: boolean;
  notificationsEnabled: boolean;
  extensionAutoSyncEnabled: boolean;
  extensionSelectionPopupEnabled: boolean;
  memoryAutoExtract: boolean;
  memoryConfidenceThreshold: number;
  notifyMemoryConflicts: boolean;
  notifyNewMemories: boolean;
  notifyMemoriesExpiring: boolean;
  aboutMe: string;
  preferences: string;
  defaultProfiles: DefaultProfilesValue;
  dreamModeAutoAccept: boolean;
  dreamModeScheduleEnabled: boolean;
  dreamModeScheduleTime: string | null;
  lastDreamRunAt: number | null;
} = {
  theme: "system",
  language: "en",
  memoryAutoTag: true,
  notificationsEnabled: false,
  extensionAutoSyncEnabled: true,
  extensionSelectionPopupEnabled: true,
  memoryAutoExtract: true,
  memoryConfidenceThreshold: 70,
  notifyMemoryConflicts: true,
  notifyNewMemories: false,
  notifyMemoriesExpiring: true,
  aboutMe: "",
  preferences: "",
  defaultProfiles: null,
  dreamModeAutoAccept: false,
  dreamModeScheduleEnabled: false,
  dreamModeScheduleTime: null,
  lastDreamRunAt: null,
};

export const get = authQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    return {
      _id: doc?._id ?? null,
      userId: ctx.userId,
      theme: doc?.theme ?? defaults.theme,
      language: doc?.language ?? defaults.language,
      memoryAutoTag: doc?.memoryAutoTag ?? defaults.memoryAutoTag,
      notificationsEnabled:
        doc?.notificationsEnabled ?? defaults.notificationsEnabled,
      extensionAutoSyncEnabled:
        doc?.extensionAutoSyncEnabled ?? defaults.extensionAutoSyncEnabled,
      extensionSelectionPopupEnabled:
        doc?.extensionSelectionPopupEnabled ??
        defaults.extensionSelectionPopupEnabled,
      memoryAutoExtract: doc?.memoryAutoExtract ?? defaults.memoryAutoExtract,
      memoryConfidenceThreshold:
        doc?.memoryConfidenceThreshold ?? defaults.memoryConfidenceThreshold,
      notifyMemoryConflicts:
        doc?.notifyMemoryConflicts ?? defaults.notifyMemoryConflicts,
      notifyNewMemories: doc?.notifyNewMemories ?? defaults.notifyNewMemories,
      notifyMemoriesExpiring:
        doc?.notifyMemoriesExpiring ?? defaults.notifyMemoriesExpiring,
      aboutMe: doc?.aboutMe ?? defaults.aboutMe,
      preferences: doc?.preferences ?? defaults.preferences,
      defaultProfiles: doc?.defaultProfiles ?? defaults.defaultProfiles,
      dreamModeAutoAccept:
        doc?.dreamModeAutoAccept ?? defaults.dreamModeAutoAccept,
      dreamModeScheduleEnabled:
        doc?.dreamModeScheduleEnabled ?? defaults.dreamModeScheduleEnabled,
      dreamModeScheduleTime:
        doc?.dreamModeScheduleTime ?? defaults.dreamModeScheduleTime,
      lastDreamRunAt: doc?.lastDreamRunAt ?? defaults.lastDreamRunAt,
    };
  },
});

/**
 * Internal query used by actions to fetch the user-provided context
 * (About Me / Preferences) that gets surfaced alongside memory retrieval.
 */
export const getUserContextInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    aboutMe: v.union(v.string(), v.null()),
    preferences: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const aboutMe = doc?.aboutMe?.trim();
    const preferences = doc?.preferences?.trim();
    return {
      aboutMe: aboutMe ? aboutMe : null,
      preferences: preferences ? preferences : null,
    };
  },
});

export const update = authMutation({
  args: {
    theme: v.optional(
      v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    ),
    language: v.optional(v.string()),
    memoryAutoTag: v.optional(v.boolean()),
    notificationsEnabled: v.optional(v.boolean()),
    extensionAutoSyncEnabled: v.optional(v.boolean()),
    extensionSelectionPopupEnabled: v.optional(v.boolean()),
    memoryAutoExtract: v.optional(v.boolean()),
    memoryConfidenceThreshold: v.optional(v.number()),
    notifyMemoryConflicts: v.optional(v.boolean()),
    notifyNewMemories: v.optional(v.boolean()),
    notifyMemoriesExpiring: v.optional(v.boolean()),
    aboutMe: v.optional(v.string()),
    preferences: v.optional(v.string()),
    dreamModeAutoAccept: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    const fields: Record<string, string | boolean | number> = {};
    if (args.theme !== undefined) fields.theme = args.theme;
    if (args.language !== undefined) fields.language = args.language;
    if (args.memoryAutoTag !== undefined)
      fields.memoryAutoTag = args.memoryAutoTag;
    if (args.notificationsEnabled !== undefined)
      fields.notificationsEnabled = args.notificationsEnabled;
    if (args.extensionAutoSyncEnabled !== undefined)
      fields.extensionAutoSyncEnabled = args.extensionAutoSyncEnabled;
    if (args.extensionSelectionPopupEnabled !== undefined)
      fields.extensionSelectionPopupEnabled =
        args.extensionSelectionPopupEnabled;
    if (args.memoryAutoExtract !== undefined)
      fields.memoryAutoExtract = args.memoryAutoExtract;
    if (args.memoryConfidenceThreshold !== undefined)
      fields.memoryConfidenceThreshold = args.memoryConfidenceThreshold;
    if (args.notifyMemoryConflicts !== undefined)
      fields.notifyMemoryConflicts = args.notifyMemoryConflicts;
    if (args.notifyNewMemories !== undefined)
      fields.notifyNewMemories = args.notifyNewMemories;
    if (args.notifyMemoriesExpiring !== undefined)
      fields.notifyMemoriesExpiring = args.notifyMemoriesExpiring;
    if (args.aboutMe !== undefined) fields.aboutMe = args.aboutMe;
    if (args.preferences !== undefined) fields.preferences = args.preferences;
    if (args.dreamModeAutoAccept !== undefined)
      fields.dreamModeAutoAccept = args.dreamModeAutoAccept;

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("userSettings", {
      userId: ctx.userId,
      ...args,
    });
  },
});

/**
 * Internal: stamp `lastDreamRunAt` on the user's settings row. Called by
 * `runDreamForUserInternal` after every Dream Mode pass — used to enforce
 * the 1-run-per-hour rate-limit on the manual button.
 */
export const setLastDreamRunAtInternal = internalMutation({
  args: {
    userId: v.id("users"),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { lastDreamRunAt: args.timestamp });
      return existing._id;
    }
    return await ctx.db.insert("userSettings", {
      userId: args.userId,
      lastDreamRunAt: args.timestamp,
    });
  },
});

/**
 * Internal: read the user's Dream Mode config (auto-accept + last run).
 * Used by the dream pipeline to decide auto-accept vs proposals and to
 * gate the manual button rate-limit.
 */
export const getDreamConfigInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    dreamModeAutoAccept: v.boolean(),
    lastDreamRunAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    return {
      dreamModeAutoAccept: doc?.dreamModeAutoAccept ?? false,
      lastDreamRunAt: doc?.lastDreamRunAt ?? null,
    };
  },
});

// Get default profile for a specific source (web, extension, or mcp)
export const getDefaultProfile = authQuery({
  args: {
    source: v.union(v.literal("web"), v.literal("extension"), v.literal("mcp")),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (!doc?.defaultProfiles) return null;

    return doc.defaultProfiles[args.source] ?? null;
  },
});

// Set default profile for a specific source
export const setDefaultProfile = authMutation({
  args: {
    source: v.union(v.literal("web"), v.literal("extension"), v.literal("mcp")),
    profileId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    // Verify profile belongs to user
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.userId !== ctx.userId) {
      throw new Error("Profile not found");
    }

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    const currentDefaults = existing?.defaultProfiles ?? {};
    const updatedDefaults = {
      ...currentDefaults,
      [args.source]: args.profileId,
    };

    if (existing) {
      await ctx.db.patch(existing._id, { defaultProfiles: updatedDefaults });
      return existing._id;
    }

    return await ctx.db.insert("userSettings", {
      userId: ctx.userId,
      defaultProfiles: updatedDefaults,
    });
  },
});

export const getMcpDefaultProfileIdByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(v.id("profiles"), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return null;

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    return settings?.defaultProfiles?.mcp ?? null;
  },
});

export const setMcpDefaultProfileByClerkIdInternal = internalMutation({
  args: { clerkId: v.string(), profileId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) {
      throw new Error("User not found");
    }

    const normalizedProfileId = ctx.db.normalizeId("profiles", args.profileId);
    if (!normalizedProfileId) {
      throw new Error("Invalid profile id");
    }

    const profile = await ctx.db.get(normalizedProfileId);
    if (!profile || profile.userId !== user._id) {
      throw new Error("Profile not found");
    }

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const currentDefaults = existing?.defaultProfiles ?? {};
    const updatedDefaults = {
      ...currentDefaults,
      mcp: normalizedProfileId,
    };

    if (existing) {
      await ctx.db.patch(existing._id, { defaultProfiles: updatedDefaults });
      return null;
    }

    await ctx.db.insert("userSettings", {
      userId: user._id,
      defaultProfiles: updatedDefaults,
    });
    return null;
  },
});
