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

const GRAPH_SCOPES = ["local", "global"] as const;
export type GraphScope = (typeof GRAPH_SCOPES)[number];

const memoriesSearchParams = {
  focus: parseAsSanitizedOptionalString,
  scope: parseAsStringLiteral(GRAPH_SCOPES).withDefault("local"),
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
