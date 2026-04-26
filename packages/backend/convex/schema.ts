import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  wikiNodeFields,
  profileFields,
  teamFields,
  teamMemberFields,
  userEnvVarFields,
} from "./validators";

const schema = defineSchema({
  users: defineTable({
    clerkId: v.optional(v.string()),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"))),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  apiKeys: defineTable({
    userId: v.id("users"),
    name: v.string(),
    maskedKey: v.string(),
    keyHash: v.string(),
    encryptedKey: v.string(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    requestCount: v.number(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_key_hash", ["keyHash"]),

  connectors: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    provider: v.optional(
      v.union(
        v.literal("google_drive"),
        v.literal("notion"),
        v.literal("gmail"),
        v.literal("onedrive"),
        v.literal("linear"),
      ),
    ),
    connectionStatus: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
    ),
    syncStatus: v.union(
      v.literal("idle"),
      v.literal("syncing"),
      v.literal("error"),
    ),
    lastSyncAt: v.optional(v.number()),
    syncProgress: v.number(),
    itemsSynced: v.number(),
    errorMessage: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  connectorTokens: defineTable({
    connectorId: v.id("connectors"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    tokenType: v.string(),
    scope: v.string(),
  }).index("by_connector", ["connectorId"]),

  userSettings: defineTable({
    userId: v.id("users"),
    theme: v.optional(
      v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    ),
    language: v.optional(v.string()),
    memoryAutoTag: v.optional(v.boolean()),
    notificationsEnabled: v.optional(v.boolean()),
    extensionAutoSyncEnabled: v.optional(v.boolean()),
    extensionSelectionPopupEnabled: v.optional(v.boolean()),
    // Memory behavior defaults
    memoryAutoExtract: v.optional(v.boolean()),
    memoryConfidenceThreshold: v.optional(v.number()),
    // Notification preferences
    notifyMemoryConflicts: v.optional(v.boolean()),
    notifyNewMemories: v.optional(v.boolean()),
    notifyMemoriesExpiring: v.optional(v.boolean()),
    // User-provided context surfaced to AI apps on retrieval
    aboutMe: v.optional(v.string()),
    preferences: v.optional(v.string()),
    // Source-specific default profiles (replaces activeProfileId)
    defaultProfiles: v.optional(
      v.object({
        web: v.optional(v.id("profiles")),
        extension: v.optional(v.id("profiles")),
      }),
    ),
  }).index("by_user", ["userId"]),

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

  notifications: defineTable({
    userId: v.id("users"),
    title: v.string(),
    description: v.string(),
    type: v.union(
      v.literal("success"),
      v.literal("warning"),
      v.literal("error"),
      v.literal("info"),
    ),
    read: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "read"]),

  oauthStates: defineTable({
    state: v.string(),
    userId: v.id("users"),
    returnUrl: v.string(),
    expiresAt: v.number(),
    // Connector OAuth fields (optional to not break existing GitHub flow)
    connectorId: v.optional(v.id("connectors")),
    provider: v.optional(v.string()),
  }).index("by_state", ["state"]),

  githubConnections: defineTable({
    userId: v.id("users"),
    githubUsername: v.string(),
    encryptedAccessToken: v.string(),
    avatarUrl: v.optional(v.string()),
    connectedAt: v.number(),
  }).index("by_user", ["userId"]),

  chatMessageMemoryRefs: defineTable({
    userId: v.id("users"),
    threadId: v.string(),
    bubbleKey: v.string(),
    refs: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        // Optional so rows written before hybrid search shipped stay valid.
        // When present, the web chat popover renders the four-bar score
        // breakdown and the reason string.
        trace: v.optional(
          v.object({
            score: v.number(),
            scoreBreakdown: v.object({
              fulltext: v.number(),
              vector: v.number(),
              recency: v.number(),
              confidence: v.number(),
            }),
            reason: v.string(),
          }),
        ),
      }),
    ),
  })
    .index("by_user_thread", ["userId", "threadId"])
    .index("by_user_bubble", ["userId", "bubbleKey"]),

  codebases: defineTable({
    userId: v.id("users"),
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
  })
    .index("by_user", ["userId"])
    .index("by_user_repo", ["userId", "repoFullName"]),

  skills: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.string(),
    instructions: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "name"]),

  wikiNodes: defineTable(wikiNodeFields)
    .index("by_user", ["userId"])
    .index("by_user_parent", ["userId", "parentId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId"],
    })
    .searchIndex("search_content", {
      searchField: "contentText",
      filterFields: ["userId"],
    }),

  userEnvVars: defineTable(userEnvVarFields).index("by_user", ["userId"]),
});

export default schema;
