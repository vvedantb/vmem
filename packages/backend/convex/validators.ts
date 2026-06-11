import { v } from "convex/values";

/**
 * Single source of truth for profiles table fields.
 * Used in schema.ts (defineTable) and return validators.
 *
 * A profile is a Chrome-like workspace for organizing memories.
 * Each memory belongs to exactly one profile.
 *
 * Personal profile: teamId undefined, userId = owner.
 * Team profile:    teamId set, userId = team creator (for historical attribution only),
 *                  isDefault always false. Access via teamMembers table.
 */
export const profileFields = {
  userId: v.id("users"),
  name: v.string(),
  color: v.string(), // hex e.g. "#3B82F6"
  icon: v.string(), // icon name e.g. "briefcase"
  isDefault: v.boolean(),
  /** When set, this profile is shared across a team. Access is granted via teamMembers. */
  teamId: v.optional(v.id("teams")),
  createdAt: v.number(),
  updatedAt: v.number(),
  /**
   * Dream Mode V2 — when true, derived insights produced by the background
   * Dreamer auto-materialize as new :Memory nodes (with :DERIVED_FROM edges
   * back to source memories) instead of being routed through the
   * `/proposals` queue. Defaults to undefined/false; users opt in per
   * profile once they trust the synthesis quality.
   */
  dreamModeAutoAccept: v.optional(v.boolean()),
  /**
   * Wall-clock ms of the last successful Dream Mode run for this profile.
   * Used to rate-limit the manual "Run Dream Mode" button (1 run/hr) and
   * to scope the Dreamer's "recent memories" window when desired.
   */
  lastDreamRunAt: v.optional(v.number()),
  /**
   * Per-profile Dream Mode schedule. When `dreamModeScheduleEnabled` is
   * true, a cron is registered via `@convex-dev/crons` that fires daily at
   * `dreamModeScheduleTime` UTC ("HH:MM" — same shape the `<input
   * type="time">` picker produces, so the UI never has to split). The user
   * picks a local time in the browser; the browser converts to UTC before
   * saving so the cron always fires at a stable moment regardless of DST.
   *
   * Defaults: undefined / false — Dream Mode is opt-in to avoid surprising
   * the user with LLM costs.
   */
  dreamModeScheduleEnabled: v.optional(v.boolean()),
  dreamModeScheduleTime: v.optional(v.string()), // "HH:MM" UTC
};

/**
 * Single source of truth for teams table fields.
 * A team is a group of users sharing a single profile.
 */
