import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";
import { MEMORY_TYPES } from "@/lib/memories";
import { LIST_ITEM_KINDS } from "@/lib/list-items";

/**
 * Display modes for the list route. "memories" shows the unified list of
 * memories + wiki + skills (default); "tags" shows aggregated tag rows with
 * rename/delete actions, replacing the now-removed `/memories/tags` route.
 */
export const LIST_VIEW_MODES = ["memories", "tags"] as const;
export type ListViewMode = (typeof LIST_VIEW_MODES)[number];

const memoriesSearchParams = {
  /** When set, graph shows 2-hop local subgraph around this memory ID */
  focus: parseAsString,
  /** Profile filter — when set, only show memories from this profile */
  profile: parseAsString,
  /** Search query for filtering items */
  q: parseAsString.withDefault(""),
  tags: parseAsArrayOf(parseAsString, ",").withDefault([]),
  sources: parseAsArrayOf(parseAsString, ",").withDefault([]),
  types: parseAsArrayOf(parseAsStringLiteral(MEMORY_TYPES), ",").withDefault(
    [],
  ),
  /** List-view kind filter — mirrors the graph's Kind filter. */
  kinds: parseAsArrayOf(parseAsStringLiteral(LIST_ITEM_KINDS), ",").withDefault(
    [],
  ),
  /** Which presentation the list route renders — memory rows or tag rows. */
  view: parseAsStringLiteral(LIST_VIEW_MODES).withDefault("memories"),
};

export { memoriesSearchParams };
