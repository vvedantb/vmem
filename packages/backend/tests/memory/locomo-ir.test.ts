import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recallAtK } from "../../eval/metrics";
import {
  convertLocomoSample,
  locomoQuestionType,
  normalizeEvidenceIds,
  parseLocomoDate,
  sampleToCorpus,
  sliceLocomoSamples,
} from "../../eval/locomo/convert";
import { locomoFixtureItem } from "../../eval/locomo/fixture";
import { loadLocomo10 } from "../../eval/locomo/load";
import {
  evalLocomoIrEnabled,
  locomoIrWantsAblation,
  parseLocomoIrLimit,
  runLocomoIr,
} from "../../eval/locomo/run";
import { aggregate, runCorpusAblation } from "../../eval/benchmark";

describe("LoCoMo-IR mapping", () => {
  const item = locomoFixtureItem();
  const sample = convertLocomoSample(item);

  it("maps evaluation.py category IDs, not MemoryBench's swapped table", () => {
    expect(locomoQuestionType(1)).toBe("multi-hop");
    expect(locomoQuestionType(2)).toBe("temporal");
    expect(locomoQuestionType(3)).toBe("world-knowledge");
    expect(locomoQuestionType(4)).toBe("single-hop");
    expect(locomoQuestionType(5)).toBe("adversarial");
  });

  it("parses LoCoMo session clocks into UTC instants", () => {
    const parsed = parseLocomoDate("1:56 pm on 8 May, 2023");
    expect(parsed?.toISOString()).toBe("2023-05-08T13:56:00.000Z");
  });

  it("splits packed evidence tokens without inventing ids", () => {
    expect(normalizeEvidenceIds(["D8:6; D9:17"]).ids).toEqual([
      "D8:6",
      "D9:17",
    ]);
    expect(normalizeEvidenceIds(["D9:1 D4:4 D4:6"]).ids).toEqual([
      "D9:1",
      "D4:4",
      "D4:6",
    ]);
    expect(normalizeEvidenceIds(["D1:18", "D", "D1:20"]).ids).toEqual([
      "D1:18",
      "D1:20",
    ]);
    expect(normalizeEvidenceIds(["D:11:26"]).ids).toEqual([]);
  });

  it("turns sessions into episodic memories and gold title hit sets", () => {
    expect(sample.memories).toHaveLength(3);
    expect(new Set(sample.memories.map((memory) => memory.title)).size).toBe(3);
    expect(sample.memories.every((memory) => memory.type === "episodic")).toBe(
      true,
    );
    const single = sample.queries.find((query) => query.type === "single-hop");
    expect(single?.expectedTitles).toEqual(["conv-fixture/D1:2"]);
    const multi = sample.queries.find(
      (query) => query.type === "multi-hop" && query.evidenceIds.length === 2,
    );
    expect(multi?.expectedTitles).toEqual([
      "conv-fixture/D1:1",
      "conv-fixture/D1:2",
    ]);
    expect(sample.queries.some((query) => query.adversarial)).toBe(true);
    expect(sample.queries.some((query) => query.needsWorldKnowledge)).toBe(
      true,
    );
  });

  it("skips questions whose evidence cannot be resolved", () => {
    const reasons = sample.skipped.map((row) => row.reason).sort();
    expect(reasons).toEqual(["empty-evidence", "unresolved-evidence"]);
    expect(
      sample.queries.every((query) => query.expectedTitles.length > 0),
    ).toBe(true);
  });

  it("keeps the full conversation haystack when slicing queries", () => {
    const sliced = sliceLocomoSamples([sample], 2);
    expect(sliced[0]?.queries).toHaveLength(2);
    expect(sliced[0]?.memories).toHaveLength(sample.memories.length);
  });
});

