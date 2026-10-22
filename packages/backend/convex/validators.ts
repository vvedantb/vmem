import { v } from "convex/values";
import { omit } from "convex-helpers";
import { zodToConvex } from "convex-helpers/server/zod";
import {
  memoryStatusSchema,
  memoryTypeSchema,
  memoryWithTagsSchema,
  temporalKindSchema,
} from "@vmem/sdk";
import { z } from "zod";
import {
  openRouterEndpointSchema,
  openRouterFeatureSchema,
} from "./lib/openRouter/schemas";

export const memoryTypeValidator = zodToConvex(memoryTypeSchema);
export const memoryStatusValidator = zodToConvex(memoryStatusSchema);
export const memoryWithTagsValidator = zodToConvex(memoryWithTagsSchema);
export const memoryListResultValidator = v.object({
  memories: v.array(memoryWithTagsValidator),
  total: v.number(),
});

const dreamSuppressedByValidator = v.union(
  v.literal("dream"),
  v.literal("dream-decay"),
  v.literal("dream-ai"),
);

// clerk id + optional profile id; tags are stored on the row
export const memoryFields = {
  memoryId: v.string(),
  userId: v.string(),
  profileId: v.optional(v.string()),
  title: v.string(),
  content: v.string(),
  type: memoryTypeValidator,
  source: v.string(),
  // every source that wrote this exact content (hash dedupe), capped
  sources: v.optional(v.array(v.string())),
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
  // dream suppression (status "suppressed"); unset on manual suppression
  mergedInto: v.optional(v.id("memories")),
  suppressedBy: v.optional(dreamSuppressedByValidator),
  suppressedRunId: v.optional(v.id("dreamRuns")),
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
  // AI-judged dream merge or update: approving suppresses under this run
  // (undo for 30 days) instead of writing a new memory
  dreamRunId: v.optional(v.id("dreamRuns")),
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
  // deprecated: the per-profile dream schedule is gone (nightly run). Kept
  // until dreamMigrations.clearDreamScheduleFields has cleared prod rows.
  dreamModeScheduleEnabled: v.optional(v.boolean()),
  dreamModeScheduleTime: v.optional(v.string()),
  dreamPortrait: v.optional(v.string()),
  dreamPortraitUpdatedAt: v.optional(v.number()),
  dreamPortraitSources: v.optional(v.array(v.string())),
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
  // deprecated: see profileFields
  dreamModeScheduleEnabled: v.optional(v.boolean()),
  dreamModeScheduleTime: v.optional(v.string()),
  // nightly dreaming on (default true)
  dreamModeAutomatic: v.optional(v.boolean()),
  // nightly archive of stale browsing history, bookmarks, desktop (default true)
  dreamModeDecay: v.optional(v.boolean()),
  // nightly AI judge for near-duplicates and conflicts (default on when the
  // deployment has AI_GATEWAY_API_KEY)
  dreamModeUseAi: v.optional(v.boolean()),
  lastDreamRunAt: v.optional(v.number()),
  experimentalFlags: v.optional(experimentalFlagsValidator),
  // nightly rollups opt-in (Settings › Preferences)
  rollupsEnabled: v.optional(v.boolean()),
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

// rows past OPENROUTER_LOG_RETENTION_DAYS are purged (openRouterLogs.purgeExpired)
export const openRouterLogFields = {
  ...openRouterLogRecordFields,
  profileId: v.optional(v.id("profiles")),
  teamId: v.optional(v.id("teams")),
  createdAt: v.number(),
  // true until the scheduled drain has folded the row into the aggregates
  aggregatePending: v.optional(v.boolean()),
};

// one row per MCP tool call or resource read, kept 7 days (mcpTraces.purgeExpired)
export const mcpTraceFields = {
  userId: v.id("users"),
  profileId: v.optional(v.id("profiles")),
  teamId: v.optional(v.id("teams")),
  scope: v.union(v.literal("personal"), v.literal("team")),
  // tool name, or resource:<uri> for resource reads
  tool: v.string(),
  ok: v.boolean(),
  durationMs: v.number(),
  summary: v.string(),
  resultCount: v.optional(v.number()),
  createdAt: v.number(),
};

export const rollupPeriodValidator = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
);

