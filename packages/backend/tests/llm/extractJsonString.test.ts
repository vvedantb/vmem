import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseJsonString,
  parseLlmNumberArray,
  parseLlmStringArray,
} from "../../engine/llm/extractJsonString";

const numberFieldSchema = z.object({ a: z.number() });
const titleFieldSchema = z.object({ title: z.string() });

describe("parseJsonString + jsonrepair", () => {
  it("strips think blocks, fences, and trailing commas", () => {
    expect(
      parseJsonString(
        '<think>x</think>\n```json\n{"a":1,}\n```',
        numberFieldSchema,
      ),
    ).toEqual({ a: 1 });
  });

  it("validates with zod and returns null on schema mismatch", () => {
    expect(parseJsonString('{"a":1,}', numberFieldSchema)).toEqual({
      a: 1,
    });
    expect(parseJsonString("nope", numberFieldSchema)).toBeNull();
  });

  it("returns null for malformed JSON that cannot be repaired", () => {
    expect(parseJsonString("{not json at all", numberFieldSchema)).toBeNull();
  });

  it("repairs trailing commas inside fenced object payloads", () => {
    expect(
      parseJsonString(
        'Here is the result:\n```json\n{"title": "hello",}\n```',
        titleFieldSchema,
      ),
    ).toEqual({ title: "hello" });
  });
});

describe("parseLlmStringArray", () => {
  it("extracts balanced string arrays from prose", () => {
    expect(parseLlmStringArray('Notes:\n["alpha", "beta"]\nThanks')).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("falls back to bullets and caps at two items", () => {
    expect(parseLlmStringArray("- one\n- two\n- three")).toEqual([
      "one",
      "two",
    ]);
  });

  it("uses bullet fallback when JSON array parsing fails", () => {
    expect(parseLlmStringArray("- only\n- two")).toEqual(["only", "two"]);
    expect(parseLlmStringArray("   ")).toEqual([]);
  });
});

describe("parseLlmNumberArray", () => {
  it("extracts balanced number arrays from prose", () => {
    expect(parseLlmNumberArray("Result:\n[1, 2, 3]\nThanks", 3)).toEqual([
      1, 2, 3,
    ]);
  });

  it("enforces expected length", () => {
    expect(parseLlmNumberArray("[1,2]", 2)).toEqual([1, 2]);
    expect(parseLlmNumberArray("[1,2]", 3)).toBeNull();
    expect(parseLlmNumberArray("not numbers", 1)).toBeNull();
  });
});
