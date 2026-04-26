import { parseAsArrayOf, parseAsStringLiteral } from "nuqs";

/**
 * Inbox URL state.
 *
 * `tab` chooses which panel renders (proposals / notifications / activity).
 * The activity-specific filter params live alongside it so a filtered
 * activity view survives navigation back to the inbox via URL share.
 */

const inboxTabs = ["proposals", "notifications", "activity"] as const;
export type InboxTab = (typeof inboxTabs)[number];

export const ACTIVITY_TYPES = [
  "memory_created",
  "memory_dream_created",
  "memory_updated",
  "memory_deleted",
  "file_uploaded",
  "sync_completed",
  "api_key_created",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  memory_created: "Memory Created",
  memory_dream_created: "Dream Mode Synthesis",
  memory_updated: "Memory Updated",
  memory_deleted: "Memory Deleted",
  file_uploaded: "File Uploaded",
  sync_completed: "Sync Completed",
  api_key_created: "API Key Created",
};

const sortDirections = ["desc", "asc"] as const;
export type SortDirection = (typeof sortDirections)[number];

const datePresets = ["all", "today", "week", "month"] as const;
export type DatePreset = (typeof datePresets)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: "All time",
  today: "Today",
  week: "This week",
  month: "This month",
};

export const inboxSearchParams = {
  tab: parseAsStringLiteral(inboxTabs).withDefault("proposals"),
};

export const activitySearchParams = {
  types: parseAsArrayOf(parseAsStringLiteral(ACTIVITY_TYPES), ",").withDefault(
    [],
  ),
  sortDir: parseAsStringLiteral(sortDirections).withDefault("desc"),
  range: parseAsStringLiteral(datePresets).withDefault("all"),
};
