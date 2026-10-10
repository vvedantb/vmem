import { describe, expect, it } from "vitest";
import {
  computeDashboardStats,
  dashboardStatsFromCounts,
  isoDateUtc,
  type MemoryStatRow,
} from "../../engine/memory/dashboardStats";

function countsFromRows(rows: readonly MemoryStatRow[]) {
  const days = new Map<string, number>();
  const tags = new Set<string>();
  for (const row of rows) {
    const iso = isoDateUtc(row.createdAt);
    days.set(iso, (days.get(iso) ?? 0) + 1);
    for (const tag of row.tags) tags.add(tag);
  }
  return { total: rows.length, days, tags };
}

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

describe("dashboardStatsFromCounts", () => {
  const now = Date.parse("2026-10-05T12:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;
  const todayStart = Date.parse("2026-10-05T00:00:00.000Z");

  it("matches the row walk when memories sit on day boundaries", () => {
    const rows: MemoryStatRow[] = [
      { createdAt: todayStart - 40 * day, tags: ["old"] },
      { createdAt: todayStart - 29 * day + 1000, tags: ["a"] },
      { createdAt: todayStart - 10 * day, tags: ["a"] },
      { createdAt: todayStart - 6 * day + 5000, tags: ["b"] },
      { createdAt: todayStart - 2 * day, tags: ["a", "b"] },
      { createdAt: todayStart + 60 * 60 * 1000, tags: ["c"] },
      { createdAt: todayStart + 2 * 60 * 60 * 1000, tags: [] },
    ];
    const walked = computeDashboardStats(rows, now);
    const counted = dashboardStatsFromCounts(countsFromRows(rows), now);
    expect(counted).toEqual(walked);
  });

  it("counts future-dated memories in total/today but not in the growth totals", () => {
    const rows: MemoryStatRow[] = [
      { createdAt: todayStart - 3 * day, tags: [] },
      { createdAt: todayStart + 3 * day, tags: [] },
    ];
    const walked = computeDashboardStats(rows, now);
    const counted = dashboardStatsFromCounts(countsFromRows(rows), now);
    expect(counted).toEqual(walked);
  });

  it("uses whole UTC days for the week and month windows", () => {
    const rows: MemoryStatRow[] = [
      { createdAt: todayStart - 6 * day, tags: [] },
      { createdAt: todayStart - 7 * day + day - 1, tags: [] },
      { createdAt: todayStart - 7 * day, tags: [] },
    ];
    const counted = dashboardStatsFromCounts(countsFromRows(rows), now);
    expect(counted.memoriesThisWeek).toBe(1);
    expect(counted.memoriesThisMonth).toBe(3);
  });

  it("is empty for no counters", () => {
    const counted = dashboardStatsFromCounts(
      { total: 0, days: new Map(), tags: new Set() },
      now,
    );
    expect(counted.totalMemories).toBe(0);
    expect(counted.totalTags).toBe(0);
    expect(counted.growthData.every((d) => d.total === 0 && d.new === 0)).toBe(
      true,
    );
  });
});
