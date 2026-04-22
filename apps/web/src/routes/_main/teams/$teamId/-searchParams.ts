import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";

/**
 * URL-backed state for the team detail page. Mirrors the style of
 * `/memories/-searchParams.ts` so we get persistent/shareable tab + filter
 * state without local React state.
 */
const teamTabs = ["overview", "knowledge", "members", "settings"] as const;

export const teamRouteSearchParams = {
  tab: parseAsStringLiteral(teamTabs).withDefault("overview"),
  /** Search query applied to the Knowledge tab list. */
  q: parseAsString.withDefault(""),
  /** Tag filter on Knowledge tab. */
  tags: parseAsArrayOf(parseAsString, ",").withDefault([]),
};

export type TeamTab = (typeof teamTabs)[number];
