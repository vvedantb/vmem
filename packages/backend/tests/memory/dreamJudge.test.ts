import { describe, expect, it } from "vitest";
import {
  buildDreamJudgePrompt,
  parseDreamJudgeReply,
  type DreamJudgePair,
} from "../../engine/memory/dream/judge";
import {
  aiCallStop,
  DREAM_DAILY_BUDGET_USD,
  dreamPairAction,
  fullAiAllowance,
  sameSourceFamily,
  spendAiCall,
  type DreamAiAllowance,
} from "../../engine/memory/dream/nightly";

const CREATED = Date.parse("2026-10-01T09:00:00Z");

// near-identical text, different projects: never one fact
const EVA_VMEM: DreamJudgePair = [
  {
    id: "row_eva",
    title: "eva UI Eva alignment",
    content: "eva UI: align the settings page with the Eva design tokens.",
    source: "mcp",
    createdAt: CREATED,
  },
  {
    id: "row_vmem",
    title: "vmem UI Eva alignment",
    content: "vmem UI: align the settings page with the Eva design tokens.",
    source: "mcp",
    createdAt: CREATED + 1000,
  },
];

const UPDATE_PAIR: DreamJudgePair = [
  {
    id: "row_old",
    title: "vmem prod deployment",
    content: "vmem prod runs on Convex deployment outgoing-reindeer-268.",
    source: "mcp",
    createdAt: CREATED,
  },
  {
    id: "row_new",
    title: "vmem prod deployment",
    content: "vmem prod runs on Convex deployment clear-bear-690.",
    source: "mcp",
    createdAt: CREATED + 86_400_000,
  },
];

function reply(fields: Record<string, string | number | null>): string {
  return JSON.stringify(fields);
}

describe("buildDreamJudgePrompt", () => {
  it("names the memories m0 / m1, never by row id, and keeps projects apart", () => {
    const prompt = buildDreamJudgePrompt(EVA_VMEM);
    expect(prompt).toContain('"id": "m0"');
    expect(prompt).toContain('"id": "m1"');
    expect(prompt).not.toContain("row_eva");
    expect(prompt).toContain("eva UI Eva alignment");
    expect(prompt).toContain("vmem UI Eva alignment");
    expect(prompt).toContain("2026-10-01T09:00:00.000Z");
    expect(prompt).toContain(
      "Memories about different projects, products, repositories, people or time windows are unrelated",
    );
    for (const relation of [
      "duplicate",
      "update",
      "contradiction",
      "unrelated",
    ]) {
      expect(prompt).toContain(`"${relation}"`);
    }
  });

  it("truncates long content", () => {
    const [first, second] = EVA_VMEM;
    const prompt = buildDreamJudgePrompt([
      { ...first, content: "word ".repeat(400) },
      second,
    ]);
    expect(prompt.length).toBeLessThan(2_500);
  });
});

describe("parseDreamJudgeReply", () => {
  it("reads the eva vs vmem negative as unrelated", () => {
    expect(
      parseDreamJudgeReply(
        EVA_VMEM,
        reply({
          relation: "unrelated",
          keeperId: null,
          confidence: 0.93,
          reason: "Different projects (eva vs vmem).",
        }),
      ),
    ).toEqual({
      status: "unrelated",
      confidence: 0.93,
      reason: "Different projects (eva vs vmem).",
    });
  });

  it("maps the keeper key back to the row ids", () => {
    expect(
      parseDreamJudgeReply(
        UPDATE_PAIR,
        reply({
          relation: "update",
          keeperId: "m1",
          confidence: 0.95,
          reason: "The deployment changed.",
        }),
      ),
    ).toEqual({
      status: "related",
      relation: "update",
      keeperId: "row_new",
      otherId: "row_old",
      confidence: 0.95,
      reason: "The deployment changed.",
    });
  });

  it("accepts JSON inside a fence and fills a missing reason", () => {
    const verdict = parseDreamJudgeReply(
      UPDATE_PAIR,
      '```json\n{"relation": "contradiction", "keeperId": "m0", "confidence": 0.8}\n```',
    );
    expect(verdict).toMatchObject({
      status: "related",
      relation: "contradiction",
      keeperId: "row_old",
      reason: "contradiction",
    });
  });

  it("gives error for bad replies", () => {
    const bad = [
      null,
      "not json",
      reply({ relation: "same", keeperId: "m0", confidence: 0.9 }),
      reply({ relation: "duplicate", keeperId: "m0", confidence: 1.5 }),
      reply({ relation: "duplicate", keeperId: "m2", confidence: 0.9 }),
      reply({ relation: "update", keeperId: "row_new", confidence: 0.9 }),
      reply({ relation: "duplicate", keeperId: null, confidence: 0.9 }),
    ];
    for (const content of bad) {
      expect(parseDreamJudgeReply(UPDATE_PAIR, content).status).toBe("error");
    }
  });
});

