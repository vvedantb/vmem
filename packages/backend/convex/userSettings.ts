import { authQuery, authMutation } from "./auth";
import {
  internalQuery,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import {
  mcpScopeValidator,
  setMcpDefaultProfileForScope,
} from "./profiles/mcpAccess";
import {
  userSettingsPatchFields,
  userSettingsThemeValidator,
} from "./validators";

type ThemeValue = Infer<typeof userSettingsThemeValidator>;
type DefaultProfilesValue = Doc<"userSettings">["defaultProfiles"] | null;

const defaults: {
  theme: ThemeValue;
  language: string;
  memoryAutoTag: boolean;
  notificationsEnabled: boolean;
  extensionAutoSyncEnabled: boolean;
  extensionAutoSyncIntervalMinutes: number;
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
  dreamModeAutomatic: boolean;
  lastDreamRunAt: number | null;
} = {
  theme: "system",
  language: "en",
  memoryAutoTag: true,
  notificationsEnabled: false,
  extensionAutoSyncEnabled: true,
  extensionAutoSyncIntervalMinutes: 30,
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
  // dynamic Dreaming is on by default — soft-fails without an API key
  dreamModeAutomatic: true,
  lastDreamRunAt: null,
};

async function getSettingsDoc(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"userSettings"> | null> {
  return await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

function resolveSettings(userId: Id<"users">, doc: Doc<"userSettings"> | null) {
  return {
    _id: doc?._id ?? null,
    userId,
    theme: doc?.theme ?? defaults.theme,
    language: doc?.language ?? defaults.language,
    memoryAutoTag: doc?.memoryAutoTag ?? defaults.memoryAutoTag,
    notificationsEnabled:
      doc?.notificationsEnabled ?? defaults.notificationsEnabled,
    extensionAutoSyncEnabled:
      doc?.extensionAutoSyncEnabled ?? defaults.extensionAutoSyncEnabled,
    extensionAutoSyncIntervalMinutes:
      doc?.extensionAutoSyncIntervalMinutes ??
      defaults.extensionAutoSyncIntervalMinutes,
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
    dreamModeAutomatic: doc?.dreamModeAutomatic ?? defaults.dreamModeAutomatic,
    lastDreamRunAt: doc?.lastDreamRunAt ?? defaults.lastDreamRunAt,
  };
}

export const get = authQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await getSettingsDoc(ctx, ctx.userId);
    return resolveSettings(ctx.userId, doc);
  },
});

// internal query used by actions to fetch the user-provided context (About Me /
export const getUserContextInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    aboutMe: v.union(v.string(), v.null()),
    preferences: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const doc = await getSettingsDoc(ctx, args.userId);
    const aboutMe = doc?.aboutMe?.trim();
    const preferences = doc?.preferences?.trim();
    return {
      aboutMe: aboutMe ? aboutMe : null,
      preferences: preferences ? preferences : null,
    };
  },
});

export const update = authMutation({
  args: userSettingsPatchFields,
  handler: async (ctx, args) => {
    const existing = await getSettingsDoc(ctx, ctx.userId);

    const fields: Record<string, string | boolean | number> = {};
    const optionalKeys = [
      "theme",
      "language",
      "memoryAutoTag",
      "notificationsEnabled",
      "extensionAutoSyncEnabled",
      "extensionAutoSyncIntervalMinutes",
      "extensionSelectionPopupEnabled",
      "memoryAutoExtract",
      "memoryConfidenceThreshold",
      "notifyMemoryConflicts",
      "notifyNewMemories",
      "notifyMemoriesExpiring",
      "aboutMe",
      "preferences",
      "dreamModeAutoAccept",
      "dreamModeAutomatic",
    ] as const;

    for (const key of optionalKeys) {
      const value = args[key];
      if (value !== undefined) {
        fields[key] = value;
      }
    }

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

// internal: stamp `lastDreamRunAt` on the user's settings row
export const setLastDreamRunAtInternal = internalMutation({
  args: {
    userId: v.id("users"),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await getSettingsDoc(ctx, args.userId);
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

// internal: read the user's Dream Mode config (auto-accept + last run)
export const getDreamConfigInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    dreamModeAutoAccept: v.boolean(),
    lastDreamRunAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const doc = await getSettingsDoc(ctx, args.userId);
    return {
      dreamModeAutoAccept: doc?.dreamModeAutoAccept ?? false,
      lastDreamRunAt: doc?.lastDreamRunAt ?? null,
    };
  },
});

// get default profile for a specific source (web, extension, or mcp)
export const getDefaultProfile = authQuery({
  args: {
    source: v.union(v.literal("web"), v.literal("extension"), v.literal("mcp")),
  },
  handler: async (ctx, args) => {
    const doc = await getSettingsDoc(ctx, ctx.userId);
    if (!doc?.defaultProfiles) return null;
    return doc.defaultProfiles[args.source] ?? null;
  },
});

// set default profile for a specific source
export const setDefaultProfile = authMutation({
  args: {
    source: v.union(v.literal("web"), v.literal("extension"), v.literal("mcp")),
    profileId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    // verify profile belongs to user
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.userId !== ctx.userId) {
      throw new Error("Profile not found");
    }

    const existing = await getSettingsDoc(ctx, ctx.userId);
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

export const setMcpDefaultProfileByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
    scope: mcpScopeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setMcpDefaultProfileForScope(
      ctx,
      args.clerkId,
      args.profileId,
      args.scope,
    );
    return null;
  },
});
