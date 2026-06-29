import { describe, expect, it } from "vitest";
import { computeProviderMetrics, percentile, providersIn } from "./metrics";
import type { QaResultRow } from "./results";

function row(overrides: Partial<QaResultRow>): QaResultRow {
  return {
    type: "qa",
    runId: "test",
    provider: "vmem",
    conversationId: "conv-0",
    qaIndex: 0,
    category: 1,
    categoryLabel: "multi-hop",
    question: "q",
    gold: "g",
    generated: "a",
    correct: true,
    judgeParsed: true,
    contextTokens: 100,
    searchLatencyMs: 10,
    isAbstention: false,
    skipped: false,
    ...overrides,
  };
}

describe("percentile", () => {
  it("returns 0 for empty input", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("computes nearest-rank percentiles", () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 50)).toBe(30);
    expect(percentile(values, 95)).toBe(50);
    expect(percentile(values, 100)).toBe(50);
  });

  it("is order-independent", () => {
    expect(percentile([50, 10, 30, 20, 40], 50)).toBe(30);
  });
});

describe("computeProviderMetrics", () => {
  it("computes overall and per-category accuracy", () => {
    const rows: QaResultRow[] = [
      row({ category: 1, correct: true }),
      row({ category: 1, qaIndex: 1, correct: false }),
      row({
        category: 2,
        categoryLabel: "temporal",
        qaIndex: 2,
        correct: true,
      }),
    ];
    const m = computeProviderMetrics("vmem", rows);

    expect(m.total).toBe(3);
    expect(m.correct).toBe(2);
    expect(m.accuracy).toBeCloseTo(2 / 3);

    const multiHop = m.perCategory.find((c) => c.category === 1);
    expect(multiHop?.total).toBe(2);
    expect(multiHop?.accuracy).toBe(0.5);

    const temporal = m.perCategory.find((c) => c.category === 2);
    expect(temporal?.accuracy).toBe(1);
  });

  it("ignores rows from other providers", () => {
    const rows: QaResultRow[] = [
      row({ provider: "vmem", correct: true }),
      row({ provider: "mem0", qaIndex: 1, correct: false }),
    ];
    expect(computeProviderMetrics("vmem", rows).total).toBe(1);
    expect(computeProviderMetrics("vmem", rows).accuracy).toBe(1);
  });

  it("counts judge parse failures and means context tokens", () => {
    const rows: QaResultRow[] = [
      row({ contextTokens: 100, judgeParsed: true }),
      row({
        qaIndex: 1,
        contextTokens: 300,
        judgeParsed: false,
        correct: false,
      }),
    ];
    const m = computeProviderMetrics("vmem", rows);
    expect(m.meanContextTokens).toBe(200);
    expect(m.judgeParseFailures).toBe(1);
  });

  it("reports zero accuracy with no rows", () => {
    expect(computeProviderMetrics("vmem", []).accuracy).toBe(0);
  });

  it("excludes abstention rows from headline J and rolls them up separately", () => {
    const rows: QaResultRow[] = [
      row({ correct: true }),
      row({ qaIndex: 1, correct: false }),
      row({ qaIndex: 2, correct: true, isAbstention: true }),
      row({ qaIndex: 3, correct: true, isAbstention: true }),
      row({ qaIndex: 4, correct: false, isAbstention: true }),
    ];
    const m = computeProviderMetrics("vmem", rows);
    // Headline = answerable only: 1/2.
    expect(m.total).toBe(2);
    expect(m.correct).toBe(1);
    expect(m.accuracy).toBe(0.5);
    // Abstention rolled up separately: 2/3.
    expect(m.abstention.total).toBe(3);
    expect(m.abstention.correct).toBe(2);
    expect(m.abstention.accuracy).toBeCloseTo(2 / 3);
  });

  it("excludes skipped arms from accuracy and counts them", () => {
    const rows: QaResultRow[] = [
      row({ correct: true }),
      row({ qaIndex: 1, correct: false, skipped: true }),
      row({ qaIndex: 2, correct: false, skipped: true }),
    ];
    const m = computeProviderMetrics("vmem", rows);
    // Only the non-skipped row counts toward J.
    expect(m.total).toBe(1);
    expect(m.correct).toBe(1);
    expect(m.accuracy).toBe(1);
    expect(m.skipped).toBe(2);
  });
});

describe("providersIn", () => {
  it("returns distinct providers in first-seen order", () => {
    const rows: QaResultRow[] = [
      row({ provider: "vmem" }),
      row({ provider: "mem0", qaIndex: 1 }),
      row({ provider: "vmem", qaIndex: 2 }),
    ];
    expect(providersIn(rows)).toEqual(["vmem", "mem0"]);
  });
});
