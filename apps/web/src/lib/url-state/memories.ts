import {
  createParser,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from "nuqs";
import { MEMORY_TYPES } from "@/lib/memories";
import { LIST_ITEM_KINDS } from "@/lib/list-items";

// display modes for the list route
const LIST_VIEW_MODES = ["memories", "tags"] as const;
export type ListViewMode = (typeof LIST_VIEW_MODES)[number];

// graph scopes
const GRAPH_SCOPES = ["local", "global"] as const;
export type GraphScope = (typeof GRAPH_SCOPES)[number];

// junk written when TanStack Router serializes nuqs state (e.g
const NULLISH_QUERY_VALUES = new Set(["", "null", '"null"', "undefined", "[]"]);

function isNullishQueryValue(value: string): boolean {
  return NULLISH_QUERY_VALUES.has(value);
}

const parseAsOptionalString = createParser({
  parse(query) {
    if (isNullishQueryValue(query)) return null;
    return query;
  },
  serialize(value) {
    return value ?? "";
  },
});

const parseAsSearchQuery = createParser({
  parse(query) {
    if (isNullishQueryValue(query)) return null;
    return query;
  },
  serialize(value) {
    return value ?? "";
  },
}).withDefault("");

function createSanitizedStringArrayParser() {
  const base = parseAsArrayOf(parseAsString, ",");
  return createParser({
    parse(query) {
      if (isNullishQueryValue(query)) return null;
      return base.parse(query);
    },
    serialize(value) {
      if (value === null || value.length === 0) return "";
      return base.serialize(value);
    },
    eq(a, b) {
      if (a.length !== b.length) return false;
      for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return false;
      }
      return true;
    },
  }).withDefault([]);
}

function createSanitizedLiteralArrayParser<const T extends string>(
  literals: readonly T[],
) {
  const itemParser = parseAsStringLiteral(literals);
  const base = parseAsArrayOf(itemParser, ",");
  return createParser({
    parse(query) {
      if (isNullishQueryValue(query)) return null;
      return base.parse(query);
    },
    serialize(value) {
      if (value === null || value.length === 0) return "";
      return base.serialize(value);
    },
    eq(a, b) {
      if (a.length !== b.length) return false;
      for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return false;
      }
      return true;
    },
  }).withDefault([]);
}

// URL shape (only non-default values should appear): - `q` — search text - `focus`
const memoriesSearchParams = {
  focus: parseAsOptionalString,
  scope: parseAsStringLiteral(GRAPH_SCOPES).withDefault("local"),
  // performance bench
  bench: parseAsInteger.withDefault(0),
  q: parseAsSearchQuery,
  tags: createSanitizedStringArrayParser(),
  sources: createSanitizedStringArrayParser(),
  types: createSanitizedLiteralArrayParser(MEMORY_TYPES),
  kinds: createSanitizedLiteralArrayParser(LIST_ITEM_KINDS),
  view: parseAsStringLiteral(LIST_VIEW_MODES).withDefault("memories"),
};

export type MemoriesSearchParams = inferParserType<typeof memoriesSearchParams>;

// prefer `replace` so filter typing does not flood browser history
export const memoriesNuqsOptions = { history: "replace" } as const;

export { memoriesSearchParams, isNullishQueryValue };
