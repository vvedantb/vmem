import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  extractJsonString,
  parseJsonString,
  parseLlmJsonArray,
  parseLlmNumberArray,
  parseLlmStringArray,
} from "../../engine/llm/extractJsonString";

describe("extractJsonString + jsonrepair", () => {
  it("strips think blocks, fences, and trailing commas", () => {
    expect(
      JSON.parse(extractJsonString('<think>x</think>\n```json\n{"a":1,}\n```')),
    ).toEqual({ a: 1 });
  });

  it("parseJsonString validates with zod", () => {
    expect(parseJsonString('{"a":1,}', z.object({ a: z.number() }))).toEqual({
      a: 1,
    });
    expect(parseJsonString("nope", z.object({ a: z.number() }))).toBeNull();
  });

  it("parseLlmJsonArray extracts balanced array from prose", () => {
    expect(
      parseLlmJsonArray("Result:\n[1, 2, 3]\nThanks", z.array(z.number())),
    ).toEqual([1, 2, 3]);
  });

  it("parseLlmNumberArray enforces length", () => {
    expect(parseLlmNumberArray("[1,2]", 2)).toEqual([1, 2]);
    expect(parseLlmNumberArray("[1,2]", 3)).toBeNull();
  });

  it("parseLlmStringArray falls back to bullets", () => {
    expect(parseLlmStringArray("- one\n- two\n- three")).toEqual([
      "one",
      "two",
    ]);
  });
});
