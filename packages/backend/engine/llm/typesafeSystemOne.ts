import { z } from "zod";
import { clamp01 } from "../memory/usefulness";

/**
 * Separate TypeSafe System One HTTP client for usefulness quality scoring.
 * Retrieve-time Jev uses the AI Gateway (`systemOneClient.ts`), not this.
 */
export const TYPESAFE_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
export const TYPESAFE_JEV_MODEL = "jev-1.14.0";
export const TYPESAFE_API_KEY_ENV = "TYPESAFE_API_KEY";

const REQUEST_TIMEOUT_MS = 30_000;
const STATE_CONTENT_CHARS = 1_500;

export const USEFUL_QUESTION_NAME = "useful";
export const USEFUL_CRITERIA = [
  "Not useful: spam, ephemeral noise, duplicate, or no lasting fact",
  "Slightly useful: weak or narrow signal",
  "Moderately useful: clear fact but limited durability",
  "Highly useful: specific, durable, unique, worth remembering",
] as const;

const usefulQuestion = {
  type: "score",
  instructions:
    "How useful is this memory for an AI assistant helping the user later (specific, durable, non-duplicate)?",
  criteria: [...USEFUL_CRITERIA],
} as const;

const responseSchema = z.object({
  answers: z.object({
    [USEFUL_QUESTION_NAME]: z.object({
      type: z.literal("score"),
      score: z.number(),
    }),
  }),
});

export interface UsefulnessMemoryState {
  title: string;
  content: string;
  source: string;
  sourceType?: string;
  tags: string[];
}

export function readTypesafeApiKey(): string | undefined {
  const key = process.env[TYPESAFE_API_KEY_ENV]?.trim();
  return key === undefined || key.length === 0 ? undefined : key;
}

/**
 * Outcome of one Jev call. `auth_error` (401/403) means the key is bad: the
 * caller must stop the whole batch. `failed` is per-row and may be retried.
 */
type JevResult =
  | { status: "ok"; quality: number }
  | { status: "skipped" }
  | { status: "auth_error"; httpStatus: number }
  | { status: "failed"; httpStatus?: number };

/** Scores one memory in 0..1. Never throws (fail-open: heuristic stays). */
export async function scoreMemoryUsefulness(args: {
  apiKey: string | undefined;
  memory: UsefulnessMemoryState;
  fetchImpl?: typeof fetch;
}): Promise<JevResult> {
  if (args.apiKey === undefined || args.apiKey.trim().length === 0) {
    return { status: "skipped" };
  }
  const doFetch = args.fetchImpl ?? fetch;
  try {
    const response = await doFetch(TYPESAFE_SYSTEMONE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TYPESAFE_JEV_MODEL,
        state: {
          title: args.memory.title,
          content: args.memory.content.slice(0, STATE_CONTENT_CHARS),
          source: args.memory.source,
          sourceType: args.memory.sourceType,
          tags: args.memory.tags,
        },
        questions: { [USEFUL_QUESTION_NAME]: usefulQuestion },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[usefulness] TypeSafe HTTP ${String(response.status)}`);
      if (response.status === 401 || response.status === 403) {
        return { status: "auth_error", httpStatus: response.status };
      }
      return { status: "failed", httpStatus: response.status };
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn("[usefulness] TypeSafe response did not parse");
      return { status: "failed" };
    }
    const score = parsed.data.answers[USEFUL_QUESTION_NAME].score;
    return {
      status: "ok",
      quality: clamp01(score / (USEFUL_CRITERIA.length - 1)),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn("[usefulness] TypeSafe request failed:", message);
    return { status: "failed" };
  }
}
