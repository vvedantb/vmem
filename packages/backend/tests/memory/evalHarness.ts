import { afterAll, beforeAll, vi } from "vitest";

/** Fixed eval "now". Corpus ages and rolling query windows share this instant. */
const EVAL_NOW_MS = Date.parse("2026-07-18T12:00:00.000Z");

/**
 * Makes a labelled eval file deterministic and offline. `Date` is pinned, so
 * corpus timestamps and temporal windows cannot drift apart on a slow machine.
 * Embeddings stay synthetic unless `EVAL_EMBEDDINGS=gateway` opts in.
 */
export function useDeterministicEval(): void {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: EVAL_NOW_MS });
    if (process.env.EVAL_EMBEDDINGS !== "gateway") {
      vi.stubEnv("AI_GATEWAY_API_KEY", "");
    }
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
}