// one summary per user, profile and UTC period. periodKey: 2026-10-19,
// 2026-W42 (ISO week) or 2026-10. failed/skipped rows keep empty text.
export const rollupFields = {
  userId: v.id("users"),
  profileId: v.optional(v.id("profiles")),
  teamId: v.optional(v.id("teams")),
  period: rollupPeriodValidator,
  periodKey: v.string(),
  startMs: v.number(),
  endMs: v.number(),
  summary: v.string(),
  highlights: v.array(v.string()),
  memoryIds: v.array(v.string()),
  stats: v.object({
    created: v.number(),
    updated: v.number(),
    suppressed: v.number(),
    toolCalls: v.number(),
  }),
  model: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  costUsd: v.number(),
  createdAt: v.number(),
  status: v.union(v.literal("ok"), v.literal("skipped"), v.literal("failed")),
};

const dreamPlanRuleValidator = v.union(
  v.literal("exact"),
  v.literal("key"),
  v.literal("jev"),
);

const dreamCleanupCountsFields = {
  scannedRows: v.number(),
  // dry run, rules A/B: groups by the rules that fired
  exactGroups: v.number(),
  keyGroups: v.number(),
  bothGroups: v.number(),
  groups: v.number(),
  rowsToSuppress: v.number(),
  // dry run, rule J (Jev): candidate groups found, then their verdicts
  aiCandidates: v.number(),
  aiNotDuplicate: v.number(),
  aiErrors: v.number(),
  aiSkipped: v.number(),
  // calls whose cost the gateway did not report
  aiCostUnknown: v.number(),
  aiStopReason: v.optional(
    v.union(v.literal("no_key"), v.literal("cap"), v.literal("budget")),
  ),
  // apply: groups left alone because a row changed since the plan
  skippedChanged: v.number(),
};

// one dreaming pass (nightly, manual or the one-off backfill) per user and
// profile. `sample` holds the top groups for review: at most 50, each with at
// most 20 memory ids (the writer caps both).
export const dreamRunFields = {
  userId: v.id("users"),
  profileId: v.optional(v.id("profiles")),
  trigger: v.union(
    v.literal("nightly"),
    v.literal("manual"),
    v.literal("backfill"),
  ),
  dryRun: v.boolean(),
  status: v.union(
    v.literal("running"),
    v.literal("ok"),
    v.literal("partial"),
    v.literal("failed"),
  ),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  counts: v.object({
    exactMerged: v.number(),
    keyMerged: v.number(),
    nearDupMerged: v.number(),
    superseded: v.number(),
    proposals: v.number(),
    expired: v.number(),
    archived: v.number(),
    aiFlagged: v.number(),
  }),
  aiCalls: v.number(),
  costUsd: v.number(),
  error: v.optional(v.string()),
  sample: v.optional(
    v.array(
      v.object({
        rule: v.union(
          v.literal("exact"),
          v.literal("key"),
          v.literal("near_dup"),
        ),
        keeperTitle: v.string(),
        count: v.number(),
        // keeper first, then the rows it would hide
        memoryIds: v.array(v.id("memories")),
        reason: v.optional(v.string()),
        keeperId: v.optional(v.id("memories")),
        // every rule that fired (exact and key for an A∩B union)
        rules: v.optional(v.array(dreamPlanRuleValidator)),
        // first few loser titles, 80 chars each
        loserTitles: v.optional(v.array(v.string())),
      }),
    ),
  ),
  // apply runs: the dry run whose plan they applied
  planRunId: v.optional(v.id("dreamRuns")),
  // one-off cleanup (dreamCleanup) plan and apply counts
  cleanup: v.optional(v.object(dreamCleanupCountsFields)),
  // nightly / manual runs: the next run's change window starts here
  // (updatedAt), and its decay scan here (lastVisitAt)
  windowThrough: v.optional(v.number()),
  decayThrough: v.optional(v.number()),
};

