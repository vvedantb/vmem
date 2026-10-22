import { authQuery, authMutation } from "./auth";
import {
  internalQuery,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import type { Infer, ObjectType } from "convex/values";
import {
  CONFIDENCE_THRESHOLD_MAX,
  CONFIDENCE_THRESHOLD_MIN,
  MAX_SYNC_INTERVAL_MINUTES,
  MIN_SYNC_INTERVAL_MINUTES,
  SETTINGS_TEXT_MAX_LENGTH,
} from "@vmem/shared";
import {
  mcpScopeValidator,
  requireProfileForMcpScope,
  setMcpDefaultProfileForScope,
} from "./profiles/mcpAccess";
import { getMembershipOrNull } from "./teams/auth";
import { userFacingError } from "./lib/userFacingError";
import { getUserIdByClerkId } from "./lib/clerkUser";
import { readOpenRouterApiKey } from "./lib/openRouterKey";
import {
  experimentalFlagKeyValidator,
  resolvedExperimentalFlagsValidator,
  userSettingsPatchFields,
  type userSettingsThemeValidator,
} from "./validators";
import {
  resolveExperimentalFlags,
  type ExperimentalFlagKey,
} from "./experimentalFlags";

type ThemeValue = Infer<typeof userSettingsThemeValidator>;
type DefaultProfilesValue = Doc<"userSettings">["defaultProfiles"] | null;

// the nightly AI judge is on by default only where the deployment has a key
function dreamModeUseAiOf(doc: Doc<"userSettings"> | null): boolean {
  return doc?.dreamModeUseAi ?? readOpenRouterApiKey() !== undefined;
}

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
  dreamModeAutomatic: boolean;
  dreamModeDecay: boolean;
  lastDreamRunAt: number | null;
  rollupsEnabled: boolean;
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
  // nightly dreaming and its decay step are on by default
  dreamModeAutomatic: true,
  dreamModeDecay: true,
  lastDreamRunAt: null,
  rollupsEnabled: false,
};

export async function getSettingsDoc(
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
    dreamModeAutomatic: doc?.dreamModeAutomatic ?? defaults.dreamModeAutomatic,
    dreamModeDecay: doc?.dreamModeDecay ?? defaults.dreamModeDecay,
    dreamModeUseAi: dreamModeUseAiOf(doc),
    lastDreamRunAt: doc?.lastDreamRunAt ?? defaults.lastDreamRunAt,
    rollupsEnabled: doc?.rollupsEnabled ?? defaults.rollupsEnabled,
  };
}

export const get = authQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await getSettingsDoc(ctx, ctx.userId);
    return resolveSettings(ctx.userId, doc);
  },
});

// MCP settings_get: the same resolved settings plus the experimental flags
export const getByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const doc = await getSettingsDoc(ctx, userId);
    return {
      ...resolveSettings(userId, doc),
      experimentalFlags: resolveExperimentalFlags(doc),
    };
  },
});

/**
 * All experimental opt-in flags for the current user. Missing / unset keys are
 * false.
 */
export const getExperimentalFlags = authQuery({
  args: {},
  returns: resolvedExperimentalFlagsValidator,
  handler: async (ctx) => {
    const doc = await getSettingsDoc(ctx, ctx.userId);
    return resolveExperimentalFlags(doc);
  },
});

/** Updates one experimental flag on the current user. */
export const setExperimentalFlag = authMutation({
  args: {
    key: experimentalFlagKeyValidator,
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) =>
    setExperimentalFlagForUser(ctx, ctx.userId, args.key, args.enabled),
});

async function setExperimentalFlagForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  key: ExperimentalFlagKey,
  enabled: boolean,
): Promise<null> {
  const existing = await getSettingsDoc(ctx, userId);
  const experimentalFlags = {
    ...existing?.experimentalFlags,
    [key]: enabled,
  };

  if (existing) {
    await ctx.db.patch(existing._id, { experimentalFlags });
    return null;
  }

  await ctx.db.insert("userSettings", { userId, experimentalFlags });
  return null;
}

export const setExperimentalFlagByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    key: experimentalFlagKeyValidator,
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) =>
    setExperimentalFlagForUser(
      ctx,
      await getUserIdByClerkId(ctx, args.clerkId),
      args.key,
      args.enabled,
    ),
});

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

type UserSettingsPatch = ObjectType<typeof userSettingsPatchFields>;

function assertIntegerInRange(
  label: string,
  value: number | undefined,
  min: number,
  max: number,
): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < min || value > max) {
    userFacingError(`${label} must be a whole number from ${min} to ${max}`);
  }
}