export const teamFields = {
  name: v.string(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/**
 * Single source of truth for teamMembers table fields.
 * Membership row joining a user to a team with a role.
 * Uniqueness (one row per (teamId, userId)) enforced in mutations via by_team_user index.
 */
export const teamMemberFields = {
  teamId: v.id("teams"),
  userId: v.id("users"),
  role: v.union(v.literal("owner"), v.literal("member")),
  joinedAt: v.number(),
};

/**
 * Single source of truth for skills table fields.
 *
 * Scoping ("user-wide + team"): `teamId` absent = personal skill, visible in
 * every personal workspace of `userId`. `teamId` set = team skill, visible to
 * all members of that team (access via teamMembers); `userId` = creator, kept
 * for attribution and the creator-or-team-owner delete rule.
 */
export const skillFields = {
  userId: v.id("users"),
  /** When set, this skill belongs to a team. Access via teamMembers. */
  teamId: v.optional(v.id("teams")),
  name: v.string(),
  description: v.string(),
  instructions: v.string(),
  enabled: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/**
 * Single source of truth for threadProfiles table fields.
 *
 * Maps an agent-component chat thread to the workspace (profile) it was
 * started in. The agent component's thread docs can't carry custom
 * metadata, so this side table provides the profile association:
 * one active thread per (user, profile); threads stay PRIVATE to their
 * creator even in team profiles.
 */
export const threadProfileFields = {
  userId: v.id("users"),
  /** Agent-component thread id (string — lives in the component's tables). */
  threadId: v.string(),
  profileId: v.id("profiles"),
  createdAt: v.number(),
};

/**
 * Single source of truth for userEnvVars table fields.
 *
 * One document per user. `vars` holds the user's environment variables as
 * `{ key, value }` pairs, where `value` is the ciphertext returned by
 * `lib/crypto.ts#encryptToken` (format `v1:iv:ct`).
 *
 * Storage pattern mirrors conductor's `teamEnvVars` / `repoEnvVars` tables:
 * a single row aggregates all vars for a given scope. Env var sets are
 * bounded in practice; the 1MB document limit is not a concern.
 */
export const userEnvVarFields = {
  userId: v.id("users"),
  vars: v.array(
    v.object({
      key: v.string(),
      /** Ciphertext from encryptToken(). Never exposed to clients except via `revealValue`. */
      value: v.string(),
    }),
  ),
  updatedAt: v.number(),
};

/**
 * Single source of truth for codebases table fields.
 * Used in schema.ts (defineTable) and anywhere a codebase row is described.
 *
 * Phase 1 added rich AST stats (functionCount, classCount, etc.) and a
 * `parseStage` field used by the live sync UI. All Phase 1 fields are
 * optional so pre-existing rows stay valid; bumping `parserVersion`
 * triggers a re-sync banner on the codebases index page.
 */
export const codebaseFields = {
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
  // ── Phase 1 AST stats ──────────────────────────────────────────────
  functionCount: v.optional(v.number()),
  classCount: v.optional(v.number()),
  interfaceCount: v.optional(v.number()),
  callEdgeCount: v.optional(v.number()),
  processCount: v.optional(v.number()),
  /** Bumped when parser semantics change — drives the re-sync banner. */
  parserVersion: v.optional(v.string()),
  /** Last parse error message (distinct from network/GitHub `errorMessage`). */
  lastParseError: v.optional(v.string()),
  /** Live sync stage for granular progress UI. */
  parseStage: v.optional(
    v.union(
      v.literal("fetching"),
      v.literal("parsing"),
      v.literal("processes"),
      v.literal("writing"),
      v.literal("done"),
    ),
  ),
  /** Set when status becomes `syncing`; used to recover stuck syncs. */
  syncStartedAt: v.optional(v.number()),
  /**
   * Archived codebases keep all their data but are excluded from scheduled
   * syncs and hidden from the main sidebar list (shown in a collapsed
   * "Archived" accordion instead). Undefined/false = active.
   */
  isArchived: v.optional(v.boolean()),
};

/**
 * Single source of truth for openRouterLogs table fields.
 *
 * Every OpenRouter API call (chat completions + embeddings) writes one row.
 * Fields cover identity (userId/profileId/teamId/feature/endpoint/model),
 * outcome (status/ok/errorClass/errorMessage/latencyMs), token + cost
 * accounting (returned by OpenRouter when `usage:{include:true}` is set on
 * chat; computed from a price table for embeddings), and optional
 * prompt/completion previews (only populated when the deploy sets
 * OPENROUTER_LOG_PROMPTS=1).
 *
 * Split into two consts so the `recordInternal` mutation can re-use the
 * caller-provided subset without re-declaring fields. Schema uses the
 * full `openRouterLogFields`; `recordInternal` uses
 * `openRouterLogRecordFields` and derives `teamId`/`createdAt` itself.
 */
export const openRouterLogRecordFields = {
  userId: v.id("users"),
  /** Profile this call was made in context of. Optional — some paths
   *  (e.g. MCP query embed before profile resolution) don't know yet.
   *
   *  Accepted as a plain string at the mutation boundary because most
   *  call-sites carry a `string` profileId (the Neo4j actions thread
   *  the id through string-typed args). `recordInternal` normalises
   *  via `ctx.db.normalizeId("profiles", …)` before insert; the
   *  schema column is the strict `v.id("profiles")` form. */
  profileId: v.optional(v.string()),
  feature: v.union(
    // Chat completions
    v.literal("chat"),
    v.literal("enrichment"),
    v.literal("dream-synthesis"),
    v.literal("context-prompt"),
    v.literal("fact-extraction"),
    v.literal("entity-backfill"),
    v.literal("tag-consolidation"),
    // Embeddings
    v.literal("memory-save"),
    v.literal("memory-search"),
    v.literal("mcp-embed"),
    v.literal("connector-sync"),
    v.literal("dream-materialize"),
    v.literal("proposal-accept"),
    v.literal("embedding-backfill"),
  ),
  endpoint: v.union(v.literal("chat"), v.literal("embedding")),
  model: v.string(),
  status: v.number(), // HTTP status (0 on network/timeout)
  ok: v.boolean(),
  errorClass: v.optional(
    v.union(
      v.literal("network"),
      v.literal("http_4xx"),
      v.literal("http_5xx"),
      v.literal("parse"),
      v.literal("timeout"),
    ),
  ),
  errorMessage: v.optional(v.string()),
  latencyMs: v.number(),
  /** OpenRouter generation id (`gen-...`) — used to link to /generation lookup later. */
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
  /** Effective USD cost charged via OpenRouter (`usage.cost`). */
  costUsd: v.optional(v.number()),
  /** Underlying provider cost when BYOK (`usage.cost_details.upstream_inference_cost`). */
  upstreamCostUsd: v.optional(v.number()),
  isByok: v.optional(v.boolean()),
  /** Truncated prompt — only set when OPENROUTER_LOG_PROMPTS=1 on the deploy. */
  promptPreview: v.optional(v.string()),
  /** Truncated completion — only set when OPENROUTER_LOG_PROMPTS=1 on the deploy. */
  completionPreview: v.optional(v.string()),
};

export const openRouterLogFields = {
  ...openRouterLogRecordFields,
  /** Stored as a typed Convex Id<"profiles"> on the row even though the
   *  mutation accepts a plain string at the boundary. `recordInternal`
   *  normalises before insert. */
  profileId: v.optional(v.id("profiles")),
  /** Denormalised from profile.teamId at log-write time so team-wide spend
   *  queries hit a single index. Undefined = personal profile or unknown. */
  teamId: v.optional(v.id("teams")),
  createdAt: v.number(),
};

/**
 * Single source of truth for wikiNodes table fields.
 * Used in schema.ts (defineTable) and anywhere we need to describe a wikiNode row.
 *
 * A wiki node is either a folder or a document (obsidian-style). Folders are just
 * nodes with children; documents carry the editor content. One table keeps traversal
 * and CRUD trivial.
 */
export const wikiNodeFields = {
  userId: v.id("users"),
  /** When set, this node belongs to a team wiki (whole subtree shares the
   *  same teamId — parent/child scope consistency enforced in mutations).
   *  Absent = personal, user-wide. `userId` = creator for team nodes. */
  teamId: v.optional(v.id("teams")),
  /** undefined = root-level node */
  parentId: v.optional(v.id("wikiNodes")),
  kind: v.union(v.literal("folder"), v.literal("document")),
  title: v.string(),
  /** Canonical markdown body. Undefined for folders; empty string for new documents. */
  content: v.optional(v.string()),
  /** Plain-text mirror of content used for the Convex full-text searchIndex. */
  contentText: v.optional(v.string()),
  /** Manual ordering within a parent; higher = later. */
  order: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/**
 * Shared filesystem nodes — the `/files` view and the MCP file tools.
 *
 * One table holds folders and files, discriminated by `kind`. Folders provide
 * hierarchy; files carry the storage handle + metadata. The same node tree is
 * exposed to humans (web UI) and AI agents (MCP files_* tools), so they share a
 * single namespace addressable by `parentId` chains (web) or `/`-separated
 * paths (MCP).
 */
export const fileNodeFields = {
  userId: v.id("users"),
  /** When set, this node belongs to a team drive (whole subtree shares the
   *  same teamId; team storage quota is pooled per team). Absent = personal.
   *  `userId` = creator for team nodes. */
  teamId: v.optional(v.id("teams")),
  /** undefined = root-level node */
  parentId: v.optional(v.id("fileNodes")),
  kind: v.union(v.literal("folder"), v.literal("file")),
  name: v.string(),
  /** files only: MIME type of the stored bytes */
  mimeType: v.optional(v.string()),
  /** files only: size in bytes */
  size: v.optional(v.number()),
  /** files only: Convex storage handle for the bytes */
  storageId: v.optional(v.id("_storage")),
  createdAt: v.number(),
  updatedAt: v.number(),
};
