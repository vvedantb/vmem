import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";

/**
 * URL-state schema for the `/openrouter-logs` dashboard.
 *
 * - `scope` toggles between the caller's own rows and a team they belong to.
 *   `team` requires a `teamId` query param to disambiguate which team.
 * - `profileId` is a single-select narrow on top of scope (an empty string
 *   means "no filter"; nuqs collapses empty strings to null).
 * - `features` and `models` are multi-selects — when empty we don't push any
 *   filter clause server-side so the index can serve the page directly.
 * - `status` is a tri-state (all / success / error) instead of a boolean so
 *   the URL is self-describing.
 * - `range` matches the cutoff sets in `convex/openRouterLogs.ts`.
 *
 * Default ordering is most-recent-first; `sortDir` only flips the chronology.
 */

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

export const openRouterLogsSearchParams = {
  scope: parseAsStringLiteral(scopes).withDefault("personal"),
  teamId: parseAsString.withDefault(""),
  profileId: parseAsString.withDefault(""),
  features: parseAsArrayOf(parseAsStringLiteral(FEATURES), ",").withDefault([]),
  models: parseAsArrayOf(parseAsString, ",").withDefault([]),
  status: parseAsStringLiteral(statuses).withDefault("all"),
  range: parseAsStringLiteral(ranges).withDefault("7d"),
  sortDir: parseAsStringLiteral(sortDirections).withDefault("desc"),
};