// dry run of the one-off cleanup: one row per planned group. Deterministic
// groups (rules A/B) carry keeper + losers; AI groups start as candidates
// (aiStatus "pending") and get keeper + losers once Jev flags them.
export const dreamPlanGroupInputFields = {
  tier: v.union(v.literal("deterministic"), v.literal("ai")),
  // plan order inside the tier; apply and judge page on it
  seq: v.number(),
  rules: v.array(dreamPlanRuleValidator),
  memberIds: v.array(v.id("memories")),
  keeperId: v.optional(v.id("memories")),
  loserIds: v.array(v.id("memories")),
  sourceKey: v.optional(v.string()),
  keeperTitle: v.string(),
  loserTitles: v.array(v.string()),
  reason: v.string(),
  aiStatus: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("flagged"),
      v.literal("not_duplicate"),
      v.literal("error"),
    ),
  ),
  aiConfidence: v.optional(v.number()),
  // best vector score that formed an AI group (0 = entity only)
  score: v.optional(v.number()),
};

export const dreamPlanGroupFields = {
  runId: v.id("dreamRuns"),
  ...dreamPlanGroupInputFields,
  createdAt: v.number(),
};

// write-time near-dup / conflict pair for nightly dreaming. userId and
// profileId match the memory rows. `pairKey` is the same for either order.
export const dreamCandidateFields = {
  userId: v.string(),
  profileId: v.optional(v.string()),
  memoryId: v.id("memories"),
  neighborId: v.id("memories"),
  pairKey: v.string(),
  score: v.number(),
  kind: v.union(v.literal("near_dup"), v.literal("maybe_conflict")),
  status: v.union(v.literal("open"), v.literal("judged"), v.literal("dropped")),
  createdAt: v.number(),
};

// the memory fields a dream action may change, as they were before it.
// Undo writes every field back; an absent optional field is cleared.
export const dreamSnapshotValidator = v.object({
  memoryId: v.id("memories"),
  status: memoryStatusValidator,
  mergedInto: v.optional(v.id("memories")),
  suppressedBy: v.optional(dreamSuppressedByValidator),
  suppressedRunId: v.optional(v.id("dreamRuns")),
  visitCount: v.number(),
  firstVisitAt: v.number(),
  lastVisitAt: v.number(),
  tags: v.array(v.string()),
  sources: v.optional(v.array(v.string())),
  url: v.optional(v.string()),
  // externalId upserts are stored as sourceId
  sourceId: v.optional(v.string()),
});

// one undoable change from a dream run. `created` lists the link and mention
// rows the action inserted, so undo can remove them again.
export const dreamActionFields = {
  runId: v.id("dreamRuns"),
  userId: v.id("users"),
  profileId: v.optional(v.id("profiles")),
  kind: v.union(
    v.literal("merge"),
    v.literal("supersede"),
    v.literal("archive"),
    v.literal("expire"),
  ),
  keeperId: v.optional(v.id("memories")),
  memoryIds: v.array(v.id("memories")),
  before: v.array(dreamSnapshotValidator),
  created: v.object({
    linkIds: v.array(v.id("memoryLinks")),
    mentionIds: v.array(v.id("memoryEntityMentions")),
  }),
  reason: v.string(),
  ai: v.optional(
    v.object({
      relation: v.string(),
      confidence: v.number(),
      model: v.optional(v.string()),
    }),
  ),
  undoneAt: v.optional(v.number()),
  undoExpiresAt: v.number(),
  createdAt: v.number(),
};

