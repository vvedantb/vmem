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
  eventStart: v.optional(v.union(v.number(), v.null())),
  eventEnd: v.optional(v.union(v.number(), v.null())),
  temporalKind: v.optional(v.union(zodToConvex(temporalKindSchema), v.null())),
  // usefulness ranking (see engine/memory/usefulness.ts); all optional
  usefulnessScore: v.optional(v.number()),
  usefulnessScoredAt: v.optional(v.number()),
  usefulnessJevScore: v.optional(v.number()),
  usefulnessJevAt: v.optional(v.number()),
  usefulnessContentHash: v.optional(v.string()),
  usefulnessNeedsJev: v.optional(v.boolean()),
  usefulnessJevPriority: v.optional(v.number()),
  usefulnessJevAttempts: v.optional(v.number()),
  // legacy counters: no longer written, copied into memoryUsage by backfill
  usefulnessRetrieveHits: v.optional(v.number()),
  usefulnessSearchHits: v.optional(v.number()),
  usefulnessContextPackHits: v.optional(v.number()),
  usefulnessEditCount: v.optional(v.number()),
};

// "search" means a result open (get / palette select), not a typeahead query.
export const memoryAccessKindValidator = v.union(
  v.literal("retrieve"),
  v.literal("search"),
  v.literal("contextPack"),
);

// Pending access hits. One row per memory and kind, `count` incremented on
// enqueue (absent on legacy rows = 1). Folded into memoryUsage in batches so a
// retrieve never writes to memory rows.
export const memoryAccessPendingFields = {
  memoryId: v.string(),
  kind: memoryAccessKindValidator,
  createdAt: v.number(),
  count: v.optional(v.number()),
};

// Access counters, split out of `memories` so a flush does not rewrite the
// memory row (search index, list subscriptions). One row per memory.
export const memoryUsageFields = {
  memoryId: v.string(),
  retrieveHits: v.number(),
  searchHits: v.number(),
  contextPackHits: v.number(),
  lastAccessedAt: v.number(),
};

// Vector payload split out of `memories`: a 1536-dim float64 array is ~85% of a
// memory row's bytes, and every list/stats/dream walk of `memories` was billed
// for it. One row per memory, keyed by `memoryDocId`. userId/profileId are
// copied from the memory so the vector index can filter on scope.
export const memoryEmbeddingFields = {
  memoryDocId: v.id("memories"),
  userId: v.string(),
  profileId: v.optional(v.string()),
  embedding: v.array(v.float64()),
};

export const memoryStatKindValidator = v.union(
  v.literal("total"),
  v.literal("day"),
  v.literal("tag"),
);

// Incrementally maintained dashboard counters. One row per
// (userId, profileId, kind, key, shard); `key` is "" for totals, the UTC ISO
// date for days and the tag for tags. Shards spread concurrent writers so a
// bulk import does not serialise on a single counter row.
export const memoryStatCounterFields = {
  userId: v.string(),
  profileId: v.optional(v.string()),
  kind: memoryStatKindValidator,
  key: v.string(),
  shard: v.number(),
  count: v.number(),
};

// Single row. Counters only track a memory once it is covered: docs created
// after `trackingSince` are tracked live, older docs once the backfill has
// passed them (`backfilledThrough`), and everything once `ready`.
export const memoryStatsMetaFields = {
  trackingSince: v.number(),
  backfilledThrough: v.number(),
  ready: v.boolean(),
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
  v.literal("gmail"),
  v.literal("figma"),
  v.literal("github"),
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

/** Known per-user experimental opt-in keys (settings → Experimental). */
export const experimentalFlagKeyValidator = v.union(
  v.literal("disablePageMotion"),
);

/** Stored shape on `userSettings.experimentalFlags` — missing key means off. */
export const experimentalFlagsFields = {
  disablePageMotion: v.optional(v.boolean()),
};

export const experimentalFlagsValidator = v.object(experimentalFlagsFields);

/** Fully resolved flags for clients (every key present, default false). */
export const resolvedExperimentalFlagsValidator = v.object({
  disablePageMotion: v.boolean(),
});

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
  experimentalFlags: v.optional(experimentalFlagsValidator),
};

export const userSettingsPatchFields = omit(userSettingsFields, [
  "userId",
  "defaultProfiles",
  "dreamModeScheduleEnabled",
  "dreamModeScheduleTime",
  "lastDreamRunAt",
  "experimentalFlags",
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

export const skillOriginValidator = v.union(
  v.literal("web"),
  v.literal("mcp"),
  v.literal("vibot"),
);

export const skillFields = {
  userId: v.id("users"),
  teamId: v.optional(v.id("teams")),
  name: v.string(),
  description: v.string(),
  instructions: v.string(),
  enabled: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
  origin: v.optional(skillOriginValidator),
};

export const skillImportItemValidator = v.object({
  name: v.string(),
  description: v.string(),
  instructions: v.string(),
});

export const skillImportResultValidator = v.object({
  created: v.number(),
  updated: v.number(),
  skipped: v.number(),
  names: v.array(v.string()),
});

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
  // true until the scheduled drain has folded the row into the aggregates
  aggregatePending: v.optional(v.boolean()),
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

// slim memory row for lists: preview instead of content
export const memorySummaryValidator = v.object({
  id: v.string(),
  title: v.string(),
  preview: v.string(),
  type: memoryTypeValidator,
  status: memoryStatusValidator,
  source: v.string(),
  sourceUrl: v.union(v.string(), v.null()),
  sourceSyncedAt: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  profileId: v.union(v.string(), v.null()),
  usefulnessScore: v.optional(v.union(v.number(), v.null())),
});

export const memorySummaryFilterFields = {
  type: v.optional(v.string()),
  source: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  searchQuery: v.optional(v.string()),
};
