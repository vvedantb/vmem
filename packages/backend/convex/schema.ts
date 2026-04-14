import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

  memoryEvents: defineTable({
    clerkId: v.string(),
    eventType: v.union(
      v.literal("memory_created"),
      v.literal("memory_updated"),
      v.literal("memory_deleted"),
      v.literal("relationship_created"),
      v.literal("relationship_deleted"),
    ),
    memoryId: v.string(),
    payload: v.string(),
  }).index("by_clerk", ["clerkId"]),

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
  }).index("by_user", ["userId"]),

  apiRequestLogs: defineTable({
    userId: v.id("users"),
    apiKeyId: v.id("apiKeys"),
    endpoint: v.string(),
    method: v.string(),
    status: v.number(),
    durationMs: v.number(),
    createdAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_key_created", ["apiKeyId", "createdAt"]),

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
});

export default schema;
