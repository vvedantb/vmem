import { describe, expect, it } from "vitest";
import { generateBenchmarkCorpus } from "../../eval/corpus";
import { generateHardCorpus } from "../../eval/hard-corpus";
import { rankMemories } from "../../engine/memory/rank";
import { cosineSimilarity, syntheticEmbed } from "../../eval/embeddings";
import { buildSearchableText } from "../../engine/memory/searchableText";
import { queryEmbeddingText } from "../../engine/memory/synonyms";
import { linksFromCorpus, toEvalMemory } from "../../eval/retrieve";

describe("labelled corpus graph retrieve", () => {
  it("ranks Polaris sibling facts in the top five via stored links", () => {
    const corpus = generateBenchmarkCorpus();
    const hits = rankMemories(
      corpus.memories.map(toEvalMemory),
      "what do we know about the Polaris project",
      { limit: 5, links: linksFromCorpus(corpus) },
    );
    const titles = hits.map((hit) => hit.title);
    expect(titles[0]).toContain("Polaris project overview");
    expect(
      titles.filter((title) => title.includes("mobile team")),
    ).toHaveLength(3);
  });

  it("ranks 2-hop people golds in the top five on the hard corpus", () => {
    const corpus = generateHardCorpus();
    const memories = corpus.memories.map(toEvalMemory);
    const links = linksFromCorpus(corpus);
    const queries = corpus.queries.filter(
      (query) => query.type === "multi-hop-2",
    );
    const missing: string[] = [];
    for (const query of queries) {
      const queryVec = syntheticEmbed(queryEmbeddingText(query.query));
      const vectorScores = new Map<string, number>();
      for (const memory of memories) {
        vectorScores.set(
          memory.id,
          cosineSimilarity(
            queryVec,
            syntheticEmbed(
              buildSearchableText(memory.title, memory.content, memory.tags),
            ),
          ),
        );
      }
      const hits = rankMemories(memories, query.query, {
        limit: 5,
        links,
        vectorScores,
      });
      const titles = hits.map((hit) => hit.title);
      const gold = query.expectedTitles.find((title) =>
        title.includes("first responder"),
      );
      if (gold === undefined || !titles.includes(gold)) {
        missing.push(
          `${query.query} -> ${titles.join(" | ")} (gold=${gold ?? "?"})`,
        );
      }
    }
    expect(missing).toEqual([]);
  });
});
