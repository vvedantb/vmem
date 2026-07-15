import { createParser, parseAsArrayOf, parseAsString, type Parser } from "nuqs";

const NULLISH_QUERY_VALUES = new Set(["", "null", '"null"', "undefined", "[]"]);

export function isNullishQueryValue(value: string): boolean {
  return NULLISH_QUERY_VALUES.has(value);
}

export const parseAsSanitizedOptionalString = createParser({
  parse(query) {
    if (isNullishQueryValue(query)) return null;
    return query;
  },
  serialize(value) {
    return value ?? "";
  },
});

export const parseAsSanitizedSearchQuery =
  parseAsSanitizedOptionalString.withDefault("");

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

export function createSanitizedArrayParser<T>(itemParser: Parser<T>) {
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
    eq: arraysEqual,
  }).withDefault([]);
}
