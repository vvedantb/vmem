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
  dreamTriggerStateFields,
  notificationFields,
  apiKeyFields,
  connectorFields,
  userSettingsFields,
  oauthStateFields,
  contextPromptCacheFields,
  memoryFields,
  memoryAccessPendingFields,
  memoryEmbeddingFields,
  memoryStatCounterFields,
  memoryStatsMetaFields,
  memoryLinkFields,
  memoryEntityFields,
  memoryEntityMentionFields,
  proposedUpdateFields,
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

  // dynamic dreaming trigger state
  dreamTriggerState: defineTable(dreamTriggerStateFields).index("by_user", [
    "userId",
  ]),

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
    .index("by_aggregate_pending", ["aggregatePending", "createdAt"]),

  // cached "user profile" prose for the mcp vmem,//context_prompt resource
  contextPromptCache: defineTable(contextPromptCacheFields).index("by_user", [
    "userId",
  ]),

  // convex memory rows; memory CRUD and search live here
  memories: defineTable(memoryFields)
    .index("by_memory_id", ["memoryId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_profile_created", ["profileId", "createdAt"])
    // connector upserts look a memory up by its external source id
    .index("by_user_source", ["userId", "sourceType", "sourceId"])
    // Jev quality cron: pending rows first, never-tried before oldest-tried
    .index("by_needs_jev", ["usefulnessNeedsJev", "usefulnessJevAt"])
    .searchIndex("search_text", {
      searchField: "searchableText",
      filterFields: ["userId", "profileId"],
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

  memoryAccessPending: defineTable(memoryAccessPendingFields).index(
    "by_created",
    ["createdAt"],
  ),

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
});

export default schema;
