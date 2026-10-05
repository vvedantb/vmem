export type MemoryStatRow = {
  createdAt: number;
  tags: readonly string[];
};

export type DashboardStatsResult = {
  totalMemories: number;
  memoriesThisWeek: number;
  memoriesThisMonth: number;
  memoriesAddedToday: number;
  totalTags: number;
  growthData: { isoDate: string; total: number; new: number }[];
};

export type DashboardStatsAcc = {
  now: number;
  todayStart: number;
  weekAgo: number;
  monthAgo: number;
  dayStart: number;
  tags: Set<string>;
  totalMemories: number;
  memoriesThisWeek: number;
  memoriesThisMonth: number;
  memoriesAddedToday: number;
  baseline: number;
  dailyNew: Map<string, number>;
};

function startOfUtcDay(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isoDateUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function createDashboardStatsAcc(
  now: number = Date.now(),
): DashboardStatsAcc {
  const todayStart = startOfUtcDay(now);
  const dayStart = todayStart - 6 * 24 * 60 * 60 * 1000;
  const dailyNew = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    dailyNew.set(isoDateUtc(dayStart + i * 24 * 60 * 60 * 1000), 0);
  }
  return {
    now,
    todayStart,
    weekAgo: now - 7 * 24 * 60 * 60 * 1000,
    monthAgo: now - 30 * 24 * 60 * 60 * 1000,
    dayStart,
    tags: new Set<string>(),
    totalMemories: 0,
    memoriesThisWeek: 0,
    memoriesThisMonth: 0,
    memoriesAddedToday: 0,
    baseline: 0,
    dailyNew,
  };
}

export function addDashboardStatRow(
  acc: DashboardStatsAcc,
  row: MemoryStatRow,
): void {
  acc.totalMemories += 1;
  for (const tag of row.tags) acc.tags.add(tag);
  if (row.createdAt >= acc.weekAgo) acc.memoriesThisWeek += 1;
  if (row.createdAt >= acc.monthAgo) acc.memoriesThisMonth += 1;
  if (row.createdAt >= acc.todayStart) acc.memoriesAddedToday += 1;
  if (row.createdAt < acc.dayStart) {
    acc.baseline += 1;
    return;
  }
  const key = isoDateUtc(row.createdAt);
  const current = acc.dailyNew.get(key);
  if (current !== undefined) acc.dailyNew.set(key, current + 1);
}

export function finishDashboardStats(
  acc: DashboardStatsAcc,
): DashboardStatsResult {
  const growthData: DashboardStatsResult["growthData"] = [];
  let running = acc.baseline;
  for (let i = 0; i < 7; i++) {
    const isoDate = isoDateUtc(acc.dayStart + i * 24 * 60 * 60 * 1000);
    const added = acc.dailyNew.get(isoDate) ?? 0;
    running += added;
    growthData.push({ isoDate, total: running, new: added });
  }
  return {
    totalMemories: acc.totalMemories,
    memoriesThisWeek: acc.memoriesThisWeek,
    memoriesThisMonth: acc.memoriesThisMonth,
    memoriesAddedToday: acc.memoriesAddedToday,
    totalTags: acc.tags.size,
    growthData,
  };
}

export function computeDashboardStats(
  rows: readonly MemoryStatRow[],
  now: number = Date.now(),
): DashboardStatsResult {
  const acc = createDashboardStatsAcc(now);
  for (const row of rows) addDashboardStatRow(acc, row);
  return finishDashboardStats(acc);
}
