import { parseAsArrayOf, parseAsStringLiteral } from "nuqs";

export const ACTIVITY_TYPES = [
  "memory_created",
  "memory_updated",
  "memory_deleted",
  "file_uploaded",
  "sync_completed",
  "api_key_created",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  memory_created: "Memory Created",
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

export const activitySearchParams = {
  types: parseAsArrayOf(parseAsStringLiteral(ACTIVITY_TYPES), ",").withDefault(
    [],
  ),
  sortDir: parseAsStringLiteral(sortDirections).withDefault("desc"),
  range: parseAsStringLiteral(datePresets).withDefault("all"),
};
