import { type ZodType, z } from "zod";

/**
 * Strip thinking blocks and markdown fences from raw LLM output before JSON.parse.
 */
export function extractJsonString(raw: string): string {
  let jsonStr = raw.trim();

  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  if (jsonStr.startsWith("<think>")) {
    const closeIdx = jsonStr.indexOf("</think>");
    if (closeIdx === -1) {
      jsonStr = jsonStr.slice(7).trim();
    }
  }

  if (jsonStr.startsWith("```")) {
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match?.[1]) {
      jsonStr = match[1].trim();
    }
  }

  return jsonStr;
}

/**
 * Parse a raw LLM text response into a validated value.
 *
 * Strips think-blocks/fences, `JSON.parse`s, then validates with zod. Returns
 * null on any failure — LLM output is best-effort, so callers fall back rather
 * than throw. Replaces hand-rolled JSON scanners.
 */
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
