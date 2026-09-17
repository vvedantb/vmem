import { describe, expect, it } from "vitest";
import { generateBenchmarkCorpus } from "../../eval/corpus";
import {
  aggregate,
  NEO4J_FULL_HYBRID,
  runAblation,
  runPooledComparison,
} from "../../eval/benchmark";
import { parseFactExtractionResponse } from "../../engine/memory/extractFacts";
import { recallAtK, reciprocalRank } from "../../eval/metrics";

describe("retrieval metrics", () => {
  it("scores full recall when every expected title is in the top five", () => {
    const titles = ["A", "B", "C", "D", "E", "F"];
    expect(recallAtK(titles, ["B", "E"], 5)).toBe(1);
  });

  it("scores partial recall when only some expected titles appear in the top five", () => {
    const titles = ["A", "B", "C", "D", "E", "F"];
    expect(recallAtK(titles, ["B", "Z"], 5)).toBe(0.5);
  });

  it("scores reciprocal rank from the first relevant hit", () => {
    expect(reciprocalRank(["noise", "target", "other"], ["target"])).toBe(0.5);
    expect(reciprocalRank(["noise", "other"], ["target"])).toBe(0);
    expect(reciprocalRank(["target"], ["target"])).toBe(1);
  });

  it("scores zero recall when no expected titles appear in the top five", () => {
    expect(recallAtK(["A", "B", "C", "D", "E"], ["Z"], 5)).toBe(0);
  });
});

describe("labelled benchmark corpus invariants", () => {
  const corpus = generateBenchmarkCorpus();
  const answerable = corpus.queries.filter((q) => q.expectedTitles.length > 0);
  const abstention = corpus.queries.filter(
    (q) => q.expectedTitles.length === 0,
  );

  it("has expected counts", () => {
    expect(corpus.memories).toHaveLength(488);
    expect(corpus.relationships).toHaveLength(36);
    expect(corpus.queries).toHaveLength(84);
    expect(answerable).toHaveLength(78);
    expect(abstention).toHaveLength(6);
  });

  it("has unique memory titles", () => {
    const titles = corpus.memories.map((memory) => memory.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("has relationship endpoints that exist in memories", () => {
    const memoryIds = new Set(corpus.memories.map((memory) => memory.id));
    for (const rel of corpus.relationships) {
      expect(memoryIds.has(rel.sourceId)).toBe(true);
      expect(memoryIds.has(rel.targetId)).toBe(true);
    }
  });
});

describe("Convex labelled ablation", () => {
  it("full hybrid beats single legs and hybrid-without-graph", async () => {
    const { runs, report } = await runAblation();
    console.log(`\n${report}\n`);

    const byName = Object.fromEntries(
      runs.map((run) => [run.name, aggregate(run.outcomes)]),
    );
    const full = byName["full hybrid"];
    const noGraph = byName["hybrid (no graph)"];
    const vector = byName["vector-only"];
    const bm25 = byName["bm25-only"];
    expect(full).toBeDefined();
    expect(noGraph).toBeDefined();
    expect(vector).toBeDefined();
    expect(bm25).toBeDefined();
    if (
      full === undefined ||
      noGraph === undefined ||
      vector === undefined ||
      bm25 === undefined
    ) {
      return;
    }

    expect(full.ndcg10).toBeGreaterThan(noGraph.ndcg10);
    expect(full.ndcg10).toBeGreaterThan(vector.ndcg10);
    expect(full.ndcg10).toBeGreaterThan(bm25.ndcg10);
    expect(full.recall5).toBeGreaterThanOrEqual(NEO4J_FULL_HYBRID.recall5);
    expect(full.mrr).toBeGreaterThanOrEqual(NEO4J_FULL_HYBRID.mrr);
    expect(full.ndcg10).toBeGreaterThanOrEqual(NEO4J_FULL_HYBRID.ndcg10);
    expect(full.recall10).toBeGreaterThanOrEqual(bm25.recall10);

    const byType = (name: string, type: string) =>
      aggregate(
        runs
          .find((run) => run.name === name)
          ?.outcomes.filter((row) => row.type === type) ?? [],
      );
    const fullMulti = byType("full hybrid", "multi-hop");
    const noGraphMulti = byType("hybrid (no graph)", "multi-hop");
    expect(fullMulti.ndcg10).toBeGreaterThan(noGraphMulti.ndcg10);
    expect(fullMulti.recall5).toBeGreaterThan(noGraphMulti.recall5);

    const fullProject = byType("full hybrid", "project");
    const noGraphProject = byType("hybrid (no graph)", "project");
    expect(fullProject.ndcg10).toBeGreaterThan(noGraphProject.ndcg10);

    expect(byType("full hybrid", "lexical-trap").ndcg10).toBeGreaterThan(0.7);
    expect(byType("full hybrid", "update").ndcg10).toBeGreaterThan(0.7);
  }, 60_000);

  it("index candidate pool beats legacy 200∪32∪32 on the labelled corpus", async () => {
    const { legacy, widened, report } = await runPooledComparison(
      generateBenchmarkCorpus(),
      "labelled",
    );
    console.log(`\n${report}\n`);
    expect(widened.recall5).toBeGreaterThanOrEqual(legacy.recall5);
    expect(widened.mrr).toBeGreaterThanOrEqual(legacy.mrr);
    expect(widened.ndcg10).toBeGreaterThanOrEqual(legacy.ndcg10);
    expect(widened.recall5).toBeGreaterThanOrEqual(NEO4J_FULL_HYBRID.recall5);
    expect(widened.latencyP95).toBeLessThan(100);
  }, 60_000);
});

describe("fact extraction parse", () => {
  it("reads atomic facts from LLM JSON", () => {
    const parsed = parseFactExtractionResponse(
      '{"facts":[{"id":0,"text":"I prefer pnpm"},{"id":1,"text":"I use Convex"}]}',
    );
    expect(parsed?.facts.map((fact) => fact.text)).toEqual([
      "I prefer pnpm",
      "I use Convex",
    ]);
  });
});
