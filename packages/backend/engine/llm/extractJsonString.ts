import type { ZodType, z } from "zod";

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

/** Strip thinking blocks and markdown fences before JSON.parse. */
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

/** Parse LLM text → JSON → zod; null on any failure. */
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
