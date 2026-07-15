// AI-generated (Claude), prompt: "unit tests for dream auto trigger quiet window and daily cap logic"
// Modified by me: fixed now snapshot helpers for quiet gap cases
import { describe, expect, it } from "vitest";
import {
  DAILY_CAP,
  dayKeyForUtc,
  decideDreamCheck,
  depthForCount,
  MIN_GAP_MS,
  MIN_NEW_MEMORIES,
  PILE_THRESHOLD,
  QUIET_MS,
  type DreamTriggerSnapshot,
} from "../convex/lib/dreamTriggerDecision";

const NOW = Date.parse("2026-06-11T12:00:00.000Z");

function snapshot(
  overrides: Partial<DreamTriggerSnapshot> = {},
): DreamTriggerSnapshot {
  return {
    newMemoryCount: MIN_NEW_MEMORIES,
    lastWriteAt: NOW - QUIET_MS - 1_000,
    lastAutoRunAt: null,
    runsToday: 0,
    dayKey: dayKeyForUtc(NOW),
    ...overrides,
  };
}

describe("decideDreamCheck", () => {
  it("stops when automatic mode is off", () => {
    expect(decideDreamCheck(snapshot(), false, NOW)).toEqual({
      action: "stop",
    });
  });

  it("runs after a quiet window with enough new memories", () => {
    expect(decideDreamCheck(snapshot(), true, NOW)).toEqual({
      action: "run",
      depth: "light",
    });
  });

  it("stops when quiet but below the minimum memory count", () => {
    const state = snapshot({ newMemoryCount: MIN_NEW_MEMORIES - 1 });
    expect(decideDreamCheck(state, true, NOW)).toEqual({ action: "stop" });
  });

  it("reschedules for the remaining quiet window while still writing", () => {
    const state = snapshot({ lastWriteAt: NOW - 10 * 60 * 1000 });
    expect(decideDreamCheck(state, true, NOW)).toEqual({
      action: "reschedule",
      delayMs: QUIET_MS - 10 * 60 * 1000,
    });
  });

  it("runs mid-activity once the pile-up threshold is reached", () => {
    const state = snapshot({
      newMemoryCount: PILE_THRESHOLD,
      lastWriteAt: NOW - 1_000,
    });
    expect(decideDreamCheck(state, true, NOW)).toEqual({
      action: "run",
      depth: "standard",
    });
  });

  it("stops inside the minimum gap after the last auto run", () => {
    const state = snapshot({ lastAutoRunAt: NOW - MIN_GAP_MS + 1_000 });
    expect(decideDreamCheck(state, true, NOW)).toEqual({ action: "stop" });
  });

  it("runs again once the minimum gap has elapsed", () => {
    const state = snapshot({ lastAutoRunAt: NOW - MIN_GAP_MS - 1_000 });
    expect(decideDreamCheck(state, true, NOW)).toEqual({
      action: "run",
      depth: "light",
    });
  });

  it("stops at the daily cap", () => {
    const state = snapshot({ runsToday: DAILY_CAP });
    expect(decideDreamCheck(state, true, NOW)).toEqual({ action: "stop" });
  });

  it("ignores a stale dayKey's run count after UTC day rollover", () => {
    const state = snapshot({ runsToday: DAILY_CAP, dayKey: "2026-06-10" });
    expect(decideDreamCheck(state, true, NOW)).toEqual({
      action: "run",
      depth: "light",
    });
  });
});

describe("depthForCount", () => {
  it("maps counts to depth tiers", () => {
    expect(depthForCount(5)).toBe("light");
    expect(depthForCount(9)).toBe("light");
    expect(depthForCount(10)).toBe("standard");
    expect(depthForCount(25)).toBe("standard");
    expect(depthForCount(26)).toBe("deep");
  });
});

describe("dayKeyForUtc", () => {
  it("formats as UTC YYYY-MM-DD", () => {
    expect(dayKeyForUtc(NOW)).toBe("2026-06-11");
    expect(dayKeyForUtc(Date.parse("2026-06-11T23:59:59.999Z"))).toBe(
      "2026-06-11",
    );
    expect(dayKeyForUtc(Date.parse("2026-06-12T00:00:00.001Z"))).toBe(
      "2026-06-12",
    );
  });
});
