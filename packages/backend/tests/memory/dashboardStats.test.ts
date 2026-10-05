import { describe, expect, it } from "vitest";
import {
  computeDashboardStats,
  isoDateUtc,
} from "../../engine/memory/dashboardStats";

describe("computeDashboardStats", () => {
  it("counts totals, windows, unique tags, and 7-day growth", () => {
    const now = Date.parse("2026-10-05T12:00:00.000Z");
    const todayStart = Date.parse("2026-10-05T00:00:00.000Z");
    const stats = computeDashboardStats(
      [
        { createdAt: todayStart - 10 * 24 * 60 * 60 * 1000, tags: ["a"] },
        { createdAt: todayStart - 2 * 24 * 60 * 60 * 1000, tags: ["a", "b"] },
        { createdAt: todayStart + 60 * 60 * 1000, tags: ["b"] },
      ],
      now,
    );

    expect(stats.totalMemories).toBe(3);
    expect(stats.memoriesAddedToday).toBe(1);
    expect(stats.memoriesThisWeek).toBe(2);
    expect(stats.memoriesThisMonth).toBe(3);
    expect(stats.totalTags).toBe(2);
    expect(stats.growthData).toHaveLength(7);
    expect(stats.growthData[0]?.isoDate).toBe(
      isoDateUtc(todayStart - 6 * 24 * 60 * 60 * 1000),
    );
    expect(stats.growthData[6]?.isoDate).toBe("2026-10-05");
    expect(stats.growthData[6]?.total).toBe(3);
    expect(stats.growthData[6]?.new).toBe(1);
  });
});
