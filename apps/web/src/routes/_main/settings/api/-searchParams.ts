import { parseAsStringLiteral } from "nuqs";

/**
 * URL state for the merged `/settings/api` page.
 *
 * `keys` (default) lists generated API keys for programmatic access;
 * `usage` charts the request volume / success rate / latency of calls
 * those keys make against the public API.
 */
const apiTabs = ["keys", "usage"] as const;
export type ApiTab = (typeof apiTabs)[number];

export const apiSearchParams = {
  tab: parseAsStringLiteral(apiTabs).withDefault("keys"),
};
