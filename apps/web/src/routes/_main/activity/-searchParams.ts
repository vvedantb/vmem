import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";

/**
 * URL state for the unified `/activity` page.
 *
 * Two tabs share this URL — AI Logs (platform-side LLM/embedding calls)
 * and Events (user-action audit log). Their filter sets don't overlap by
 * key: events params are prefixed `event*` so a stale `range=7d` from the
 * AI Logs tab doesn't try to apply against the events range enum (which
 * uses different values).
 */

const activityTabs = ["ai-logs", "events"] as const;
export type ActivityTab = (typeof activityTabs)[number];

export const activitySearchParams = {
  tab: parseAsStringLiteral(activityTabs).withDefault("ai-logs"),
};

// ── AI Logs (formerly /openrouter-logs, then /ai-logs) ────────────────────

export const FEATURES = [
  "enrichment",
  "dream-synthesis",
  "context-prompt",
  "fact-extraction",
  "entity-backfill",
  "memory-save",
  "memory-search",
  "mcp-embed",
  "connector-sync",
  "dream-materialize",
  "proposal-accept",
  "embedding-backfill",
] as const;

export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<Feature, string> = {
  enrichment: "Memory Enrichment",
  "dream-synthesis": "Dream Synthesis",
  "context-prompt": "Context Prompt",
  "fact-extraction": "Fact Extraction",
  "entity-backfill": "Entity Backfill",
  "memory-save": "Memory Save",
  "memory-search": "Memory Search",
  "mcp-embed": "MCP Embed",
  "connector-sync": "Connector Sync",
  "dream-materialize": "Dream Materialize",
  "proposal-accept": "Proposal Accept",
  "embedding-backfill": "Embedding Backfill",
};

const scopes = ["personal", "team"] as const;
export type Scope = (typeof scopes)[number];

const statuses = ["all", "success", "error"] as const;
export type StatusFilter = (typeof statuses)[number];

const ranges = ["today", "7d", "30d", "all"] as const;
export type Range = (typeof ranges)[number];

export const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  "7d": "Past 7 days",
  "30d": "Past 30 days",
  all: "All time",
};

const sortDirections = ["desc", "asc"] as const;
export type SortDirection = (typeof sortDirections)[number];

export const aiLogsSearchParams = {
  scope: parseAsStringLiteral(scopes).withDefault("personal"),
  teamId: parseAsString.withDefault(""),
  profileId: parseAsString.withDefault(""),
  features: parseAsArrayOf(parseAsStringLiteral(FEATURES), ",").withDefault([]),
  models: parseAsArrayOf(parseAsString, ",").withDefault([]),
  status: parseAsStringLiteral(statuses).withDefault("all"),
  range: parseAsStringLiteral(ranges).withDefault("7d"),
  sortDir: parseAsStringLiteral(sortDirections).withDefault("desc"),
};

// ── Events (formerly the /activity page, then inbox activity tab) ─────────

export const EVENT_TYPES = [
  "memory_created",
  "memory_dream_created",
  "memory_updated",
  "memory_deleted",
  "file_uploaded",
  "sync_completed",
  "api_key_created",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  memory_created: "Memory Created",
  memory_dream_created: "Dream Mode Synthesis",
  memory_updated: "Memory Updated",
  memory_deleted: "Memory Deleted",
  file_uploaded: "File Uploaded",
  sync_completed: "Sync Completed",
  api_key_created: "API Key Created",
};

const eventDatePresets = ["all", "today", "week", "month"] as const;
export type EventDatePreset = (typeof eventDatePresets)[number];

export const EVENT_DATE_PRESET_LABELS: Record<EventDatePreset, string> = {
  all: "All time",
  today: "Today",
  week: "This week",
  month: "This month",
};

export const eventsSearchParams = {
  eventTypes: parseAsArrayOf(
    parseAsStringLiteral(EVENT_TYPES),
    ",",
  ).withDefault([]),
  eventSortDir: parseAsStringLiteral(sortDirections).withDefault("desc"),
  eventRange: parseAsStringLiteral(eventDatePresets).withDefault("all"),
};
