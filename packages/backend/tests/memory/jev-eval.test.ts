import { describe, expect, it } from "vitest";
import type { SystemOneResponse } from "../../engine/llm/systemOneClient";
import { DEFAULT_JEV_RELEVANCE_THRESHOLD } from "../../engine/memory/jevGate";
import type { BenchmarkMemory } from "../../eval/corpus";
import {
  EVAL_JEV_KEY_REQUIRED,
  evalJevEnabled,
  retrieveEval,
  toEvalMemory,
  type EvalJudge,
  type RetrieveEvalOptions,
} from "../../eval/retrieve";
import { runJevGateComparison } from "../../eval/benchmark";

function benchMemory(
  id: string,
  title: string,
  content: string,
): BenchmarkMemory {
  return {
    id,
    userId: "user_vmem_bench_eval",
    title,
    content,
    type: "knowledge",
    source: "bench-corpus",
    confidence: 0.9,
    status: "active",
    tags: ["tooling"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
  };
}

function jevAnswers(keep: readonly number[]): SystemOneResponse {
  const answers: SystemOneResponse["answers"] = {
    best: {
      type: "choice",
      choice: "h0",
      probabilities: { h0: 0.8, none: 0.2 },
      confidence: 0.7,
    },
  };
  for (let i = 0; i < keep.length; i += 1) {
    const noul = keep[i] ?? 0;
    answers[`rel_${String(i)}`] = { type: "noul", noul };
    answers[`sc_${String(i)}`] = {
      type: "score",
      score: noul >= DEFAULT_JEV_RELEVANCE_THRESHOLD ? 2 : 0,
      legend: {
        "0": "irrelevant",
        "1": "weakly related",
        "2": "directly answers",
      },
      probabilities: { "0": 0.1, "1": 0.1, "2": 0.8 },
      confidence: 0.7,
    };
  }
  return { model: "jev-latest", answers };
}

const pnpm = toEvalMemory(
  benchMemory("mem_pnpm", "Prefers pnpm", "Use pnpm for vmem installs"),
);
const coffee = toEvalMemory(
  benchMemory(
    "mem_coffee",
    "Coffee order",
    "Oat latte every morning — not a package manager",
  ),
);

async function ranked(
  judge: EvalJudge | undefined,
  extras: Partial<RetrieveEvalOptions> = {},
) {
  return retrieveEval([pnpm, coffee], "what package manager?", {
    legs: {
      vector: false,
      graph: false,
      recency: false,
      temporal: false,
      chunk: false,
      entity: false,
    },
    queryEmbedding: [],
    memoryEmbeddings: new Map(),
    links: [],
    limit: 10,
    judge,
    ...extras,
  });
}

describe("labelled eval retrieve Jev wiring", () => {
  it("applies judge jev after hybrid and keeps low-noul hits reranked", async () => {
    const gated = await ranked("jev", {
      apiKey: "test-key",
      evaluate: async () => jevAnswers([0.66, 0.03]),
    });
    expect(gated.map((row) => row.id)).toEqual(["mem_pnpm", "mem_coffee"]);
    expect(gated[0]?.trace.scoreBreakdown.jevRelevant).toBe(0.66);
    expect(gated[1]?.trace.scoreBreakdown.jevRelevant).toBe(0.03);
  });

  it("treats rerank jev as the same gate", async () => {
    const gated = await ranked(undefined, {
      rerank: "jev",
      apiKey: "test-key",
      evaluate: async () => jevAnswers([0.91, 0.12]),
    });
    expect(gated.map((row) => row.id)).toEqual(["mem_pnpm", "mem_coffee"]);
  });

  it("fails closed when EVAL_JEV requires a live key", async () => {
    await expect(
      ranked("jev", { requireJevKey: true, apiKey: "" }),
    ).rejects.toThrow(EVAL_JEV_KEY_REQUIRED);
  });

  it("applies Jev by default when jevDefaultOn is set", async () => {
    const gated = await ranked(undefined, {
      jevDefaultOn: true,
      apiKey: "test-key",
      evaluate: async () => jevAnswers([0.66, 0.03]),
    });
    expect(gated.map((row) => row.id)).toEqual(["mem_pnpm", "mem_coffee"]);
    expect(gated[0]?.trace.scoreBreakdown.jevRelevant).toBe(0.66);
  });

  it("judge off skips Jev even when default-on", async () => {
    let called = false;
    const gated = await ranked("off", {
      jevDefaultOn: true,
      apiKey: "test-key",
      evaluate: async () => {
        called = true;
        return jevAnswers([0.66, 0.03]);
      },
    });
    expect(called).toBe(false);
    expect(
      gated.every((hit) => hit.trace.scoreBreakdown.jevRelevant === undefined),
    ).toBe(true);
  });
});

describe.skipIf(!evalJevEnabled())(
  "labelled default (Jev on) vs hybrid-only (live System One)",
  () => {
    it("reports side-by-side IR metrics from real Jev calls", async () => {
      const { hybrid, gated, report } = await runJevGateComparison();
      console.log(`\n${report}\n`);
      expect(hybrid.outcomes).toHaveLength(81);
      expect(gated.outcomes).toHaveLength(81);
      expect(gated.jev?.calls).toBeGreaterThan(0);
      expect(hybrid.jev).toBeUndefined();
    }, 900_000);
  },
);
