import { v } from "convex/values";
import { omit } from "convex-helpers";
import { zodToConvex } from "convex-helpers/server/zod";
import { z } from "zod";
import {
  openRouterEndpointSchema,
  openRouterFeatureSchema,
} from "./lib/openRouter/schemas";

// table field validators — used in schema.ts and return validators
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
  /** Google PKCE verifier — required for Google code exchange */
  codeVerifier: v.optional(v.string()),
};

export const oauthStatePayloadFields = omit(oauthStateFields, ["state"]);

export const githubConnectionFields = {
  userId: v.id("users"),
  githubUsername: v.string(),
  encryptedAccessToken: v.string(),
  avatarUrl: v.optional(v.string()),
  connectedAt: v.number(),
};

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

export const codebaseFields = {
  userId: v.id("users"),
  // personal when absent; team drive when set (same pattern as skills/wiki/files)
  teamId: v.optional(v.id("teams")),
  githubConnectionId: v.id("githubConnections"),
  repoOwner: v.string(),
  repoName: v.string(),
  repoFullName: v.string(),
  defaultBranch: v.string(),
  language: v.optional(v.string()),
  description: v.optional(v.string()),
  isPrivate: v.optional(v.boolean()),
  status: v.union(
    v.literal("pending"),
    v.literal("syncing"),
    v.literal("synced"),
    v.literal("error"),
  ),
  totalFiles: v.number(),
  totalEdges: v.optional(v.number()),
  syncedFiles: v.number(),
  lastSyncedAt: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  functionCount: v.optional(v.number()),
  classCount: v.optional(v.number()),
  interfaceCount: v.optional(v.number()),
  callEdgeCount: v.optional(v.number()),
  processCount: v.optional(v.number()),
  parserVersion: v.optional(v.string()),
  lastParseError: v.optional(v.string()),
  parseStage: v.optional(
    v.union(
      v.literal("fetching"),
      v.literal("parsing"),
      v.literal("processes"),
      v.literal("writing"),
      v.literal("done"),
    ),
  ),
  syncStartedAt: v.optional(v.number()),
  isArchived: v.optional(v.boolean()),
};

// Neo4j codebase symbol node kinds (graph / impact / MCP args)
export const codebaseSymbolKindValidator = v.union(
  v.literal("code-file"),
  v.literal("code-function"),
  v.literal("code-class"),
  v.literal("code-interface"),
  v.literal("code-process"),
);

// blast-radius / impact traversal direction
export const codebaseDirectionValidator = v.union(
  v.literal("upstream"),
  v.literal("downstream"),
);

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
  // artifact source language (html | svg | tsx | sql | …); absent on folders/docs
  language: v.optional(v.string()),
  order: v.number(),
  sourceCodebaseId: v.optional(v.id("codebases")),
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
  // personal when absent; team workspace install when set (shared with members)
  teamId: v.optional(v.id("teams")),
  systemSkillId: v.id("systemSkills"),
  enabled: v.boolean(),
  installedAt: v.number(),
};
