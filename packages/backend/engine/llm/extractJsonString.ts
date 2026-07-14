import { jsonrepair } from "jsonrepair";
import { z, type ZodType } from "zod";

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

const stringArraySchema = z.array(z.string());
const numberArraySchema = z.array(z.number());

/** Strip model thinking blocks before JSON repair/parse. */
function stripThinkBlocks(raw: string): string {
  const withoutClosedThink = raw
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();

  if (
    withoutClosedThink.startsWith(THINK_OPEN) &&
    withoutClosedThink.indexOf(THINK_CLOSE) === -1
  ) {
    return withoutClosedThink.slice(THINK_OPEN.length).trim();
  }

  return withoutClosedThink;
}

/** First balanced `[...]` substring, or null. */
function extractBalancedArray(source: string): string | null {
  const start = source.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "[") depth++;
    else if (source[i] === "]") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  return null;
}

/**
 * Strip thinking blocks and repair to valid JSON text.
 * Handles fences, trailing commas, missing brackets, etc. via jsonrepair.
 * Throws if the input cannot be repaired.
 */
export function extractJsonString(raw: string): string {
  return jsonrepair(stripThinkBlocks(raw));
}

/** Parse LLM text → repaired JSON → zod; null on any failure. */
export function parseJsonString<T>(
  raw: string,
  schema: ZodType<T, z.ZodTypeDef, unknown>,
): T | null {
  let value: unknown;
  try {
    value = JSON.parse(extractJsonString(raw));
  } catch {
    return null;
  }
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Parse an array from LLM text: full repaired JSON first, then first
 * balanced `[...]` (jsonrepair may wrap surrounding prose into a larger
 * structure). Null on any failure.
 */
export function parseLlmJsonArray<T>(
  content: string,
  schema: ZodType<T, z.ZodTypeDef, unknown>,
): T | null {
  const direct = parseJsonString(content, schema);
  if (direct !== null) return direct;

  const arrayStr = extractBalancedArray(stripThinkBlocks(content));
  if (arrayStr === null) return null;

  try {
    const parsed = schema.safeParse(JSON.parse(jsonrepair(arrayStr)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** String array from LLM JSON, or newline/bullet fallback (capped at 2). */
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

/** Number array from LLM JSON; null unless length matches expectedCount. */
export function parseLlmNumberArray(
  content: string,
  expectedCount: number,
): number[] | null {
  const scores = parseLlmJsonArray(content, numberArraySchema);
  return scores && scores.length === expectedCount ? scores : null;
}
