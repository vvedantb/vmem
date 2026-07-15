import { tryExtractJson } from "json-from-llm";
import { jsonrepair } from "jsonrepair";
import { z, type ZodType } from "zod";

const stringArraySchema = z.array(z.string());
const numberArraySchema = z.array(z.number());

type JsonExpect = "any" | "array";

function parseLlmJson(raw: string, expect: JsonExpect): unknown {
  const extracted = tryExtractJson<unknown>(raw, { expect });
  if (extracted.found) return extracted.value;
  return JSON.parse(jsonrepair(raw));
}

function safeParseLlmJson(raw: string, expect: JsonExpect): unknown | null {
  try {
    return parseLlmJson(raw, expect);
  } catch {
    return null;
  }
}

function parseLlmJsonArray<T>(
  raw: string,
  schema: ZodType<T, z.ZodTypeDef, unknown>,
): T | null {
  const value = safeParseLlmJson(raw, "array");
  if (value === null) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// parse LLM text → repaired JSON → zod; null on any failure
export function parseJsonString<T>(
  raw: string,
  schema: ZodType<T, z.ZodTypeDef, unknown>,
): T | null {
  const value = safeParseLlmJson(raw, "any");
  if (value === null) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// string array from LLM JSON, or newline/bullet fallback (capped at 2)
export function parseLlmStringArray(content: string): string[] {
  const values = parseLlmJsonArray(content, stringArraySchema);
  const trimmed = values?.map((v) => v.trim()).filter((v) => v.length > 0);
  if (trimmed && trimmed.length > 0) return trimmed;

  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.]+\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 2);
}

// number array from LLM JSON; null unless length matches expectedCount
export function parseLlmNumberArray(
  content: string,
  expectedCount: number,
): number[] | null {
  const scores = parseLlmJsonArray(content, numberArraySchema);
  return scores && scores.length === expectedCount ? scores : null;
}
