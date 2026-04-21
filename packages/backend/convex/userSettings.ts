import { authQuery, authMutation } from "./auth";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

type ThemeValue = "light" | "dark" | "system";
type DefaultProfilesValue = {
  web?: Id<"profiles">;
  extension?: Id<"profiles">;
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

// Get default profile for a specific source (web or extension)
export const getDefaultProfile = authQuery({
  args: {
    source: v.union(v.literal("web"), v.literal("extension")),
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
    source: v.union(v.literal("web"), v.literal("extension")),
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
