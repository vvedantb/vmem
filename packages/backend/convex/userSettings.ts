import { authQuery, authMutation } from "./auth";
import { v } from "convex/values";

const defaults = {
  theme: "system",
  language: "en",
  memoryAutoTag: true,
  notificationsEnabled: false,
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    const fields: Record<string, string | boolean> = {};
    if (args.theme !== undefined) fields.theme = args.theme;
    if (args.language !== undefined) fields.language = args.language;
    if (args.memoryAutoTag !== undefined)
      fields.memoryAutoTag = args.memoryAutoTag;
    if (args.notificationsEnabled !== undefined)
      fields.notificationsEnabled = args.notificationsEnabled;

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
