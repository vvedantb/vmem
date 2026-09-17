import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateBenchmarkCorpus } from "../../../eval/corpus";
import { recallAtK, reciprocalRank } from "../../../eval/metrics";
import { loadCompetitiveCorpus, subsetLabelledCorpus } from "./corpus";
import {
  EVAL_COMPETITIVE_KEYS_REQUIRED,
  MEM0_API_KEY_ENV,
  MEM0_SIGNUP_URL,
  SUPERMEMORY_API_KEY_ENV,
  SUPERMEMORY_SIGNUP_URL,
  evalCompetitiveEnabled,
  missingVendorKeyNames,
  requireVendorKeys,
} from "./keys";
import { matchVendorHits } from "./match";
import { mem0AddBody } from "./mem0";
import { MISSING_CELL, competitiveTable, type SystemRow } from "./report";
import { assertCompetitiveReady, runCompetitive } from "./run";
import { outcomeFromTitles } from "./score";
import { supermemoryDocumentBody } from "./supermemory";

const mem0AddBodySchema = z.object({
  infer: z.boolean(),
  messages: z.array(z.object({ content: z.string() })),
  metadata: z.object({ vmem_title: z.string() }),
});

describe("competitive labelled IR harness", () => {
  it("fails closed when vendor keys are missing and does not invent numbers", () => {
    const env = { MEM0_API_KEY: " ", SUPERMEMORY_API_KEY: "" };
    expect(missingVendorKeyNames(env)).toEqual([
      MEM0_API_KEY_ENV,
      SUPERMEMORY_API_KEY_ENV,
    ]);
    expect(() => {
      requireVendorKeys(env);
    }).toThrow(EVAL_COMPETITIVE_KEYS_REQUIRED);
    expect(() => {
      assertCompetitiveReady(env);
    }).toThrow(/Do not invent/);
    expect(EVAL_COMPETITIVE_KEYS_REQUIRED).toContain(MEM0_SIGNUP_URL);
    expect(EVAL_COMPETITIVE_KEYS_REQUIRED).toContain(SUPERMEMORY_SIGNUP_URL);
    expect(evalCompetitiveEnabled({ EVAL_COMPETITIVE: "1" })).toBe(true);
    expect(evalCompetitiveEnabled({})).toBe(false);
  });

  it("maps vendor hits to labelled titles via metadata, id, then longest substring", () => {
    const memories = generateBenchmarkCorpus().memories.slice(0, 4);
    const first = memories[0];
    const second = memories[1];
    if (first === undefined || second === undefined) {
      throw new Error("expected labelled memories");
    }
    expect(
      matchVendorHits(
        [{ text: "rewritten", metadata: { vmem_title: first.title } }],
        memories,
      ),
    ).toEqual([first.title]);
    expect(
      matchVendorHits(
        [{ text: "rewritten", metadata: { vmem_id: second.id } }],
        memories,
      ),
    ).toEqual([second.title]);
    expect(
      matchVendorHits(
        [{ text: `prefix ${first.title} suffix`, customId: "unknown" }],
        memories,
      ),
    ).toEqual([first.title]);
  });

  it("keeps the same query list when subsetting memories", () => {
    const full = generateBenchmarkCorpus();
    const subset = subsetLabelledCorpus(full, {
      queryLimit: 12,
      memoryLimit: 40,
    });
    expect(subset.queries).toHaveLength(12);
    expect(subset.queries.map((query) => query.query)).toEqual(
      full.queries.slice(0, 12).map((query) => query.query),
    );
    expect(subset.memories.length).toBeLessThanOrEqual(40);
    const gold = new Set(
      subset.queries.flatMap((query) => Object.keys(query.relevance)),
    );
    for (const title of gold) {
      expect(subset.memories.some((memory) => memory.title === title)).toBe(
        true,
      );
    }
  });

  it("loads the labelled 493 / 81 / 6 set by default", () => {
    const corpus = loadCompetitiveCorpus();
    expect(corpus.memories).toHaveLength(493);
    expect(
      corpus.queries.filter((query) => query.expectedTitles.length > 0),
    ).toHaveLength(81);
    expect(
      corpus.queries.filter((query) => query.expectedTitles.length === 0),
    ).toHaveLength(6);
  });

  it("scores IR metrics with the same helpers as eval:bench", () => {
    const query = generateBenchmarkCorpus().queries.find(
      (row) => row.expectedTitles.length === 1,
    );
    if (query === undefined) {
      throw new Error("expected an answerable query");
    }
    const gold = query.expectedTitles[0];
    if (gold === undefined) {
      throw new Error("expected a gold title");
    }
    const outcome = outcomeFromTitles({
      query,
      titles: ["noise", gold],
      latencyMs: 12,
    });
    expect(outcome.recall1).toBe(recallAtK(["noise", gold], [gold], 1));
    expect(outcome.rr).toBe(reciprocalRank(["noise", gold], [gold]));
    expect(outcome.recall5).toBe(1);
  });

  it("renders empty cells instead of fabricated vendor scores", () => {
    const rows: SystemRow[] = [
      {
        status: "missing",
        name: "Mem0 Platform",
        reason: "TODO: MEM0_API_KEY",
      },
      {
        status: "missing",
        name: "SuperMemory",
        reason: "TODO: SUPERMEMORY_API_KEY",
      },
    ];
    const table = competitiveTable(rows);
    expect(table).toContain(MISSING_CELL);
    expect(table).not.toMatch(/0\.000%|0\.0%/);
    expect(table).toContain("TODO: MEM0_API_KEY");
    expect(table).toContain("TODO: SUPERMEMORY_API_KEY");
  });

  it("stores labelled title+content verbatim for both vendors", () => {
    const memory = generateBenchmarkCorpus().memories[0];
    if (memory === undefined) {
      throw new Error("expected a memory");
    }
    const mem0Body = mem0AddBodySchema.parse(
      mem0AddBody(memory, "vmem_labelled_ir"),
    );
    expect(mem0Body.infer).toBe(false);
    expect(mem0Body.messages[0]?.content).toContain(memory.title);
    expect(mem0Body.metadata.vmem_title).toBe(memory.title);
    const sm = supermemoryDocumentBody(memory, "vmem_labelled_ir");
    expect(sm.customId).toBe(memory.id);
    expect(sm.content).toContain(memory.title);
    expect(sm.dreaming).toBe("instant");
  });
});

describe.skipIf(!evalCompetitiveEnabled())(
  "live labelled IR: vmem vs Mem0 vs SuperMemory",
  () => {
    it("ingests the shared corpus and reports IR metrics or fails closed", async () => {
      assertCompetitiveReady();
      const { report, rows } = await runCompetitive({ requireVendors: true });
      console.log(`\n${report}\n`);
      expect(rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          "vmem hybrid-only",
          "Mem0 Platform",
          "SuperMemory",
        ]),
      );
      const measured = rows.filter((row) => row.status === "ok");
      expect(measured.length).toBeGreaterThanOrEqual(3);
      expect(
        measured.every(
          (row) => row.metrics.recall5 >= 0 && row.metrics.recall5 <= 1,
        ),
      ).toBe(true);
    }, 1_800_000);
  },
);
