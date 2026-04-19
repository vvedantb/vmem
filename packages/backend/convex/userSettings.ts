import { authQuery, authMutation } from "./auth";
import { v } from "convex/values";

const defaults = {
  theme: "system",
  language: "en",
  memoryAutoTag: true,
  notificationsEnabled: false,
  extensionAutoSyncEnabled: true,
  extensionSelectionPopupEnabled: true,
  // Memory behavior defaults
  memoryAutoExtract: true,
  memoryConfidenceThreshold: 70,
  // Notification preferences
  notifyMemoryConflicts: true,
  notifyNewMemories: false,
  notifyMemoriesExpiring: true,
} as const;

export const get = authQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (!doc) {
      return {
        _id: null,
        userId: ctx.userId,
        theme: defaults.theme,
        language: defaults.language,
        memoryAutoTag: defaults.memoryAutoTag,
        notificationsEnabled: defaults.notificationsEnabled,
        extensionAutoSyncEnabled: defaults.extensionAutoSyncEnabled,
        extensionSelectionPopupEnabled: defaults.extensionSelectionPopupEnabled,
        memoryAutoExtract: defaults.memoryAutoExtract,
        memoryConfidenceThreshold: defaults.memoryConfidenceThreshold,
        notifyMemoryConflicts: defaults.notifyMemoryConflicts,
        notifyNewMemories: defaults.notifyNewMemories,
        notifyMemoriesExpiring: defaults.notifyMemoriesExpiring,
      };
    }

    return {
      _id: doc._id,
      userId: doc.userId,
      theme: doc.theme ?? defaults.theme,
      language: doc.language ?? defaults.language,
      memoryAutoTag: doc.memoryAutoTag ?? defaults.memoryAutoTag,
      notificationsEnabled:
        doc.notificationsEnabled ?? defaults.notificationsEnabled,
      extensionAutoSyncEnabled:
        doc.extensionAutoSyncEnabled ?? defaults.extensionAutoSyncEnabled,
      extensionSelectionPopupEnabled:
        doc.extensionSelectionPopupEnabled ??
        defaults.extensionSelectionPopupEnabled,
      memoryAutoExtract: doc.memoryAutoExtract ?? defaults.memoryAutoExtract,
      memoryConfidenceThreshold:
        doc.memoryConfidenceThreshold ?? defaults.memoryConfidenceThreshold,
      notifyMemoryConflicts:
        doc.notifyMemoryConflicts ?? defaults.notifyMemoryConflicts,
      notifyNewMemories: doc.notifyNewMemories ?? defaults.notifyNewMemories,
      notifyMemoriesExpiring:
        doc.notifyMemoriesExpiring ?? defaults.notifyMemoriesExpiring,
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
