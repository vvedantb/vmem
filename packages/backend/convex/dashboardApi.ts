import { v } from "convex/values";
import { authAction, requireClerkId, type AuthActionCtx } from "./auth";
import { internal } from "./_generated/api";
import type { MemoryWithTags } from "./memoryApi/types";
import { resolveAccessibleTeamScope } from "./profiles/accessibleProfile";

type StatsResult = {
  totalMemories: number;
  memoriesThisWeek: number;
  memoriesThisMonth: number;
  memoriesAddedToday: number;
  totalTags: number;
  growthData: { isoDate: string; total: number; new: number }[];
};

function startOfUtcDay(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isoDateUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function computeStats(memories: MemoryWithTags[]): StatsResult {
  const now = Date.now();
  const todayStart = startOfUtcDay(now);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const createdTimes = memories.map((memory) => Date.parse(memory.createdAt));

  const tags = new Set<string>();
  for (const memory of memories) {
    for (const tag of memory.tags) tags.add(tag);
  }

  const dayStart = todayStart - 6 * 24 * 60 * 60 * 1000;
  const dailyNew = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    dailyNew.set(isoDateUtc(dayStart + i * 24 * 60 * 60 * 1000), 0);
  }
  let baseline = 0;
  for (const createdAt of createdTimes) {
    if (createdAt < dayStart) {
      baseline += 1;
      continue;
    }
    const key = isoDateUtc(createdAt);
    const current = dailyNew.get(key);
    if (current !== undefined) dailyNew.set(key, current + 1);
  }

  const growthData: StatsResult["growthData"] = [];
  let running = baseline;
  for (let i = 0; i < 7; i++) {
    const isoDate = isoDateUtc(dayStart + i * 24 * 60 * 60 * 1000);
    const added = dailyNew.get(isoDate) ?? 0;
    running += added;
    growthData.push({ isoDate, total: running, new: added });
  }

  return {
    totalMemories: memories.length,
    memoriesThisWeek: createdTimes.filter((ms) => ms >= weekAgo).length,
    memoriesThisMonth: createdTimes.filter((ms) => ms >= monthAgo).length,
    memoriesAddedToday: createdTimes.filter((ms) => ms >= todayStart).length,
    totalTags: tags.size,
    growthData,
  };
}

async function loadScopedMemories(
  ctx: AuthActionCtx,
  clerkId: string,
  profileId: string | undefined,
  teamId: string | undefined,
): Promise<MemoryWithTags[]> {
  if (teamId !== undefined && profileId !== undefined) {
    return await ctx.runQuery(
      internal.memoryStore.functions.collectScopedMemoriesInternal,
      { kind: "team", profileId },
    );
  }
  return await ctx.runQuery(
    internal.memoryStore.functions.collectScopedMemoriesInternal,
    { kind: "personal", userId: clerkId, profileId },
  );
}

export const getStats = authAction({
  args: {
    profileId: v.optional(v.string()),
    fresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<StatsResult> => {
    const clerkId = await requireClerkId(ctx);
    const { teamId } = await resolveAccessibleTeamScope(ctx, args.profileId);
    const memories = await loadScopedMemories(
      ctx,
      clerkId,
      args.profileId,
      teamId,
    );
    return computeStats(memories);
  },
});
