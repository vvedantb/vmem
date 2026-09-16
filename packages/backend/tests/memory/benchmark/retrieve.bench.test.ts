import { describe, expect, it } from "vitest";
import { rankMemories } from "../../../engine/memory/retrieve";
import { substringRetrieve } from "./baseline";
import { HARD_CASES, SYNTHETIC_CORPUS, SYNTHETIC_QUERIES } from "./corpus";
import { mean, mrr, ndcgAtK, recallAtK, type QueryMetrics } from "./metrics";

const LIMIT = 5;

interface SuiteResult {
  label: string;
  metrics: QueryMetrics[];
  latencyMs: number;
}

function evaluateSuite(
  label: string,
  retrieve: typeof rankMemories,
): SuiteResult {
  const started = performance.now();
  const metrics: QueryMetrics[] = SYNTHETIC_QUERIES.map((entry) => {
    const ranked = retrieve(SYNTHETIC_CORPUS, entry.query, { limit: LIMIT });
    const ids = ranked.map((memory) => memory.id);
    return {
      id: entry.id,
      recall1: recallAtK(ids, entry.relevant, 1),
      recall5: recallAtK(ids, entry.relevant, 5),
      mrr: mrr(ids, entry.relevant),
      ndcg5: ndcgAtK(ids, entry.relevant, 5),
    };
  });
  return {
    label,
    metrics,
    latencyMs: performance.now() - started,
  };
}

function report(suite: SuiteResult): string {
  const lines = [
    `${suite.label}  latency=${suite.latencyMs.toFixed(2)}ms`,
    "id\tR@1\tR@5\tMRR\tnDCG@5",
  ];
  for (const row of suite.metrics) {
    lines.push(
      `${row.id}\t${row.recall1.toFixed(2)}\t${row.recall5.toFixed(2)}\t${row.mrr.toFixed(2)}\t${row.ndcg5.toFixed(2)}`,
    );
  }
  lines.push(
    `mean\t${mean(suite.metrics.map((row) => row.recall1)).toFixed(3)}\t${mean(suite.metrics.map((row) => row.recall5)).toFixed(3)}\t${mean(suite.metrics.map((row) => row.mrr)).toFixed(3)}\t${mean(suite.metrics.map((row) => row.ndcg5)).toFixed(3)}`,
  );
  return lines.join("\n");
}

describe("memory retrieval quality benchmark", () => {
  const baseline = evaluateSuite(
    "baseline substring",
    (memories, query, options) =>
      substringRetrieve(memories, query, options?.limit ?? LIMIT),
  );
  const improved = evaluateSuite("hybrid rank", rankMemories);

  it("prints baseline vs hybrid metrics", () => {
    console.log(`\n${report(baseline)}\n\n${report(improved)}\n`);
    console.log(
      "hard cases (not gated):",
      HARD_CASES.map((entry) => `${entry.id}: ${entry.note}`).join(" | "),
    );
    expect(improved.metrics.length).toBe(SYNTHETIC_QUERIES.length);
  });

  it("is near-perfect on exact, synonym, paraphrase, and entity queries", () => {
    for (const row of improved.metrics) {
      expect(row.mrr, `${row.id} MRR (top hit must be relevant)`).toBe(1);
      expect(row.recall5, `${row.id} recall@5`).toBe(1);
      expect(row.ndcg5, `${row.id} nDCG@5`).toBeGreaterThanOrEqual(0.9);
    }
    expect(mean(improved.metrics.map((row) => row.mrr))).toBe(1);
    expect(mean(improved.metrics.map((row) => row.recall5))).toBe(1);
  });

  it("beats substring-only recall@1 and MRR", () => {
    const improvedR1 = mean(improved.metrics.map((row) => row.recall1));
    const baselineR1 = mean(baseline.metrics.map((row) => row.recall1));
    const improvedMrr = mean(improved.metrics.map((row) => row.mrr));
    const baselineMrr = mean(baseline.metrics.map((row) => row.mrr));
    expect(improvedR1).toBeGreaterThan(baselineR1);
    expect(improvedMrr).toBeGreaterThan(baselineMrr);
  });

  it("fails substring on synonym and paraphrase queries that hybrid ranks", () => {
    const hardIds = new Set(
      SYNTHETIC_QUERIES.filter(
        (entry) => entry.kind === "synonym" || entry.kind === "paraphrase",
      ).map((entry) => entry.id),
    );
    const baselineHard = baseline.metrics.filter((row) => hardIds.has(row.id));
    const improvedHard = improved.metrics.filter((row) => hardIds.has(row.id));
    expect(mean(baselineHard.map((row) => row.mrr))).toBeLessThan(0.5);
    expect(mean(baselineHard.map((row) => row.recall1))).toBeLessThan(0.5);
    expect(mean(improvedHard.map((row) => row.mrr))).toBe(1);
    expect(mean(improvedHard.map((row) => row.recall5))).toBe(1);
  });
});