// the heavy half of a trace, read only when one trace is opened
export const mcpTraceDetailFields = {
  traceId: v.id("mcpTraces"),
  userId: v.id("users"),
  // sanitised JSON text, capped (see mcp/traceSummary.ts)
  args: v.string(),
  resultIds: v.array(v.string()),
  resultPreview: v.optional(v.string()),
  error: v.optional(v.string()),
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
  visitCount: v.optional(v.number()),
});

export const memorySummaryFilterFields = {
  type: v.optional(v.string()),
  source: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  searchQuery: v.optional(v.string()),
};

// artifacts (see convex/artifacts/store.ts). type = what it is, format = how
// the body renders. Both mirror ARTIFACT_TYPES / ARTIFACT_FORMATS in
// @vvedantb/server, but stay local: schema modules may not import npm
// packages the bundler puts in a shared _deps chunk (validators.test.ts
// keeps them in sync)
export const artifactTypeValidator = v.union(
  v.literal("document"),
  v.literal("report"),
  v.literal("slides"),
  v.literal("infographic"),
  v.literal("mindmap"),
  v.literal("quiz"),
  v.literal("flashcards"),
  v.literal("diagram"),
  v.literal("code"),
);
export const artifactFormatValidator = v.union(
  v.literal("html"),
  v.literal("markdown"),
  v.literal("svg"),
  v.literal("code"),
  v.literal("json"),
);

export const artifactStateSpecValidator = v.object({
  stateVersion: v.number(),
  keys: v.array(v.string()),
  template: v.optional(v.union(v.literal("quiz"), v.literal("flashcards"))),
});

// free client name of the writer, plus its own id when imported
export const artifactOriginValidator = v.object({
  client: v.string(),
  externalId: v.optional(v.string()),
});

// metadata only; list reads never touch the body
export const artifactFields = {
  userId: v.id("users"),
  teamId: v.optional(v.id("teams")),
  title: v.string(),
  description: v.optional(v.string()),
  type: artifactTypeValidator,
  format: artifactFormatValidator,
  language: v.optional(v.string()),
  schemaVersion: v.number(),
  stateSpec: v.optional(artifactStateSpecValidator),
  currentVersion: v.number(),
  currentBodyId: v.id("artifactBodies"),
  // body bytes (utf-8), stored so lists do not read bodies
  size: v.number(),
  // title + description + body plain text, capped at 8 KB, no AI
  searchText: v.string(),
  origin: artifactOriginValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  // soft delete; purged 30 days later
  deletedAt: v.optional(v.number()),
};

// immutable; versions point at bodies, deduped per artifact by sha256
export const artifactBodyFields = {
  // unset only inside the create transaction (the artifact row needs the
  // body id first); every committed body has it
  artifactId: v.optional(v.id("artifacts")),
  userId: v.id("users"),
  body: v.string(),
  sha256: v.string(),
  createdAt: v.number(),
};

export const artifactVersionFields = {
  artifactId: v.id("artifacts"),
  userId: v.id("users"),
  version: v.number(),
  bodyId: v.id("artifactBodies"),
  title: v.string(),
  stateSpec: v.optional(artifactStateSpecValidator),
  createdAt: v.number(),
  // origin.client of the writer
  createdBy: v.string(),
};

// per user, per artifact; counters back the write interval and daily cap
export const artifactStateFields = {
  artifactId: v.id("artifacts"),
  userId: v.id("users"),
  data: v.record(v.string(), v.string()),
  stateVersion: v.number(),
  updatedAt: v.number(),
  lastWriteAt: v.number(),
  dailyWriteCount: v.number(),
  // utcDayKey of the counted day
  dailyWriteDay: v.number(),
};

export const artifactRefKindValidator = v.union(
  v.literal("memory"),
  v.literal("file"),
  v.literal("source"),
  v.literal("skill"),
  v.literal("app"),
);

export const artifactRefFields = {
  artifactId: v.id("artifacts"),
  userId: v.id("users"),
  kind: artifactRefKindValidator,
  target: v.string(),
  // `${kind}:${target}`
  refKey: v.string(),
  createdAt: v.number(),
};
