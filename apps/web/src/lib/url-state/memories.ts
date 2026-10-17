import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from "nuqs";
import { MEMORY_TYPES } from "@/lib/memories";
import { LIST_ITEM_KINDS } from "@/lib/list-items";
import { TIMELINE_SPANS } from "@/lib/memory-timeline-view";
import {
  createSanitizedArrayParser,
  parseAsSanitizedOptionalString,
  parseAsSanitizedSearchQuery,
} from "./sanitized-parsers";

export const MEMORY_LIST_SORTS = ["recent", "usefulness"] as const;

const memoriesSearchParams = {
  // when set, load that node's neighbourhood (2-hop) — absent → global graph
  focus: parseAsSanitizedOptionalString,
  bench: parseAsInteger.withDefault(0),
  q: parseAsSanitizedSearchQuery,
  tags: createSanitizedArrayParser(parseAsString),
  sources: createSanitizedArrayParser(parseAsString),
  types: createSanitizedArrayParser(parseAsStringLiteral(MEMORY_TYPES)),
  kinds: createSanitizedArrayParser(parseAsStringLiteral(LIST_ITEM_KINDS)),
  span: parseAsStringLiteral(TIMELINE_SPANS).withDefault("week"),
  // "usefulness" sorts the loaded list rows (best effort: loaded pages only)
  sort: parseAsStringLiteral(MEMORY_LIST_SORTS).withDefault("recent"),
};

export type MemoriesSearchParams = inferParserType<typeof memoriesSearchParams>;

export const memoriesNuqsOptions = { history: "replace" } as const;

export { memoriesSearchParams };
export { isNullishQueryValue } from "./sanitized-parsers";

// `/memories/list?view=tags` used to host the tags list; keep those deep links
export function memoriesTagsViewRedirectHref(
  profileId: string,
  searchStr: string,
): string | null {
  const query = new URLSearchParams(
    searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
  );
  if (query.get("view") !== "tags") return null;
  query.delete("view");
  const qs = query.toString();
  return `/${profileId}/memories/tags${qs.length > 0 ? `?${qs}` : ""}`;
}
