import { isEqual } from "es-toolkit";
import { createParser, parseAsArrayOf, type Parser } from "nuqs";

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
    eq: isEqual,
  }).withDefault([]);
}
