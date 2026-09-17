import { v } from "convex/values";
import { omit } from "convex-helpers";
import { zodToConvex } from "convex-helpers/server/zod";
import {
  memoryStatusSchema,
  memoryTypeSchema,
  temporalKindSchema,
} from "@vmem/sdk";
import { z } from "zod";
import {
  openRouterEndpointSchema,
  openRouterFeatureSchema,
} from "./lib/openRouter/schemas";

export const memoryTypeValidator = zodToConvex(memoryTypeSchema);
export const memoryStatusValidator = zodToConvex(memoryStatusSchema);

// clerk id + optional profile id; tags are stored on the row
export const memoryFields = {
  memoryId: v.string(),
  userId: v.string(),
  profileId: v.optional(v.string()),
  title: v.string(),
  content: v.string(),
  type: memoryTypeValidator,
  source: v.string(),
  confidence: v.number(),
  status: memoryStatusValidator,
  tags: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.optional(v.number()),
  url: v.optional(v.string()),
  contentHash: v.string(),
  sourceType: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  sourceSyncedAt: v.optional(v.number()),
  storageId: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  originalFilename: v.optional(v.string()),
  visitCount: v.number(),
  firstVisitAt: v.number(),
  lastVisitAt: v.number(),
  searchableText: v.optional(v.string()),
  embedding: v.optional(v.array(v.float64())),
  eventStart: v.optional(v.union(v.number(), v.null())),
  eventEnd: v.optional(v.union(v.number(), v.null())),
  temporalKind: v.optional(v.union(zodToConvex(temporalKindSchema), v.null())),
};

export const memoryLinkOriginValidator = v.union(
  v.literal("manual"),
  v.literal("entity"),
  v.literal("extract"),
);

export const memoryLinkFields = {
  userId: v.string(),
  profileId: v.optional(v.string()),
  sourceId: v.string(),
  targetId: v.string(),
  reason: v.string(),
  createdAt: v.number(),
  origin: v.optional(memoryLinkOriginValidator),
};

export const memoryEntityTypeValidator = v.union(
  v.literal("person"),
  v.literal("organization"),
  v.literal("place"),
  v.literal("technology"),
  v.literal("project"),
);

export const memoryEntityFields = {
  userId: v.string(),
  profileId: v.optional(v.string()),
  name: v.string(),
  normalizedName: v.string(),
  type: memoryEntityTypeValidator,
  createdAt: v.number(),
};

export const memoryEntityMentionFields = {
  userId: v.string(),
  profileId: v.optional(v.string()),
  memoryId: v.string(),
  entityId: v.id("memoryEntities"),
  normalizedName: v.string(),
  createdAt: v.number(),
};

export const proposedUpdateKindValidator = v.union(
  v.literal("update"),
  v.literal("delete"),
  v.literal("insight"),
  v.literal("connection"),
  v.literal("contradiction"),
  v.literal("anomaly"),
  v.literal("merge"),
);

export const proposedUpdateStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

export const proposedUpdateSourceValidator = v.union(
  v.literal("v2-extraction"),
  v.literal("dream-mode"),
);

const proposedMemorySnapshotFields = {
  title: v.string(),
  content: v.string(),
};

const proposedSourceSnapshotFields = {
  id: v.string(),
  title: v.string(),
  content: v.string(),
};

export const proposedUpdateFields = {
  proposalId: v.string(),
  userId: v.string(),
  profileId: v.optional(v.string()),
  memoryId: v.string(),
  proposedContent: v.string(),
  proposedTitle: v.optional(v.string()),
  reason: v.string(),
  kind: proposedUpdateKindValidator,
  status: proposedUpdateStatusValidator,
  createdAt: v.number(),
  resolvedAt: v.optional(v.number()),
  sourceMemoryIds: v.array(v.string()),
  confidence: v.optional(v.number()),
  source: proposedUpdateSourceValidator,
  memorySnapshot: v.optional(v.object(proposedMemorySnapshotFields)),
  sourceMemorySnapshots: v.array(v.object(proposedSourceSnapshotFields)),
};

// table field validators, used in schema.ts and return validators
export const profileFields = {
  userId: v.id("users"),
  name: v.string(),
  color: v.string(), // hex e.g. "#3B82F6"
  icon: v.string(), // icon name e.g. "briefcase"
  isDefault: v.boolean(),
  teamId: v.optional(v.id("teams")),
  createdAt: v.number(),
  updatedAt: v.number(),
  dreamModeAutoAccept: v.optional(v.boolean()),
  lastDreamRunAt: v.optional(v.number()),
  dreamModeScheduleEnabled: v.optional(v.boolean()),
  dreamModeScheduleTime: v.optional(v.string()),
  dreamPortrait: v.optional(v.string()),
  dreamPortraitUpdatedAt: v.optional(v.number()),
  dreamPortraitSources: v.optional(v.array(v.string())),
};

