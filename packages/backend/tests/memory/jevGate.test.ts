import { describe, expect, it, vi } from "vitest";
import type { MemoryCandidate } from "@vmem/sdk";
import type { SystemOneResponse } from "../../engine/llm/systemOneClient";
import {
  DEFAULT_JEV_RELEVANCE_THRESHOLD,
  JEV_BEST_NONE,
  JEV_GATE_HEAD,
  JEV_SCORE_CRITERIA,
  applyJevRetrieveGate,
  buildJevRetrieveQuestions,
  jevRankPoolLimit,
  wantsJevJudge,
  wantsLocalRerank,
} from "../../engine/memory/jevGate";

function hit(
  id: string,
  title: string,
  content: string,
  score: number,
): MemoryCandidate {
  return {
    id,
    userId: "user_a",
    profileId: "profile_a",
    title,
    content,
    type: "knowledge",
    source: "api",
    sourceType: null,
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: 0.9,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    tags: ["tooling"],
    trace: {
      score,
      scoreBreakdown: {
        fulltext: score,
        vector: 0,
        chunk: 0,
        entity: 0,
        rrf: score,
        recency: 0.5,
        temporal: 0,
        confidence: 0.9,
      },
      reason: "fulltext and synonym match",
    },
  };
}

const pnpm = hit("mem_pnpm", "Prefers pnpm", "Use pnpm for vmem", 0.9);
const coffee = hit(
  "mem_coffee",
  "Coffee order",
  "Oat latte every morning",
  0.4,
);
const m1 = hit("m1", "Convex is vmem store", "Memories live in Convex", 0.8);
const m2 = hit("m2", "Coffee order", "Oat latte every morning", 0.5);
const m3 = hit("m3", "Helix editor", "User prefers Helix", 0.4);

function gateResponse(overrides: {
  pnpm?: number;
  coffee?: number;
  pnpmScore?: number;
  coffeeScore?: number;
  best?: string;
  bestConfidence?: number;
}): SystemOneResponse {
  return {
    model: "jev-latest",
    answers: {
      rel_0: { type: "noul", noul: overrides.pnpm ?? 0.95 },
      rel_1: { type: "noul", noul: overrides.coffee ?? 0.1 },
      sc_0: {
        type: "score",
        score: overrides.pnpmScore ?? 2,
        legend: {
          "0": "irrelevant",
          "1": "weakly related",
          "2": "directly answers",
        },
        probabilities: { "0": 0.05, "1": 0.1, "2": 0.85 },
        confidence: 0.8,
      },
      sc_1: {
        type: "score",
        score: overrides.coffeeScore ?? 0,
        legend: {
          "0": "irrelevant",
          "1": "weakly related",
          "2": "directly answers",
        },
        probabilities: { "0": 0.9, "1": 0.08, "2": 0.02 },
        confidence: 0.75,
      },
      best: {
        type: "choice",
        choice: overrides.best ?? "h0",
        probabilities: { h0: 0.8, h1: 0.1, none: 0.1 },
        confidence: overrides.bestConfidence ?? 0.7,
      },
    },
  };
}

describe("wantsJevJudge", () => {
  it("defaults on; judge off is ablation-only", () => {
    expect(wantsJevJudge({})).toBe(true);
    expect(wantsJevJudge({ rerank: true })).toBe(true);
    expect(wantsJevJudge({ rerank: false })).toBe(true);
    expect(wantsJevJudge({ judge: "jev" })).toBe(true);
    expect(wantsJevJudge({ rerank: "jev" })).toBe(true);
    expect(wantsJevJudge({ judge: "off" })).toBe(false);
    expect(wantsJevJudge({ judge: "off", rerank: "jev" })).toBe(false);
    expect(jevRankPoolLimit(10, false)).toBe(10);
    expect(jevRankPoolLimit(10, true)).toBe(JEV_GATE_HEAD);
    expect(jevRankPoolLimit(50, true)).toBe(50);
  });

  it("skips local #179 extra when Jev will run", () => {
    expect(wantsLocalRerank({})).toBe(false);
    expect(wantsLocalRerank({ rerank: true })).toBe(false);
    expect(wantsLocalRerank({ rerank: true, judge: "off" })).toBe(true);
    expect(wantsLocalRerank({ rerank: true }, false)).toBe(true);
    expect(wantsLocalRerank({ rerank: true }, true)).toBe(false);
    expect(wantsLocalRerank({ rerank: "jev" })).toBe(false);
    expect(wantsLocalRerank({ judge: "jev", rerank: true })).toBe(false);
  });
});