describe("dreamPairAction", () => {
  const base = { confidence: 0.95, autoAccept: true, sameFamily: true };

  it("applies confident duplicates and updates only with auto-accept", () => {
    expect(dreamPairAction({ ...base, relation: "duplicate" })).toEqual({
      kind: "merge",
      apply: true,
    });
    expect(dreamPairAction({ ...base, relation: "update" })).toEqual({
      kind: "supersede",
      apply: true,
    });
    for (const relation of ["duplicate", "update"] as const) {
      expect(
        dreamPairAction({ ...base, relation, autoAccept: false }).kind,
      ).not.toBe("none");
      expect(dreamPairAction({ ...base, relation, autoAccept: false })).toEqual(
        expect.objectContaining({ apply: false }),
      );
      expect(dreamPairAction({ ...base, relation, confidence: 0.89 })).toEqual(
        expect.objectContaining({ apply: false }),
      );
    }
  });

  it("never supersedes across source families", () => {
    expect(
      dreamPairAction({ ...base, relation: "update", sameFamily: false }),
    ).toEqual({ kind: "supersede", apply: false });
  });

  it("queues contradictions, drops unrelated, ignores none", () => {
    expect(dreamPairAction({ ...base, relation: "contradiction" })).toEqual({
      kind: "contradiction",
    });
    expect(dreamPairAction({ ...base, relation: "unrelated" })).toEqual({
      kind: "drop",
    });
    expect(dreamPairAction({ ...base, relation: "none" })).toEqual({
      kind: "none",
    });
  });
});

describe("sameSourceFamily", () => {
  it("compares source prior classes", () => {
    expect(sameSourceFamily({ source: "mcp" }, { source: "manual" })).toBe(
      true,
    );
    expect(sameSourceFamily({ source: "notion" }, { source: "gmail" })).toBe(
      true,
    );
    expect(
      sameSourceFamily({ source: "mcp" }, { source: "browsing-history" }),
    ).toBe(false);
    expect(sameSourceFamily({ source: "mcp" }, { source: "notion" })).toBe(
      false,
    );
  });
});

describe("AI call caps and budget", () => {
  function spend(
    allowance: DreamAiAllowance,
    kind: "near_dup" | "maybe_conflict",
    count: number,
  ): DreamAiAllowance {
    let next = allowance;
    for (let i = 0; i < count; i += 1) next = spendAiCall(next, kind);
    return next;
  }

  it("allows 25 near-dup and 15 conflict calls, 40 in total", () => {
    const full = fullAiAllowance();
    expect(full).toEqual({
      byKind: { near_dup: 25, maybe_conflict: 15 },
      total: 40,
    });
    const afterNearDup = spend(full, "near_dup", 25);
    expect(aiCallStop(afterNearDup, "near_dup", 0)).toBe("cap");
    expect(aiCallStop(afterNearDup, "maybe_conflict", 0)).toBeNull();
    const afterAll = spend(afterNearDup, "maybe_conflict", 15);
    expect(afterAll.total).toBe(0);
    expect(aiCallStop(afterAll, "maybe_conflict", 0)).toBe("cap");
  });

  it("stops at the per-user total even with kind calls left", () => {
    const allowance: DreamAiAllowance = {
      byKind: { near_dup: 5, maybe_conflict: 5 },
      total: 0,
    };
    expect(aiCallStop(allowance, "near_dup", 0)).toBe("cap");
  });

  it("stops once today's dream spend reaches $0.50", () => {
    const full = fullAiAllowance();
    expect(
      aiCallStop(full, "near_dup", DREAM_DAILY_BUDGET_USD - 0.01),
    ).toBeNull();
    expect(aiCallStop(full, "near_dup", DREAM_DAILY_BUDGET_USD)).toBe("budget");
    expect(DREAM_DAILY_BUDGET_USD).toBe(0.5);
  });
});
