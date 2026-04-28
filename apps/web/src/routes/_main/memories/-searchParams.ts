import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";
import { MEMORY_TYPES } from "@/lib/memories";
import { LIST_ITEM_KINDS } from "@/lib/list-items";

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
};

export { memoriesSearchParams };
