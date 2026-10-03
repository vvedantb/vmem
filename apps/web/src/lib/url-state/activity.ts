import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";

// URL filter state for the `/usage` route

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

const aiLogsRanges = ["today", "7d", "30d", "all"] as const;
export type Range = (typeof aiLogsRanges)[number];

export const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  "7d": "Past 7 days",
  "30d": "Past 30 days",
  all: "All time",
};

const sortDirections = ["desc", "asc"] as const;
export type SortDirection = (typeof sortDirections)[number];

// URL value when no single profile is selected — show logs from all profiles
export const PROFILE_FILTER_ALL = "all";

export function isAllProfilesFilter(profileId: string): boolean {
  return profileId === PROFILE_FILTER_ALL || profileId === "";
}

// `scope`/`teamId` intentionally have no static default
export const aiLogsSearchParams = {
  scope: parseAsStringLiteral(scopes),
  teamId: parseAsString,
  profileId: parseAsString.withDefault(PROFILE_FILTER_ALL),
  features: parseAsArrayOf(parseAsStringLiteral(FEATURES), ",").withDefault([]),
  models: parseAsArrayOf(parseAsString, ",").withDefault([]),
  range: parseAsStringLiteral(aiLogsRanges).withDefault("7d"),
  sortDir: parseAsStringLiteral(sortDirections).withDefault("desc"),
};