// the limits the settings UIs enforce, checked for every client
function assertSettingsPatchLimits(patch: UserSettingsPatch): void {
  for (const [label, text] of [
    ["About me", patch.aboutMe],
    ["Preferences", patch.preferences],
  ] as const) {
    if (text !== undefined && text.length > SETTINGS_TEXT_MAX_LENGTH) {
      userFacingError(
        `${label} must be at most ${SETTINGS_TEXT_MAX_LENGTH} characters`,
      );
    }
  }
  assertIntegerInRange(
    "Confidence threshold",
    patch.memoryConfidenceThreshold,
    CONFIDENCE_THRESHOLD_MIN,
    CONFIDENCE_THRESHOLD_MAX,
  );
  assertIntegerInRange(
    "Sync interval",
    patch.extensionAutoSyncIntervalMinutes,
    MIN_SYNC_INTERVAL_MINUTES,
    MAX_SYNC_INTERVAL_MINUTES,
  );
}

async function updateSettingsForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: UserSettingsPatch,
): Promise<Id<"userSettings">> {
  assertSettingsPatchLimits(args);
  const existing = await getSettingsDoc(ctx, userId);

  // args is exactly userSettingsPatchFields, so its own keys already are the patchable fields, no separate key list to keep in sync
  const fields: Record<string, string | boolean | number> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) {
      fields[key] = value;
    }
  }

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }

  return await ctx.db.insert("userSettings", { userId, ...args });
}

export const update = authMutation({
  args: userSettingsPatchFields,
  handler: async (ctx, args) => updateSettingsForUser(ctx, ctx.userId, args),
});

export const updateByClerkIdInternal = internalMutation({
  args: { clerkId: v.string(), patch: v.object(userSettingsPatchFields) },
  handler: async (ctx, args) =>
    updateSettingsForUser(
      ctx,
      await getUserIdByClerkId(ctx, args.clerkId),
      args.patch,
    ),
});

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

// the settings nightly and manual dreaming read
export function dreamSettingsOf(doc: Doc<"userSettings"> | null): {
  automatic: boolean;
  decay: boolean;
  useAi: boolean;
  autoAccept: boolean;
  lastDreamRunAt: number | null;
} {
  return {
    automatic: doc?.dreamModeAutomatic ?? defaults.dreamModeAutomatic,
    decay: doc?.dreamModeDecay ?? defaults.dreamModeDecay,
    useAi: dreamModeUseAiOf(doc),
    autoAccept: doc?.dreamModeAutoAccept ?? defaults.dreamModeAutoAccept,
    lastDreamRunAt: doc?.lastDreamRunAt ?? defaults.lastDreamRunAt,
  };
}

export const getRollupsEnabledInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const doc = await getSettingsDoc(ctx, args.userId);
    return doc?.rollupsEnabled ?? defaults.rollupsEnabled;
  },
});

// rollups opt-in for one user, by clerk id or user id (users set it with
// userSettings.update from Settings › Preferences):
//   npx convex run userSettings:setRollupsEnabledInternal '{"clerkId":"user_…","enabled":true}'
export const setRollupsEnabledInternal = internalMutation({
  args: {
    clerkId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId =
      args.userId ??
      (args.clerkId === undefined
        ? null
        : await getUserIdByClerkId(ctx, args.clerkId));
    if (userId === null || (await ctx.db.get(userId)) === null) {
      throw new Error("User not found");
    }
    const existing = await getSettingsDoc(ctx, userId);
    if (existing) {
      await ctx.db.patch(existing._id, { rollupsEnabled: args.enabled });
      return null;
    }
    await ctx.db.insert("userSettings", {
      userId,
      rollupsEnabled: args.enabled,
    });
    return null;
  },
});

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

const defaultProfileSourceValidator = v.union(
  v.literal("web"),
  v.literal("extension"),
  v.literal("mcp"),
);

async function setDefaultProfileForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    source: Infer<typeof defaultProfileSourceValidator>;
    profileId: Id<"profiles">;
  },
): Promise<Id<"userSettings">> {
  const profile = await ctx.db.get(args.profileId);
  if (!profile) {
    userFacingError("Profile not found");
  }
  if (profile.teamId) {
    const membership = await getMembershipOrNull(ctx, profile.teamId, userId);
    if (!membership) {
      userFacingError("Profile not found");
    }
  } else if (profile.userId !== userId) {
    userFacingError("Profile not found");
  }

  const existing = await getSettingsDoc(ctx, userId);
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
    userId,
    defaultProfiles: updatedDefaults,
  });
}

export const setDefaultProfile = authMutation({
  args: {
    source: defaultProfileSourceValidator,
    profileId: v.id("profiles"),
  },
  handler: async (ctx, args) => setDefaultProfileForUser(ctx, ctx.userId, args),
});

// MCP set_active_profile source web / extension; the profile must also be
// visible on the calling connector
export const setDefaultProfileByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    scope: mcpScopeValidator,
    source: v.union(v.literal("web"), v.literal("extension")),
    profileId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfileForMcpScope(
      ctx,
      args.clerkId,
      args.scope,
      args.profileId,
    );
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    await setDefaultProfileForUser(ctx, userId, {
      source: args.source,
      profileId: profile._id,
    });
    return null;
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
