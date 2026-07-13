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
} from "./validators";

const schema = defineSchema({
  users: defineTable({
    clerkId: v.optional(v.string()),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"))),
    /** Maintainer flag — gates system-skill catalog CRUD. Absent = not admin. */
    isAdmin: v.optional(v.boolean()),
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
      v.union(v.literal("google_drive"), v.literal("notion")),
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
    syncStartedAt: v.optional(v.number()),
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
    // History-sync period for the browser extension, in minutes (15–1440).
    extensionAutoSyncIntervalMinutes: v.optional(v.number()),
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
        mcp: v.optional(v.id("profiles")),
        mcpTeam: v.optional(v.id("profiles")),
      }),
    ),
    // ── Dream Mode (user-wide; applies to personal profiles only) ──────
    /** When true, the Dreamer's high-confidence synthesis materializes
     *  directly as new memories instead of routing through /proposals. */
    dreamModeAutoAccept: v.optional(v.boolean()),
    /** When true, a daily cron fires `runDreamForUserById` at
     *  `dreamModeScheduleTime` UTC and scans every personal profile in one
     *  pass. Time stored as "HH:MM" — same shape the time picker produces. */
    dreamModeScheduleEnabled: v.optional(v.boolean()),
    dreamModeScheduleTime: v.optional(v.string()), // "HH:MM" UTC
    /** Dynamic Dreaming (V3) — when true (the default; absent = true),
     *  dream passes fire automatically once the user goes quiet after
     *  enough new memories, instead of waiting for the daily schedule or
     *  the manual button. Soft-fails without an OpenRouter key. */
    dreamModeAutomatic: v.optional(v.boolean()),
    /** Wall-clock ms of the last successful Dream Mode run. Used to
     *  rate-limit the manual "Start Dreaming" button (1 run/hour). */
    lastDreamRunAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  /**
   * Dynamic Dreaming trigger state — one row per user (see
   * `dreamTriggerStateFields` for the debounce/cap semantics).
   */
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

  codebases: defineTable(codebaseFields)
    .index("by_user", ["userId"])
    .index("by_user_repo", ["userId", "repoFullName"]),

  skills: defineTable(skillFields)
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "name"])
    .index("by_team", ["teamId"])
    .index("by_team_name", ["teamId", "name"]),

  /** Immutable pre-overwrite snapshots of skills (see lib/versionSnapshot.ts). */
  skillVersions: defineTable(skillVersionFields).index("by_skill", ["skillId"]),

  /** Global maintainer-curated skill catalog (the Skills Hub). */
  systemSkills: defineTable(systemSkillFields)
    .index("by_name", ["name"])
    .index("by_published", ["published"]),

  /** Per-user install LINK to a systemSkills row (linked, never copied). */
  userSystemSkills: defineTable(userSystemSkillFields)
    .index("by_user", ["userId"])
    .index("by_user_systemSkill", ["userId", "systemSkillId"])
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

  /** Immutable pre-overwrite snapshots of wiki docs (see lib/versionSnapshot.ts). */
  wikiNodeVersions: defineTable(wikiNodeVersionFields).index("by_node", [
    "nodeId",
  ]),

  fileNodes: defineTable(fileNodeFields)
    .index("by_user", ["userId"])
    .index("by_user_parent", ["userId", "parentId"])
    .index("by_team", ["teamId"])
    .index("by_team_parent", ["teamId", "parentId"])
    // Reverse lookup for the index-cleanup guard: is any surviving file still
    // pointing at this derived memory? (identical-content files share one)
    .index("by_memory", ["memoryId"]),

  userEnvVars: defineTable(userEnvVarFields).index("by_user", ["userId"]),

  /**
   * One row per OpenRouter API call. Powers the `/openrouter-logs`
   * dashboard (per-call cost / latency / token breakdown) and aggregate
   * spend queries by user, profile, or team.
   *
   * Indexes:
   * - by_user / by_user_createdAt — personal-scope listing + recent feed
   * - by_user_feature           — feature breakdown chart
   * - by_profile_createdAt      — per-workspace breakdowns
   * - by_team_createdAt         — team-wide spend across all members
   */
  openRouterLogs: defineTable(openRouterLogFields)
    .index("by_user", ["userId"])
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_user_feature", ["userId", "feature"])
    .index("by_profile_createdAt", ["profileId", "createdAt"])
    .index("by_team_createdAt", ["teamId", "createdAt"]),

  /**
   * Cached "User Profile" prose for the MCP `vmem://context_prompt`
   * resource. AI clients (Claude, Cursor) read this once per conversation
   * to prime their understanding of the user without making N memory
   * tool calls.
   *
   * Regenerated via debounced scheduler: any memory write flips
   * `pendingRegeneration = true` and schedules a regen check 60s out.
   * The check runs the LLM only if the flag is set, keeping cost
   * bounded under bursty write patterns.
   */
  contextPromptCache: defineTable({
    userId: v.id("users"),
    /** Markdown-formatted profile prose served to MCP clients. */
    content: v.string(),
    /** Wall-clock ms when the LLM last regenerated `content`. */
    generatedAt: v.number(),
    /** Snapshot of the user's memory count at generation time — used to
     *  detect "lots changed since last regen" for staleness UX later. */
    memoryCountAtGeneration: v.number(),
    /** True when a memory write happened since the last regen and a
     *  regen-check is scheduled. The check clears the flag on success. */
    pendingRegeneration: v.boolean(),
  }).index("by_user", ["userId"]),

  /**
   * Short-lived OAuth authorization codes for the MCP `/mcp/oauth/token`
   * exchange. Inserted by `mcp.oauth.authorize` (called from the web app
   * after Clerk sign-in) and consumed atomically by the token endpoint.
   * 5-minute TTL; expired rows are deleted on consumption regardless.
   */
  mcpAuthCodes: defineTable({
    code: v.string(),
    clerkUserId: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
    redirectUri: v.string(),
    clientId: v.string(),
    expiresAt: v.number(),
  }).index("by_code", ["code"]),

  /**
   * Dynamic OAuth client registrations issued via `/mcp/oauth/register`.
   * `clientSecret` is optional — Claude.ai uses the public-client (no
   * secret) flow with PKCE. 24h soft TTL applied at the query layer.
   */
  mcpClientRegistrations: defineTable({
    clientId: v.string(),
    clientSecret: v.optional(v.string()),
    redirectUris: v.array(v.string()),
    registeredAt: v.number(),
  }).index("by_clientId", ["clientId"]),
});

export default schema;
