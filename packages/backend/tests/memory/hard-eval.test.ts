import { describe, expect, it } from "vitest";
import { generateHardCorpus } from "../../eval/hard-corpus";
import {
  aggregate,
  HARD_FULL_HYBRID_BEFORE,
  runHardAblation,
  runPooledComparison,
} from "../../eval/benchmark";

describe("hard labelled corpus invariants", () => {
  const corpus = generateHardCorpus();
  const answerable = corpus.queries.filter((q) => q.expectedTitles.length > 0);

  it("has unique titles, linked endpoints, and mixed hard query types", () => {
    const titles = corpus.memories.map((memory) => memory.title);
    expect(new Set(titles).size).toBe(titles.length);
    const memoryIds = new Set(corpus.memories.map((memory) => memory.id));
    for (const rel of corpus.relationships) {
      expect(memoryIds.has(rel.sourceId)).toBe(true);
      expect(memoryIds.has(rel.targetId)).toBe(true);
    }
    expect(answerable.length).toBeGreaterThanOrEqual(30);
    const types = new Set(answerable.map((q) => q.type));
    expect(types.has("paraphrase")).toBe(true);
    expect(types.has("long-tail")).toBe(true);
    expect(types.has("multi-hop-2")).toBe(true);
    expect(types.has("tag-conflict")).toBe(true);
    expect(types.has("type-filter")).toBe(true);
    expect(types.has("distractor")).toBe(true);
    expect(types.has("temporal")).toBe(true);
    expect(answerable.some((q) => q.filter !== undefined)).toBe(true);
  });
});

describe("Convex hard labelled ablation", () => {
  it("full hybrid beats the previous hard-suite bar", async () => {
    const { runs, report } = await runHardAblation(HARD_FULL_HYBRID_BEFORE);
    console.log(`\n${report}\n`);
    const full = aggregate(
      runs.find((run) => run.name === "full hybrid")?.outcomes ?? [],
    );
    expect(full.recall5).toBeGreaterThan(HARD_FULL_HYBRID_BEFORE.recall5);
    expect(full.mrr).toBeGreaterThan(HARD_FULL_HYBRID_BEFORE.mrr);
    expect(full.ndcg10).toBeGreaterThan(HARD_FULL_HYBRID_BEFORE.ndcg10);
    expect(full.recall5).toBeGreaterThanOrEqual(0.95);
    expect(full.mrr).toBeGreaterThanOrEqual(0.88);
    expect(full.ndcg10).toBeGreaterThanOrEqual(0.9);
    const byType = (name: string, type: string) =>
      aggregate(
        runs
          .find((run) => run.name === name)
          ?.outcomes.filter((row) => row.type === type) ?? [],
      );
    expect(byType("full hybrid", "type-intent").ndcg10).toBe(1);
    expect(byType("full hybrid", "multi-hop-2").ndcg10).toBeGreaterThan(
      byType("hybrid (no graph)", "multi-hop-2").ndcg10,
    );
    expect(byType("full hybrid", "temporal").ndcg10).toBeGreaterThan(0.7);
    expect(byType("full hybrid", "temporal").ndcg10).toBeGreaterThan(
      byType("hybrid (no temporal)", "temporal").ndcg10,
    );
  }, 60_000);

  it("index candidate pool beats legacy 200∪32∪32 on the hard suite", async () => {
    const { legacy, widened, report } = await runPooledComparison(
      generateHardCorpus(),
      "hard",
    );
    console.log(`\n${report}\n`);
    expect(widened.recall5).toBeGreaterThanOrEqual(legacy.recall5);
    expect(widened.recall10).toBeGreaterThanOrEqual(legacy.recall10);
    expect(widened.recall5).toBeGreaterThanOrEqual(0.9);
    expect(widened.ndcg10).toBeGreaterThanOrEqual(0.9);
    expect(widened.latencyP95).toBeLessThan(100);
  }, 60_000);
});
