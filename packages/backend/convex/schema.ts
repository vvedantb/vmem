import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { MEMORY_EMBEDDING_DIMENSIONS } from "../engine/memory/searchableText";
import {
  fileNodeFields,
  profileFields,
  skillFields,
  skillVersionFields,
  systemSkillFields,
  userSystemSkillFields,
  teamFields,
  teamMemberFields,
  openRouterLogFields,
  mcpTraceFields,
  mcpTraceDetailFields,
  notificationFields,
  apiKeyFields,
  connectorFields,
  userSettingsFields,
  oauthStateFields,
  contextPromptCacheFields,
  mcpTokenCacheFields,
  queryEmbeddingCacheFields,
  memoryFields,
  memoryAccessPendingFields,
  memoryUsageFields,
  memoryEmbeddingFields,
  memoryStatCounterFields,
  memoryStatsMetaFields,
  memoryLinkFields,
  memoryEntityFields,
  memoryEntityMentionFields,
  proposedUpdateFields,
  rollupFields,
  dreamRunFields,
  dreamActionFields,
  dreamPlanGroupFields,
  dreamCandidateFields,
  artifactFields,
  artifactBodyFields,
  artifactVersionFields,
  artifactStateFields,
  artifactRefFields,
} from "./validators";

const schema = defineSchema({
  users: defineTable({
    clerkId: v.optional(v.string()),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"))),
    isAdmin: v.optional(v.boolean()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  apiKeys: defineTable(apiKeyFields)
    .index("by_user", ["userId"])
    .index("by_key_hash", ["keyHash"]),

  connectors: defineTable(connectorFields).index("by_user", ["userId"]),

  connectorTokens: defineTable({
    connectorId: v.id("connectors"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    tokenType: v.string(),
    scope: v.string(),
  }).index("by_connector", ["connectorId"]),

  userSettings: defineTable(userSettingsFields).index("by_user", ["userId"]),

  profiles: defineTable(profileFields)
    .index("by_user", ["userId"])
    .index("by_user_default", ["userId", "isDefault"])
    .index("by_user_name", ["userId", "name"])
    .index("by_team", ["teamId"]),

  teams: defineTable(teamFields).index("by_createdBy", ["createdBy"]),

  teamMembers: defineTable(teamMemberFields)
    .index("by_team", ["teamId"])
    .index("by_user", ["userId"])
    .index("by_team_user", ["teamId", "userId"])
    .index("by_user_team", ["userId", "teamId"]),

  notifications: defineTable(notificationFields)
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "read"]),

  oauthStates: defineTable(oauthStateFields).index("by_state", ["state"]),

  // MCP grants: personal `/mcp` sees owner skills with teamId unset.
  // Team `/mcp/team` sees skills whose teamId matches the active team profile.
  // Membership is the grant — personal and team skills never leak across connectors.
  skills: defineTable(skillFields)
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "name"])
    .index("by_team", ["teamId"])
    .index("by_team_name", ["teamId", "name"]),

  // immutable pre-overwrite snapshots of skills (see lib/versionSnapshot.ts)
  skillVersions: defineTable(skillVersionFields).index("by_skill", ["skillId"]),

  // global maintainer curated skill catalog (the skills hub)
  systemSkills: defineTable(systemSkillFields)
    .index("by_name", ["name"])
    .index("by_published", ["published"]),

  // per-user (personal) or per-team install link to a systemSkills row
  userSystemSkills: defineTable(userSystemSkillFields)
    .index("by_user", ["userId"])
    .index("by_user_systemSkill", ["userId", "systemSkillId"])
    .index("by_team", ["teamId"])
    .index("by_team_systemSkill", ["teamId", "systemSkillId"])
    .index("by_systemSkill", ["systemSkillId"]),

  fileNodes: defineTable(fileNodeFields)
    .index("by_user", ["userId"])
    .index("by_user_parent", ["userId", "parentId"])
    .index("by_team", ["teamId"])
    .index("by_team_parent", ["teamId", "parentId"])
    // reverse lookup for the index cleanup guard, is any surviving file still pointing at this derived memory? (identical content files share one)
    .index("by_memory", ["memoryId"]),

  // one row per openRouter api call
  openRouterLogs: defineTable(openRouterLogFields)
    .index("by_user", ["userId"])
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_user_feature", ["userId", "feature"])
    .index("by_profile_createdAt", ["profileId", "createdAt"])
    .index("by_team_createdAt", ["teamId", "createdAt"])
    // daily AI budget guard (dreamCleanup)
    .index("by_feature_createdAt", ["feature", "createdAt"])
    // drain queue (true) and, once drained (undefined), the retention sweep
    .index("by_aggregate_pending", ["aggregatePending", "createdAt"]),

  // mcp tool call traces; details split out so list reads stay small
  mcpTraces: defineTable(mcpTraceFields)
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_profile_created", ["profileId", "createdAt"])
    .index("by_created", ["createdAt"]),
  mcpTraceDetails: defineTable(mcpTraceDetailFields)
    .index("by_trace", ["traceId"])
    .index("by_created", ["createdAt"]),

  // nightly day/week/month summaries per user and profile
  rollups: defineTable(rollupFields)
    .index("by_profile_period", ["profileId", "period", "startMs"])
    .index("by_user_period", ["userId", "period", "startMs"])
    // upsert key; team profiles hold one row per member, so filter on userId
    .index("by_profile_periodKey", ["profileId", "period", "periodKey"]),

  // dreaming log: one row per run, one per undoable change
  dreamRuns: defineTable(dreamRunFields)
    .index("by_user_started", ["userId", "startedAt"])
    // the one-off cleanup card reads the latest backfill run
    .index("by_user_trigger_started", ["userId", "trigger", "startedAt"]),
  dreamActions: defineTable(dreamActionFields)
    .index("by_run", ["runId"])
    // memory detail "Merged from N memories"
    .index("by_keeper", ["keeperId"])
    .index("by_user_created", ["userId", "createdAt"])
    // retention sweep (dream.purgeExpiredActions)
    .index("by_undo_expires", ["undoExpiresAt"]),
  // one-off cleanup plan; dropped 30 days after the dry run
  dreamPlanGroups: defineTable(dreamPlanGroupFields)
    .index("by_run_tier_seq", ["runId", "tier", "seq"])
    .index("by_created", ["createdAt"]),

  // write-time near-dup / conflict pairs (memoryEmbed); dropped after 30 days
  // or once a row is no longer visible
  dreamCandidates: defineTable(dreamCandidateFields)
    .index("by_user_status_created", ["userId", "status", "createdAt"])
    // nightly dreaming: open pairs of one profile and kind, oldest first
    .index("by_profile_kind_status_created", [
      "profileId",
      "kind",
      "status",
      "createdAt",
    ])
    .index("by_memory", ["memoryId"])
    .index("by_pair_key", ["pairKey"])
    // retention sweep (dreamCandidates.purgeInternal)
    .index("by_created", ["createdAt"]),

  // cached "user profile" prose for the mcp vmem,//context_prompt resource
  contextPromptCache: defineTable(contextPromptCacheFields).index("by_user", [
    "userId",
  ]),

  // short-lived caches on the recall_context path, pruned by cron
  mcpTokenCache: defineTable(mcpTokenCacheFields)
    .index("by_token_hash", ["tokenHash"])
    .index("by_expires", ["expiresAt"]),
  queryEmbeddingCache: defineTable(queryEmbeddingCacheFields)
    .index("by_key", ["key"])
    .index("by_expires", ["expiresAt"]),

  // convex memory rows; memory CRUD and search live here
  memories: defineTable(memoryFields)
    .index("by_memory_id", ["memoryId"])
    .index("by_user_created", ["userId", "createdAt"])
    // nightly rollups and dreaming find rows changed since the last run
    .index("by_user_updated", ["userId", "updatedAt"])
    // nightly dreaming: team change window, expire and decay scans
    .index("by_profile_updated", ["profileId", "updatedAt"])
    .index("by_profile_status_expires", ["profileId", "status", "expiresAt"])
    .index("by_profile_status_last_visit", [
      "profileId",
      "status",
      "lastVisitAt",
    ])
    .index("by_profile_created", ["profileId", "createdAt"])
    // sweep of dream-hidden duplicates past the undo window
    .index("by_suppressed_by_at", ["suppressedBy", "suppressedAt"])
    // version history: the prior versions a memory replaced
    .index("by_superseded_by", ["supersededBy"])
    // connector upserts look a memory up by its external source id
    .index("by_user_source", ["userId", "sourceType", "sourceId"])
    // browse write gate: recent rows of one source in one user + profile
    .index("by_user_profile_source_visit", [
      "userId",
      "profileId",
      "sourceType",
      "lastVisitAt",
    ])
    // exact-content write dedupe within one user + profile
    .index("by_user_profile_hash", ["userId", "profileId", "contentHash"])
    // Jev quality cron: pending rows first, never-tried before oldest-tried
    .index("by_needs_jev", [
      "usefulnessNeedsJev",
      "usefulnessJevPriority",
      "usefulnessJevAt",
    ])
    .searchIndex("search_text", {
      searchField: "searchableText",
      // source/type/status are required scalars, so every row stays indexed.
      // sourceType is optional: Convex would drop rows missing it.
      filterFields: ["userId", "profileId", "source", "type", "status"],
    }),

  // embedding vectors live here (not on `memories`) so reads of memory rows
  // stay small
  memoryEmbeddings: defineTable(memoryEmbeddingFields)
    .index("by_memory_doc", ["memoryDocId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: MEMORY_EMBEDDING_DIMENSIONS,
      filterFields: ["userId", "profileId"],
    }),

  memoryAccessPending: defineTable(memoryAccessPendingFields)
    .index("by_created", ["createdAt"])
    .index("by_memory_kind", ["memoryId", "kind"]),

  memoryUsage: defineTable(memoryUsageFields).index("by_memory_id", [
    "memoryId",
  ]),

  memoryStatCounters: defineTable(memoryStatCounterFields)
    .index("by_bucket", ["userId", "profileId", "kind", "key", "shard"])
    .index("by_user_kind_key", ["userId", "kind", "key"])
    .index("by_profile_kind_key", ["profileId", "kind", "key"]),

  memoryStatsMeta: defineTable(memoryStatsMetaFields),

  memoryLinks: defineTable(memoryLinkFields)
    .index("by_user", ["userId"])
    .index("by_user_source", ["userId", "sourceId"])
    .index("by_user_target", ["userId", "targetId"])
    .index("by_source_target", ["sourceId", "targetId"]),

  memoryEntities: defineTable(memoryEntityFields)
    .index("by_user", ["userId"])
    .index("by_user_normalized", ["userId", "normalizedName"]),

  memoryEntityMentions: defineTable(memoryEntityMentionFields)
    .index("by_memory", ["memoryId"])
    .index("by_entity", ["entityId"])
    .index("by_user_normalized", ["userId", "normalizedName"]),

  proposedUpdates: defineTable(proposedUpdateFields)
    .index("by_proposal_id", ["proposalId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_profile_status", ["profileId", "status"]),

  // artifacts: metadata rows; bodies, versions, state and refs hang off them
  artifacts: defineTable(artifactFields)
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_team_updated", ["teamId", "updatedAt"])
    .index("by_user_type_updated", ["userId", "type", "updatedAt"])
    // idempotent imports and old-id lookups
    .index("by_user_origin", ["userId", "origin.client", "origin.externalId"])
    // trash purge (artifacts/api.purgeDeletedInternal)
    .index("by_deleted", ["deletedAt"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["userId", "teamId", "type"],
    }),
  // immutable bodies; the sha256 suffix is the per-artifact dedupe lookup
  artifactBodies: defineTable(artifactBodyFields).index("by_artifact", [
    "artifactId",
    "sha256",
  ]),
  artifactVersions: defineTable(artifactVersionFields).index(
    "by_artifact_version",
    ["artifactId", "version"],
  ),
  artifactState: defineTable(artifactStateFields)
    .index("by_artifact_user", ["artifactId", "userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),
  artifactRefs: defineTable(artifactRefFields)
    .index("by_artifact", ["artifactId"])
    .index("by_user_ref", ["userId", "refKey", "createdAt"]),
});

export default schema;
