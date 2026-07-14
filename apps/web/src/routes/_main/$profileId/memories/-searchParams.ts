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

/**
 * Display modes for the list route. "memories" shows the unified list of
 * memories + wiki + skills (default); "tags" shows aggregated tag rows with
 * rename/delete actions, replacing the now-removed `/memories/tags` route.
 */
const LIST_VIEW_MODES = ["memories", "tags"] as const;
export type ListViewMode = (typeof LIST_VIEW_MODES)[number];

/**
 * Graph scopes. "local" (default) shows the focused memory's neighbourhood —
 * the focus falls back to the newest memory when unset. "global" shows the
 * whole capped graph. Local-by-default keeps first paint small and fast.
 */
const GRAPH_SCOPES = ["local", "global"] as const;
export type GraphScope = (typeof GRAPH_SCOPES)[number];

/** Junk written when TanStack Router serializes nuqs state (e.g. `search={params}`). */
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

/**
 * URL shape (only non-default values should appear):
 * - `q` — search text
 * - `focus` — memory id for graph focus mode (unset in local scope → newest memory)
 * - `scope` — `global` for the full graph (default `local` is omitted)
 * - `tags` / `sources` / `types` / `kinds` — comma-separated (e.g. `tags=react,ts`)
 * - `view` — `tags` when on tag rows (default `memories` is omitted)
 */
const memoriesSearchParams = {
  focus: parseAsOptionalString,
  scope: parseAsStringLiteral(GRAPH_SCOPES).withDefault("local"),
  /**
   * Performance bench: `?bench=100000` renders a synthetic graph of that many
   * nodes (client-generated, no server fetch) so graph performance can be
   * verified at scales beyond the account's real data. 0 = off (default).
   */
  bench: parseAsInteger.withDefault(0),
  q: parseAsSearchQuery,
  tags: createSanitizedStringArrayParser(),
  sources: createSanitizedStringArrayParser(),
  types: createSanitizedLiteralArrayParser(MEMORY_TYPES),
  kinds: createSanitizedLiteralArrayParser(LIST_ITEM_KINDS),
  view: parseAsStringLiteral(LIST_VIEW_MODES).withDefault("memories"),
};

export type MemoriesSearchParams = inferParserType<typeof memoriesSearchParams>;

/** Prefer `replace` so filter typing does not flood browser history. */
export const memoriesNuqsOptions = { history: "replace" } as const;

export { memoriesSearchParams, isNullishQueryValue };
