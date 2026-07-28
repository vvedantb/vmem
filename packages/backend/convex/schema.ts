import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  wikiNodeFields,
  wikiNodeVersionFields,
  fileNodeFields,
  profileFields,
  skillFields,
  skillVersionFields,
  systemSkillFields,
  userSystemSkillFields,
  teamFields,
  teamMemberFields,
  userEnvVarFields,
  codebaseFields,
  openRouterLogFields,
  dreamTriggerStateFields,
  notificationFields,
  apiKeyFields,
  connectorFields,
  userSettingsFields,
  oauthStateFields,
  githubConnectionFields,
  contextPromptCacheFields,
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

  githubConnections: defineTable(githubConnectionFields).index("by_user", [
    "userId",
  ]),

  codebases: defineTable(codebaseFields)
    .index("by_user", ["userId"])
    .index("by_user_repo", ["userId", "repoFullName"])
    .index("by_team", ["teamId"])
    .index("by_team_repo", ["teamId", "repoFullName"]),

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

  wikiNodes: defineTable(wikiNodeFields)
    .index("by_user", ["userId"])
    .index("by_user_parent", ["userId", "parentId"])
    .index("by_team", ["teamId"])
    .index("by_team_parent", ["teamId", "parentId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId", "teamId"],
    })
    .searchIndex("search_content", {
      searchField: "contentText",
      filterFields: ["userId", "teamId"],
    }),

  // immutable pre-overwrite snapshots of wiki docs (see lib/versionSnapshot.ts)
  wikiNodeVersions: defineTable(wikiNodeVersionFields).index("by_node", [
    "nodeId",
  ]),

  fileNodes: defineTable(fileNodeFields)
    .index("by_user", ["userId"])
    .index("by_user_parent", ["userId", "parentId"])
    .index("by_team", ["teamId"])
    .index("by_team_parent", ["teamId", "parentId"])
    // reverse lookup for the index cleanup guard, is any surviving file still pointing at this derived memory? (identical content files share one)
    .index("by_memory", ["memoryId"]),

  userEnvVars: defineTable(userEnvVarFields).index("by_user", ["userId"]),

  // one row per openRouter api call
  openRouterLogs: defineTable(openRouterLogFields)
    .index("by_user", ["userId"])
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_user_feature", ["userId", "feature"])
    .index("by_profile_createdAt", ["profileId", "createdAt"])
    .index("by_team_createdAt", ["teamId", "createdAt"]),

  // cached "user profile" prose for the mcp vmem,//context_prompt resource
  contextPromptCache: defineTable(contextPromptCacheFields).index("by_user", [
    "userId",
  ]),
});

export default schema;