describe("buildJevRetrieveQuestions", () => {
  it("packs noul keep, score rubric, and choice best with top-level criteria", () => {
    const questions = buildJevRetrieveQuestions([pnpm, coffee]);
    expect(questions.rel_0).toEqual({
      type: "noul",
      instructions:
        "Keep this memory as an answer to the query (not a lexical trap)?",
      criteria: {
        true: "The memory actually answers the query; shared keywords are not enough",
        false: "Lexical overlap, wrong sense, stale, or unrelated",
      },
    });
    expect(questions.sc_0).toEqual({
      type: "score",
      instructions: "How well does this memory answer the query?",
      criteria: [...JEV_SCORE_CRITERIA],
    });
    expect(questions.rel_1?.type).toBe("noul");
    expect(questions.sc_1?.type).toBe("score");
    expect(questions.best).toMatchObject({
      type: "choice",
      criteria: expect.objectContaining({
        [JEV_BEST_NONE]: "None of the memories correctly answer the query",
        h0: expect.stringContaining("Prefers pnpm"),
        h1: expect.stringContaining("Coffee order"),
      }),
    });
    expect(questions.best).not.toHaveProperty("choice");
    expect(questions.sc_0).not.toHaveProperty("score");
  });
});

describe("applyJevRetrieveGate", () => {
  it("ranks live-smoke Convex vmem gold first and keeps lexical traps", async () => {
    const evaluate = vi.fn(async () => ({
      model: "jev-latest",
      answers: {
        rel_0: { type: "noul" as const, noul: 0.66 },
        rel_1: { type: "noul" as const, noul: 0.03 },
        rel_2: { type: "noul" as const, noul: 0.03 },
        sc_0: {
          type: "score" as const,
          score: 2,
          legend: {
            "0": "irrelevant",
            "1": "weakly related",
            "2": "directly answers",
          },
          probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 },
          confidence: 0.7,
        },
        sc_1: {
          type: "score" as const,
          score: 0,
          legend: {
            "0": "irrelevant",
            "1": "weakly related",
            "2": "directly answers",
          },
          probabilities: { "0": 0.9, "1": 0.08, "2": 0.02 },
          confidence: 0.8,
        },
        sc_2: {
          type: "score" as const,
          score: 0,
          legend: {
            "0": "irrelevant",
            "1": "weakly related",
            "2": "directly answers",
          },
          probabilities: { "0": 0.9, "1": 0.08, "2": 0.02 },
          confidence: 0.8,
        },
        best: {
          type: "choice" as const,
          choice: "h0",
          probabilities: { h0: 0.85, h1: 0.07, h2: 0.05, none: 0.03 },
          confidence: 0.77,
        },
      },
    }));
    const gated = await applyJevRetrieveGate({
      query: "Convex vmem",
      hits: [m1, m2, m3],
      apiKey: "test-key",
      evaluate,
    });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(gated.map((row) => row.id)).toEqual(["m1", "m2", "m3"]);
    expect(gated[0]?.trace.scoreBreakdown.jevRelevant).toBe(0.66);
    expect(gated[0]?.trace.scoreBreakdown.jevBest).toBe(true);
    expect(gated[0]?.trace.scoreBreakdown.jevConfidence).toBe(0.77);
    expect(gated[1]?.trace.scoreBreakdown.jevRelevant).toBe(0.03);
    expect(gated[2]?.trace.scoreBreakdown.jevRelevant).toBe(0.03);
    expect(DEFAULT_JEV_RELEVANCE_THRESHOLD).toBeLessThan(0.66);
    expect(DEFAULT_JEV_RELEVANCE_THRESHOLD).toBeGreaterThan(0.03);
  });

  it("keeps low-noul hits and orders by Jev score then noul", async () => {
    const evaluate = vi.fn(async () =>
      gateResponse({ pnpm: 0.91, coffee: 0.12, best: "h0" }),
    );
    const gated = await applyJevRetrieveGate({
      query: "what package manager?",
      hits: [pnpm, coffee],
      apiKey: "test-key",
      evaluate,
    });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(gated.map((row) => row.id)).toEqual(["mem_pnpm", "mem_coffee"]);
    expect(gated[0]?.trace.scoreBreakdown.jevRelevant).toBe(0.91);
    expect(gated[0]?.trace.scoreBreakdown.jevScore).toBe(2);
    expect(gated[0]?.trace.scoreBreakdown.jevBest).toBe(true);
    expect(gated[0]?.trace.scoreBreakdown.fulltext).toBe(0.9);
    expect(gated[0]?.trace.reason).toContain("Jev relevant");
    expect(gated[1]?.trace.scoreBreakdown.jevRelevant).toBe(0.12);
    expect(gated[1]?.trace.scoreBreakdown.jevScore).toBe(0);
    expect(gated[1]?.id).toBe("mem_coffee");
  });

  it("promotes the Choice winner to the front of the reranked list", async () => {
    const evaluate = vi.fn(async () =>
      gateResponse({
        pnpm: 0.88,
        coffee: 0.8,
        pnpmScore: 2,
        coffeeScore: 1,
        best: "h1",
      }),
    );
    const gated = await applyJevRetrieveGate({
      query: "what package manager?",
      hits: [pnpm, coffee],
      apiKey: "test-key",
      evaluate,
    });
    expect(gated.map((row) => row.id)).toEqual(["mem_coffee", "mem_pnpm"]);
    expect(gated[0]?.trace.scoreBreakdown.jevBest).toBe(true);
    expect(gated[1]?.trace.scoreBreakdown.jevBest).toBeUndefined();
  });

  it("keeps the full head when best is none and every noul is below 0.5", async () => {
    const evaluate = vi.fn(async () =>
      gateResponse({
        pnpm: 0.1,
        coffee: 0.12,
        pnpmScore: 0,
        coffeeScore: 1,
        best: JEV_BEST_NONE,
      }),
    );
    const gated = await applyJevRetrieveGate({
      query: "what package manager?",
      hits: [pnpm, coffee],
      apiKey: "test-key",
      evaluate,
    });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(gated).toHaveLength(2);
    expect(gated.map((row) => row.id)).toEqual(["mem_coffee", "mem_pnpm"]);
    expect(gated[0]?.trace.scoreBreakdown.jevScore).toBe(1);
    expect(gated[1]?.trace.scoreBreakdown.jevScore).toBe(0);
    expect(
      gated.every((row) => row.trace.scoreBreakdown.jevBest !== true),
    ).toBe(true);
  });

  it("keeps hybrid ranking when Jev throws", async () => {
    const gated = await applyJevRetrieveGate({
      query: "what package manager?",
      hits: [pnpm, coffee],
      apiKey: "test-key",
      limit: 2,
      evaluate: async () => {
        throw new Error("network");
      },
    });
    expect(gated.map((row) => row.id)).toEqual(["mem_pnpm", "mem_coffee"]);
    expect(gated[0]?.trace.scoreBreakdown.jevRelevant).toBeUndefined();
  });

  it("does not call Jev for an empty query or empty pool", async () => {
    const evaluate = vi.fn(async () => gateResponse({}));
    const emptyQuery = await applyJevRetrieveGate({
      query: "   ",
      hits: [pnpm],
      apiKey: "test-key",
      evaluate,
    });
    const emptyHits = await applyJevRetrieveGate({
      query: "pnpm",
      hits: [],
      apiKey: "test-key",
      evaluate,
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(emptyQuery.map((row) => row.id)).toEqual(["mem_pnpm"]);
    expect(emptyHits).toEqual([]);
  });
});