describe("LoCoMo-IR loader (no network)", () => {
  it("downloads once, caches, and does not require vendor keys", async () => {
    const dir = mkdtempSync(join(tmpdir(), "locomo-ir-"));
    const cachePath = join(dir, "locomo10.json");
    let fetches = 0;
    const body = JSON.stringify([locomoFixtureItem()]);
    const fetchImpl: typeof fetch = async () => {
      fetches += 1;
      return new Response(body, { status: 200 });
    };
    try {
      const first = await loadLocomo10({ cachePath, fetchImpl });
      const second = await loadLocomo10({
        cachePath,
        fetchImpl: async () => {
          throw new Error("cache should prevent a second fetch");
        },
      });
      expect(fetches).toBe(1);
      expect(first).toHaveLength(1);
      expect(second[0]?.sample_id).toBe("conv-fixture");
      expect(readFileSync(cachePath, "utf8")).toContain("conv-fixture");
      expect(process.env.OPENAI_API_KEY).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("LoCoMo-IR retrieve on fixture haystack", () => {
  it("scores recall@k / MRR / nDCG@10 with judge off and no LLM keys", async () => {
    const corpus = sampleToCorpus(convertLocomoSample(locomoFixtureItem()));
    const { runs } = await runCorpusAblation(corpus, {
      configs: [{ name: "full hybrid", legs: {}, judge: "off" }],
      judge: "off",
    });
    const full = runs[0];
    expect(full).toBeDefined();
    if (full === undefined) return;
    const metrics = aggregate(full.outcomes);
    expect(full.outcomes.length).toBe(corpus.queries.length);
    expect(corpus.memories.length).toBeLessThanOrEqual(10);
    expect(metrics.recall10).toBe(1);
    expect(metrics.mrr).toBeGreaterThanOrEqual(0);
    expect(metrics.ndcg10).toBeGreaterThanOrEqual(0);
    const mango = full.outcomes.find((row) =>
      row.query.includes("What fruit did Ada eat"),
    );
    expect(mango).toBeDefined();
    if (mango === undefined) return;
    expect(recallAtK(mango.titles, ["conv-fixture/D1:2"], 10)).toBeGreaterThan(
      0,
    );
  });
});

describe("LoCoMo-IR CLI limit parsing", () => {
  it("defaults to 8, honors -l / env, and treats all as unlimited", () => {
    expect(parseLocomoIrLimit(["node", "run.ts"], {})).toBe(8);
    expect(parseLocomoIrLimit(["node", "run.ts", "-l", "4"], {})).toBe(4);
    expect(
      parseLocomoIrLimit(["node", "run.ts"], { LOCOMO_IR_LIMIT: "all" }),
    ).toBeUndefined();
    expect(evalLocomoIrEnabled({})).toBe(false);
    expect(evalLocomoIrEnabled({ EVAL_LOCOMO_IR: "1" })).toBe(true);
    expect(locomoIrWantsAblation(["node"], {})).toBe(false);
    expect(locomoIrWantsAblation(["node", "--ablation"], {})).toBe(true);
  });
});

describe.skipIf(!evalLocomoIrEnabled())(
  "LoCoMo-IR live smoke (download locomo10, no LLM)",
  () => {
    it("runs a -l subset through the labelled retrieve path", async () => {
      const limit = parseLocomoIrLimit();
      const result = await runLocomoIr({
        limit: limit ?? 8,
        ablation: locomoIrWantsAblation(),
      });
      console.log(`\n${result.report}\n`);
      expect(result.memoryCount).toBeGreaterThan(0);
      expect(result.answerable).toBeGreaterThan(0);
      expect(result.answerable).toBeLessThanOrEqual(limit ?? 8);
      expect(result.metrics.recall5).toBeGreaterThanOrEqual(0);
      expect(result.metrics.recall5).toBeLessThanOrEqual(1);
      expect(result.metrics.mrr).toBeGreaterThanOrEqual(0);
      expect(result.metrics.ndcg10).toBeGreaterThanOrEqual(0);
      expect(result.metrics.ndcg10).toBeLessThanOrEqual(1);
    }, 180_000);
  },
);