export const dreamTriggerStateFields = {
  userId: v.id("users"),
  newMemoryCount: v.number(),
  lastWriteAt: v.number(),
  checkPending: v.boolean(),
  lastAutoRunAt: v.optional(v.number()),
  runsToday: v.number(),
  dayKey: v.string(),
};

export const notificationTypeValidator = zodToConvex(
  z.enum(["success", "warning", "error", "info"]),
);

export const notificationFields = {
  userId: v.id("users"),
  title: v.string(),
  description: v.string(),
  type: notificationTypeValidator,
  read: v.boolean(),
  createdAt: v.number(),
};

export const apiKeyStatusValidator = v.union(
  v.literal("active"),
  v.literal("revoked"),
);

export const apiKeyFields = {
  userId: v.id("users"),
  name: v.string(),
  maskedKey: v.string(),
  keyHash: v.string(),
  encryptedKey: v.string(),
  status: apiKeyStatusValidator,
  requestCount: v.number(),
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
};

export const connectorProviderValidator = v.union(
  v.literal("google_drive"),
  v.literal("notion"),
);

export const connectorConnectionStatusValidator = v.union(
  v.literal("connected"),
  v.literal("disconnected"),
);

export const connectorSyncStatusValidator = v.union(
  v.literal("idle"),
  v.literal("syncing"),
  v.literal("error"),
);

export const connectorFields = {
  userId: v.id("users"),
  name: v.string(),
  description: v.string(),
  icon: v.string(),
  provider: v.optional(connectorProviderValidator),
  connectionStatus: connectorConnectionStatusValidator,
  syncStatus: connectorSyncStatusValidator,
  lastSyncAt: v.optional(v.number()),
  syncStartedAt: v.optional(v.number()),
  syncProgress: v.number(),
  itemsSynced: v.number(),
  errorMessage: v.optional(v.string()),
};

export const userSettingsThemeValidator = v.union(
  v.literal("light"),
  v.literal("dark"),
  v.literal("system"),
);

export const defaultProfilesFields = {
  web: v.optional(v.id("profiles")),
  extension: v.optional(v.id("profiles")),
  mcp: v.optional(v.id("profiles")),
  mcpTeam: v.optional(v.id("profiles")),
};

export const userSettingsFields = {
  userId: v.id("users"),
  theme: v.optional(userSettingsThemeValidator),
  language: v.optional(v.string()),
  memoryAutoTag: v.optional(v.boolean()),
  notificationsEnabled: v.optional(v.boolean()),
  extensionAutoSyncEnabled: v.optional(v.boolean()),
  extensionAutoSyncIntervalMinutes: v.optional(v.number()),
  extensionSelectionPopupEnabled: v.optional(v.boolean()),
  memoryAutoExtract: v.optional(v.boolean()),
  memoryConfidenceThreshold: v.optional(v.number()),
  notifyMemoryConflicts: v.optional(v.boolean()),
  notifyNewMemories: v.optional(v.boolean()),
  notifyMemoriesExpiring: v.optional(v.boolean()),
  aboutMe: v.optional(v.string()),
  preferences: v.optional(v.string()),
  defaultProfiles: v.optional(v.object(defaultProfilesFields)),
  dreamModeAutoAccept: v.optional(v.boolean()),
  dreamModeScheduleEnabled: v.optional(v.boolean()),
  dreamModeScheduleTime: v.optional(v.string()),
  dreamModeAutomatic: v.optional(v.boolean()),
  lastDreamRunAt: v.optional(v.number()),
};

export const userSettingsPatchFields = omit(userSettingsFields, [
  "userId",
  "defaultProfiles",
  "dreamModeScheduleEnabled",
  "dreamModeScheduleTime",
  "lastDreamRunAt",
]);

export const oauthStateFields = {
  state: v.string(),
  userId: v.id("users"),
  returnUrl: v.string(),
  expiresAt: v.number(),
  connectorId: v.optional(v.id("connectors")),
  provider: v.optional(v.string()),
  // google pkce verifier, required for google code exchange
  codeVerifier: v.optional(v.string()),
};

export const oauthStatePayloadFields = omit(oauthStateFields, ["state"]);

export const contextPromptCacheFields = {
  userId: v.id("users"),
  content: v.string(),
  generatedAt: v.number(),
  memoryCountAtGeneration: v.number(),
  pendingRegeneration: v.boolean(),
};

export const contextPromptCacheContentFields = omit(contextPromptCacheFields, [
  "userId",
]);

