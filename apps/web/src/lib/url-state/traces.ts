import { parseAsString, parseAsStringLiteral } from "nuqs";
import { PROFILE_FILTER_ALL } from "./activity";

// URL filter state for the `/traces` route

const TRACE_STATUSES = ["all", "ok", "error"] as const;
export type TraceStatus = (typeof TRACE_STATUSES)[number];

// URL value when no tool is selected — show every tool
export const TOOL_FILTER_ALL = "";

export const tracesSearchParams = {
  tool: parseAsString.withDefault(TOOL_FILTER_ALL),
  status: parseAsStringLiteral(TRACE_STATUSES).withDefault("all"),
  profileId: parseAsString.withDefault(PROFILE_FILTER_ALL),
};
