import { describe, expect, it } from "vitest";
import { generateBenchmarkCorpus } from "./corpus";
import { recallAtK, reciprocalRank } from "./metrics";

describe("retrieval metrics", () => {
  it("scores full recall when every expected title is in the top five", () => {
    const titles = ["A", "B", "C", "D", "E", "F"];
    expect(recallAtK(titles, ["B", "E"], 5)).toBe(1);
  });

  it("scores partial recall when only some expected titles appear in the top five", () => {
    const titles = ["A", "B", "C", "D", "E", "F"];
    expect(recallAtK(titles, ["B", "Z"], 5)).toBe(0.5);
  });

  it("scores zero recall when no expected titles appear in the top five", () => {
    const titles = ["A", "B", "C", "D", "E"];
    expect(recallAtK(titles, ["Z"], 5)).toBe(0);
  });

  it("scores reciprocal rank from the first relevant hit", () => {
    expect(reciprocalRank(["noise", "target", "other"], ["target"])).toBe(0.5);
    expect(reciprocalRank(["noise", "other"], ["target"])).toBe(0);
    expect(reciprocalRank(["target"], ["target"])).toBe(1);
  });
});

describe("benchmark corpus invariants", () => {
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
