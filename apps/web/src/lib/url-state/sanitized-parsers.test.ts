// AI-generated (Claude), prompt: "test nuqs sanitized parsers for nullish query values"
// Modified by me: added empty string and serialized null cases
import { describe, expect, it } from "vitest";
import {
  createSanitizedArrayParser,
  isNullishQueryValue,
  parseAsSanitizedOptionalString,
  parseAsSanitizedSearchQuery,
} from "./sanitized-parsers";
import { parseAsString, parseAsStringLiteral } from "nuqs";

describe("isNullishQueryValue", () => {
  it("treats empty and serialized nullish values as nullish", () => {
    expect(isNullishQueryValue("")).toBe(true);
    expect(isNullishQueryValue("null")).toBe(true);
    expect(isNullishQueryValue('"null"')).toBe(true);
    expect(isNullishQueryValue("undefined")).toBe(true);
    expect(isNullishQueryValue("[]")).toBe(true);
    expect(isNullishQueryValue("focus-id")).toBe(false);
  });
});

describe("parseAsSanitizedOptionalString", () => {
  it("parses and serializes optional strings", () => {
    expect(parseAsSanitizedOptionalString.parse("focus-id")).toBe("focus-id");
    expect(parseAsSanitizedOptionalString.parse("null")).toBeNull();
    expect(parseAsSanitizedOptionalString.serialize("focus-id")).toBe(
      "focus-id",
    );
    expect(parseAsSanitizedOptionalString.serialize("")).toBe("");
  });
});

describe("parseAsSanitizedSearchQuery", () => {
  it("sanitizes nullish raw values and defaults to an empty string", () => {
    expect(parseAsSanitizedSearchQuery.parse("null")).toBeNull();
    expect(parseAsSanitizedSearchQuery.defaultValue).toBe("");
    expect(parseAsSanitizedSearchQuery.parse("hello")).toBe("hello");
    expect(parseAsSanitizedSearchQuery.serialize("")).toBe("");
  });
});

describe("createSanitizedArrayParser", () => {
  const kinds = ["memory", "skill"] as const;
  const parser = createSanitizedArrayParser(parseAsStringLiteral(kinds));

  it("parses, serializes, and omits empty arrays", () => {
    expect(parser.parse("memory,skill")).toEqual(["memory", "skill"]);
    expect(parser.parse("null")).toBeNull();
    expect(parser.defaultValue).toEqual([]);
    expect(parser.serialize(["memory"])).toBe("memory");
    expect(parser.serialize([])).toBe("");
  });

  it("compares arrays in order", () => {
    const eq = parser.eq;
    if (!eq) throw new Error("expected parser.eq");
    expect(eq(["memory"], ["memory"])).toBe(true);
    expect(eq(["memory", "skill"], ["skill", "memory"])).toBe(false);
  });

  it("sanitizes arbitrary string arrays", () => {
    const tags = createSanitizedArrayParser(parseAsString);
    expect(tags.parse("react,typescript")).toEqual(["react", "typescript"]);
    expect(tags.serialize(["react", "typescript"])).toBe("react,typescript");
  });
});
