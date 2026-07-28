import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from "nuqs";
import { MEMORY_TYPES } from "@/lib/memories";
import { LIST_ITEM_KINDS } from "@/lib/list-items";
import {
  createSanitizedArrayParser,
  parseAsSanitizedOptionalString,
  parseAsSanitizedSearchQuery,
} from "./sanitized-parsers";

const LIST_VIEW_MODES = ["memories", "tags"] as const;
export type ListViewMode = (typeof LIST_VIEW_MODES)[number];

const memoriesSearchParams = {
  // when set, load that node's neighbourhood (2-hop) — absent → global graph
  focus: parseAsSanitizedOptionalString,
  bench: parseAsInteger.withDefault(0),
  q: parseAsSanitizedSearchQuery,
  tags: createSanitizedArrayParser(parseAsString),
  sources: createSanitizedArrayParser(parseAsString),
  types: createSanitizedArrayParser(parseAsStringLiteral(MEMORY_TYPES)),
  kinds: createSanitizedArrayParser(parseAsStringLiteral(LIST_ITEM_KINDS)),
  view: parseAsStringLiteral(LIST_VIEW_MODES).withDefault("memories"),
};

export type MemoriesSearchParams = inferParserType<typeof memoriesSearchParams>;

export const memoriesNuqsOptions = { history: "replace" } as const;

export { memoriesSearchParams };
export { isNullishQueryValue } from "./sanitized-parsers";
