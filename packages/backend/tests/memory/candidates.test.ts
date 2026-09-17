import { describe, expect, it } from "vitest";
import {
  ftsQueryTexts,
  selectRetrieveCandidates,
} from "../../engine/memory/candidates";
import { retrieveMemoriesFromPool } from "../../engine/memory/retrieve";
import {
  CONVEX_FTS_TERM_LIMIT,
  FTS_MAX_QUERIES,
  INDEX_RETRIEVE_CAPS,
  LEGACY_RETRIEVE_CAPS,
} from "../../engine/memory/retrieveCaps";
import { generateEvalEmbeddings } from "../../eval/embeddings";
import { recallAtK } from "../../eval/metrics";
import { toEvalMemory, vectorScoresForQuery } from "../../eval/retrieve";
import { generateTailCorpus, TAIL_QUERY } from "../../eval/tail-corpus";
import { buildSearchableText } from "../../engine/memory/searchableText";
import { queryEmbeddingText } from "../../engine/memory/synonyms";

describe("ftsQueryTexts", () => {
  it("keeps the original terms in the first Convex search", () => {
    expect(ftsQueryTexts("amberhelix passphrase")).toEqual([
      "amberhelix passphrase",
    ]);
  });

  it("splits at the Convex 16-term limit and caps extra synonym searches", () => {
    const terms = Array.from({ length: 40 }, (_, i) => `term${String(i)}`);
    const batches = ftsQueryTexts(terms.join(" "));
    expect(batches.length).toBe(FTS_MAX_QUERIES);
    expect(batches[0]?.split(" ")).toHaveLength(CONVEX_FTS_TERM_LIMIT);
    expect(batches[1]?.split(" ").length).toBeLessThanOrEqual(
      CONVEX_FTS_TERM_LIMIT,
    );
  });

  it("puts synonym extras in a second search so they are not dropped", () => {
    const batches = ftsQueryTexts("node package manager");
    expect(batches.length).toBeGreaterThan(1);
    const joined = batches.join(" ");
    expect(joined).toContain("pnpm");
    expect(batches[0]?.split(" ").length).toBeLessThanOrEqual(
      CONVEX_FTS_TERM_LIMIT,
    );
  });
});

describe("production candidate pool vs legacy 200∪32∪32", () => {
  it("misses tail gold on the old caps and finds it after widening", async () => {
    const corpus = generateTailCorpus();
    const memories = corpus.memories.map(toEvalMemory);
    const gold = memories.find((memory) => memory.id === corpus.goldId);
    expect(gold).toBeDefined();
    if (gold === undefined) return;

    const embedTargets = [
      gold,
      ...memories.filter((memory) => corpus.occupierIds.includes(memory.id)),
    ];
    const memoryVectors = await generateEvalEmbeddings(
      embedTargets.map((memory) =>
        buildSearchableText(memory.title, memory.content, memory.tags),
      ),
    );
    const [queryEmbedding] = await generateEvalEmbeddings([
      queryEmbeddingText(TAIL_QUERY),
    ]);
    expect(queryEmbedding).toBeDefined();
    if (queryEmbedding === undefined) return;

    const memoryEmbeddings = new Map<string, number[]>();
    for (let i = 0; i < embedTargets.length; i += 1) {
      const memory = embedTargets[i];
      const vector = memoryVectors[i];
      if (memory === undefined || vector === undefined) continue;
      memoryEmbeddings.set(memory.id, vector);
    }
    const vectorScores = vectorScoresForQuery(
      memories,
      queryEmbedding,
      memoryEmbeddings,
    );

    const legacy = selectRetrieveCandidates(memories, TAIL_QUERY, {
      caps: LEGACY_RETRIEVE_CAPS,
      vectorScores,
    });
    const widened = selectRetrieveCandidates(memories, TAIL_QUERY, {
      caps: INDEX_RETRIEVE_CAPS,
      vectorScores,
    });

    expect(legacy.recencyRankOf.get(corpus.goldId)).toBeGreaterThan(200);
    expect(legacy.ftsRankOf.get(corpus.goldId)).toBeGreaterThan(32);
    expect(legacy.ftsRankOf.get(corpus.goldId)).toBeLessThanOrEqual(256);
    expect(legacy.vectorRankOf.get(corpus.goldId)).toBeGreaterThan(32);

    expect(legacy.pool.some((memory) => memory.id === corpus.goldId)).toBe(
      false,
    );
    expect(widened.pool.some((memory) => memory.id === corpus.goldId)).toBe(
      true,
    );
    expect(widened.pool.length).toBeLessThanOrEqual(
      INDEX_RETRIEVE_CAPS.rankPool,
    );

    const legacyRanked = retrieveMemoriesFromPool(legacy.pool, TAIL_QUERY, {
      limit: 5,
      vectorScores: legacy.vectorScores,
      ftsRanks: legacy.ftsRanks,
    });
    const widenedRanked = retrieveMemoriesFromPool(widened.pool, TAIL_QUERY, {
      limit: 5,
      vectorScores: widened.vectorScores,
      ftsRanks: widened.ftsRanks,
    });
    expect(
      recallAtK(
        legacyRanked.map((row) => row.title),
        [gold.title],
        5,
      ),
    ).toBe(0);
    expect(
      widenedRanked.map((row) => row.title),
      `fts=${String(widened.ftsRankOf.get(corpus.goldId))} vec=${String(widened.vectorRankOf.get(corpus.goldId))}`,
    ).toContain(gold.title);
    expect(widenedRanked[0]?.id).toBe(corpus.goldId);
  }, 30_000);
});