export const teamFields = {
  name: v.string(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const teamMemberFields = {
  teamId: v.id("teams"),
  userId: v.id("users"),
  role: v.union(v.literal("owner"), v.literal("member")),
  joinedAt: v.number(),
};

export const skillFields = {
  userId: v.id("users"),
  teamId: v.optional(v.id("teams")),
  name: v.string(),
  description: v.string(),
  instructions: v.string(),
  enabled: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const skillVersionFields = {
  skillId: v.id("skills"),
  name: v.string(),
  description: v.string(),
  instructions: v.string(),
  enabled: v.optional(v.boolean()),
  authorUserId: v.id("users"),
  source: v.union(v.literal("web"), v.literal("mcp")),
  createdAt: v.number(),
};

export const userEnvVarFields = {
  userId: v.id("users"),
  vars: v.array(
    v.object({
      key: v.string(),
      value: v.string(),
    }),
  ),
  updatedAt: v.number(),
};

export const openRouterLogRecordFields = {
  userId: v.id("users"),
  profileId: v.optional(v.string()),
  feature: zodToConvex(openRouterFeatureSchema),
  endpoint: zodToConvex(openRouterEndpointSchema),
  model: v.string(),
  errorMessage: v.optional(v.string()),
  generationId: v.optional(v.string()),
  provider: v.optional(v.string()),
  finishReason: v.optional(v.string()),
  nativeFinishReason: v.optional(v.string()),
  promptTokens: v.optional(v.number()),
  completionTokens: v.optional(v.number()),
  totalTokens: v.optional(v.number()),
  cachedTokens: v.optional(v.number()),
  cacheWriteTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  costUsd: v.optional(v.number()),
  upstreamCostUsd: v.optional(v.number()),
  isByok: v.optional(v.boolean()),
  promptPreview: v.optional(v.string()),
  completionPreview: v.optional(v.string()),
};

export const openRouterLogFields = {
  ...openRouterLogRecordFields,
  profileId: v.optional(v.id("profiles")),
  teamId: v.optional(v.id("teams")),
  createdAt: v.number(),
};

export const wikiNodeFields = {
  userId: v.id("users"),
  teamId: v.optional(v.id("teams")),
  parentId: v.optional(v.id("wikiNodes")),
  kind: v.union(
    v.literal("folder"),
    v.literal("document"),
    v.literal("artifact"),
  ),
  title: v.string(),
  content: v.optional(v.string()),
  contentText: v.optional(v.string()),
  // artifact source language (html | svg | tsx | sql | …). absent on folders/docs
  language: v.optional(v.string()),
  order: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const wikiNodeVersionFields = {
  nodeId: v.id("wikiNodes"),
  title: v.string(),
  content: v.string(),
  contentText: v.string(),
  language: v.optional(v.string()),
  authorUserId: v.id("users"),
  source: v.union(v.literal("web"), v.literal("mcp")),
  createdAt: v.number(),
};

export const fileNodeFields = {
  userId: v.id("users"),
  teamId: v.optional(v.id("teams")),
  parentId: v.optional(v.id("fileNodes")),
  kind: v.union(v.literal("folder"), v.literal("file")),
  name: v.string(),
  mimeType: v.optional(v.string()),
  size: v.optional(v.number()),
  storageId: v.optional(v.id("_storage")),
  memoryId: v.optional(v.string()),
  indexStatus: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("indexed"),
      v.literal("skipped"),
      v.literal("failed"),
    ),
  ),
  indexedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const systemSkillFields = {
  name: v.string(),
  description: v.string(),
  instructions: v.string(),
  category: v.optional(v.string()),
  published: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const userSystemSkillFields = {
  userId: v.id("users"),
  // personal when absent. team workspace install when set (shared with members)
  teamId: v.optional(v.id("teams")),
  systemSkillId: v.id("systemSkills"),
  enabled: v.boolean(),
  installedAt: v.number(),
};

/**
 * Single source of truth for presentationSessions table fields.
 *
 * One live "share" of the `/slides` deck. The presenter is the sole driver:
 * only the browser holding the secret `hostKey` may write `slide`. Viewers are
 * anonymous — they subscribe to the row (`getSession`) and either follow
 * `slide` live or detach to browse on their own. Ephemeral — pruned daily once
 * `ended` or idle past 24h (see `presentations.pruneStaleInternal`).
 */
export const presentationSessionFields = {
  /** Short, URL-friendly share code (the `?session=` value). */
  code: v.string(),
  /** Secret driver token — returned once from `createSession`, kept only in
   *  the presenter's localStorage. Required to `setSlide` / `stopSharing`. */
  hostKey: v.string(),
  /** Current 1-based slide the presenter is on. */
  slide: v.number(),
  status: v.union(v.literal("live"), v.literal("ended")),
  /** Bumped on every slide change; drives the idle-prune window. */
  lastActiveAt: v.number(),
};

/**
 * Single source of truth for presentationVotes table fields.
 *
 * One row per participant per poll within a share session — re-voting replaces
 * the row's `optionId`, so a tally never double-counts. `participantKey` is a
 * client-minted UUID in localStorage; `pollId` is the curated poll slide's
 * stable id. Votes are scoped to the session `code`, so each run tallies fresh
 * and they are dropped with the session on prune.
 */
export const presentationVoteFields = {
  code: v.string(),
  pollId: v.string(),
  participantKey: v.string(),
  optionId: v.string(),
};
