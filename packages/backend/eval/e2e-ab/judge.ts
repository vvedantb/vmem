import { z } from "zod";
import { parseJsonString } from "../../engine/llm/extractJsonString.ts";
import type { JudgeResult } from "./types.ts";

const judgeResultSchema = z
  .object({
    score: z.union([
      z.literal(0),
      z.literal(25),
      z.literal(50),
      z.literal(75),
      z.literal(100),
    ]),
    reasoning: z.string(),
    factsHit: z.array(z.string()),
    factsMissed: z.array(z.string()),
    abstained: z.boolean(),
  })
  .strict();

// Passed to `claude --json-schema`.
export const JUDGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number", enum: [0, 25, 50, 75, 100] },
    reasoning: { type: "string" },
    factsHit: { type: "array", items: { type: "string" } },
    factsMissed: { type: "array", items: { type: "string" } },
    abstained: { type: "boolean" },
  },
  required: ["score", "reasoning", "factsHit", "factsMissed", "abstained"],
  additionalProperties: false,
};

// `claude -p --output-format json` wraps the verdict in an envelope.
const envelopeSchema = z.object({
  structured_output: judgeResultSchema.optional().catch(undefined),
  result: z.string().optional().catch(undefined),
});

function parseEnvelope(raw: string): z.infer<typeof envelopeSchema> | null {
  try {
    return envelopeSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Fail closed: null for anything that does not match the strict schema.
export function parseJudgeOutput(raw: string): JudgeResult | null {
  const envelope = parseEnvelope(raw);
  if (envelope?.structured_output !== undefined)
    return envelope.structured_output;
  const text = envelope?.result ?? raw;
  return parseJsonString(text, judgeResultSchema);
}
