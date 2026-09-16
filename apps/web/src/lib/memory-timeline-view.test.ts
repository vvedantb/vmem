import { describe, expect, it } from "vitest";
import {
  clampNumber,
  defaultPlayheadMs,
  densityBuckets,
  itemCreatedInWindow,
  latestCreatedAtMs,
  memoryTimelineRange,
  playheadFromProgress,
  progressFromPlayhead,
  resolvedPlayheadMs,
  spanDurationMs,
  windowCountLabel,
  windowForPlayhead,
} from "./memory-timeline-view";

describe("memoryTimelineRange", () => {
  it("returns null when there are no valid timestamps", () => {
    expect(memoryTimelineRange([], 1_000)).toBeNull();
    expect(memoryTimelineRange(["not-a-date"], 1_000)).toBeNull();
  });

  it("spans earliest memory through now", () => {
    expect(
      memoryTimelineRange(
        ["2026-01-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"],
        Date.parse("2026-04-01T00:00:00.000Z"),
      ),
    ).toEqual({
      startMs: Date.parse("2026-01-01T00:00:00.000Z"),
      endMs: Date.parse("2026-04-01T00:00:00.000Z"),
    });
  });

  it("does not end before the latest memory and pads short ranges", () => {
    const june = Date.parse("2026-06-01T00:00:00.000Z");
    expect(
      memoryTimelineRange(
        ["2026-06-01T00:00:00.000Z"],
        Date.parse("2026-01-01T00:00:00.000Z"),
      ),
    ).toEqual({
      startMs: june - 24 * 60 * 60 * 1000,
      endMs: june,
    });
  });

  it("pads a same-day cluster so the scrubber has width", () => {
    const now = Date.parse("2026-04-01T12:00:00.000Z");
    const created = Date.parse("2026-04-01T11:00:00.000Z");
    expect(memoryTimelineRange(["2026-04-01T11:00:00.000Z"], now)).toEqual({
      startMs: now - 24 * 60 * 60 * 1000,
      endMs: now,
    });
    expect(created).toBeGreaterThan(now - 24 * 60 * 60 * 1000);
  });
});

describe("windowForPlayhead", () => {
  const range = {
    startMs: 0,
    endMs: 100,
  };

  it("looks backward from the playhead and clamps to the range", () => {
    expect(windowForPlayhead(80, 30, range)).toEqual({
      startMs: 50,
      endMs: 80,
    });
    expect(windowForPlayhead(10, 30, range)).toEqual({
      startMs: 0,
      endMs: 10,
    });
    expect(windowForPlayhead(-20, 30, range)).toEqual({
      startMs: 0,
      endMs: 0,
    });
    expect(windowForPlayhead(200, 30, range)).toEqual({
      startMs: 70,
      endMs: 100,
    });
  });

  it("uses the full range when the span covers it", () => {
    expect(windowForPlayhead(40, 100, range)).toEqual({
      startMs: 0,
      endMs: 100,
    });
    expect(windowForPlayhead(40, 1000, range)).toEqual({
      startMs: 0,
      endMs: 100,
    });
  });
});

describe("progress mapping", () => {
  const range = { startMs: 100, endMs: 200 };

  it("maps playhead to 0–1 and back", () => {
    expect(progressFromPlayhead(100, range)).toBe(0);
    expect(progressFromPlayhead(150, range)).toBe(0.5);
    expect(progressFromPlayhead(200, range)).toBe(1);
    expect(playheadFromProgress(0, range)).toBe(100);
    expect(playheadFromProgress(0.5, range)).toBe(150);
    expect(playheadFromProgress(1, range)).toBe(200);
  });

  it("treats a zero-width range as the end", () => {
    const point = { startMs: 50, endMs: 50 };
    expect(progressFromPlayhead(50, point)).toBe(1);
    expect(playheadFromProgress(0.25, point)).toBe(50);
  });
});

describe("itemCreatedInWindow", () => {
  const window = {
    startMs: Date.parse("2026-02-01T00:00:00.000Z"),
    endMs: Date.parse("2026-02-08T00:00:00.000Z"),
  };

  it("includes the window edges and rejects invalid dates", () => {
    expect(itemCreatedInWindow("2026-02-01T00:00:00.000Z", window)).toBe(true);
    expect(itemCreatedInWindow("2026-02-08T00:00:00.000Z", window)).toBe(true);
    expect(itemCreatedInWindow("2026-01-31T23:59:59.000Z", window)).toBe(false);
    expect(itemCreatedInWindow("nope", window)).toBe(false);
  });
});

describe("densityBuckets", () => {
  it("counts timestamps into equal slices of the range", () => {
    const range = { startMs: 0, endMs: 4 };
    expect(
      densityBuckets(
        [
          new Date(0).toISOString(),
          new Date(1).toISOString(),
          new Date(1).toISOString(),
          new Date(3).toISOString(),
        ],
        range,
        4,
      ),
    ).toEqual([1, 2, 0, 1]);
  });

  it("returns empty buckets for a degenerate range", () => {
    expect(
      densityBuckets(["2026-01-01T00:00:00.000Z"], { startMs: 5, endMs: 5 }, 8),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("spanDurationMs", () => {
  it("uses the full range for All and fixed durations otherwise", () => {
    expect(spanDurationMs("all", 12_000)).toBe(12_000);
    expect(spanDurationMs("day", 12_000)).toBe(24 * 60 * 60 * 1000);
    expect(spanDurationMs("week", 1)).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("windowCountLabel", () => {
  it("names memories when the window is memory-only", () => {
    expect(windowCountLabel(0, 0)).toBe("No items in this window");
    expect(windowCountLabel(1, 1)).toBe("1 memory");
    expect(windowCountLabel(3, 3)).toBe("3 memories");
    expect(windowCountLabel(2, 1)).toBe("2 items");
  });
});

describe("clampNumber", () => {
  it("clamps to the inclusive bounds", () => {
    expect(clampNumber(5, 0, 10)).toBe(5);
    expect(clampNumber(-1, 0, 10)).toBe(0);
    expect(clampNumber(11, 0, 10)).toBe(10);
  });
});

describe("default playhead", () => {
  it("snaps to the latest memory instead of now", () => {
    const created = ["2026-01-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"];
    const latest = Date.parse("2026-03-01T00:00:00.000Z");
    const range = memoryTimelineRange(
      created,
      Date.parse("2026-04-01T00:00:00.000Z"),
    );
    expect(range).not.toBeNull();
    if (range === null) return;
    expect(latestCreatedAtMs(created)).toBe(latest);
    expect(defaultPlayheadMs(created, range)).toBe(latest);
    expect(resolvedPlayheadMs(null, created, range)).toBe(latest);
    expect(resolvedPlayheadMs(range.endMs, created, range)).toBe(range.endMs);
  });
});
