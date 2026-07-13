import type { ZodType, z } from "zod";

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

/**
 * Strip thinking blocks and markdown fences from raw LLM output before JSON.parse.
 */
export function extractJsonString(raw: string): string {
  const withoutClosedThink = raw
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();

  const withoutOpenThink =
    withoutClosedThink.startsWith(THINK_OPEN) &&
    withoutClosedThink.indexOf(THINK_CLOSE) === -1
      ? withoutClosedThink.slice(THINK_OPEN.length).trim()
      : withoutClosedThink;

  if (!withoutOpenThink.startsWith("```")) {
    return withoutOpenThink;
  }

  const match = withoutOpenThink.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match?.[1] ? match[1].trim() : withoutOpenThink;
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
