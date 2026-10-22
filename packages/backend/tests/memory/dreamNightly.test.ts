import { describe, expect, it } from "vitest";
import {
  addDreamCounts,
  changedRows,
  DECAY_IDLE_MS,
  emptyDreamCounts,
  isDecayCandidate,
  type DecayRow,
} from "../../engine/memory/dream/nightly";

const NOW = Date.parse("2026-10-22T02:30:00Z");

function stale(overrides: Partial<DecayRow> = {}): DecayRow {
  return {
    source: "browsing-history",
    status: "active",
    lastVisitAt: NOW - DECAY_IDLE_MS - 1,
    visitCount: 1,
    usefulnessScore: 0.19,
    ...overrides,
  };
}

describe("isDecayCandidate", () => {
  it("archives a stale, rarely visited, unused low-prior row", () => {
    expect(isDecayCandidate(stale(), 0, NOW)).toBe(true);
    expect(isDecayCandidate(stale({ source: "bookmarks" }), 0, NOW)).toBe(true);
    expect(isDecayCandidate(stale({ visitCount: 2 }), 0, NOW)).toBe(true);
  });

  it("never decays agent, manual or claude facts", () => {
    for (const source of ["mcp", "manual", "claude", "api"]) {
      expect(isDecayCandidate(stale({ source }), 0, NOW)).toBe(false);
    }
  });

  it("keeps rows that fail any one rule", () => {
    expect(
      isDecayCandidate(stale({ lastVisitAt: NOW - DECAY_IDLE_MS }), 0, NOW),
    ).toBe(false);
    expect(isDecayCandidate(stale({ visitCount: 3 }), 0, NOW)).toBe(false);
    expect(isDecayCandidate(stale({ usefulnessScore: 0.2 }), 0, NOW)).toBe(
      false,
    );
    expect(
      isDecayCandidate(stale({ usefulnessScore: undefined }), 0, NOW),
    ).toBe(false);
    expect(isDecayCandidate(stale(), 1, NOW)).toBe(false);
    expect(isDecayCandidate(stale({ status: "pinned" }), 0, NOW)).toBe(false);
    expect(isDecayCandidate(stale({ status: "suppressed" }), 0, NOW)).toBe(
      false,
    );
  });
});

describe("dream counts", () => {
  it("adds partial counts and counts changed rows", () => {
    const counts = addDreamCounts(emptyDreamCounts(), {
      exactMerged: 2,
      expired: 1,
    });
    expect(counts).toMatchObject({ exactMerged: 2, expired: 1, archived: 0 });
    expect(changedRows(counts)).toBe(3);
    expect(changedRows(emptyDreamCounts())).toBe(0);
  });
});
