/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  computeDashboardStats,
  type MemoryStatRow,
} from "../engine/memory/dashboardStats";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_user_a";
const OTHER = "clerk_user_b";
const P1 = "profile_one";
const P2 = "profile_two";
const TEAM = "profile_team";
const DAY = 24 * 60 * 60 * 1000;

type Harness = ReturnType<typeof convexTest>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-05T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function tick(ms = 5) {
  vi.setSystemTime(Date.now() + ms);
}

async function create(
  t: Harness,
  memoryId: string,
  overrides: {
    userId?: string;
    profileId?: string | null;
    tags?: string[];
    createdAt?: number;
    sourceType?: string;
  } = {},
) {
  tick();
  const profileId =
    overrides.profileId === null ? undefined : (overrides.profileId ?? P1);
  await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
    memoryId,
    userId: overrides.userId ?? USER,
    ...(profileId === undefined ? {} : { profileId }),
    title: `Title ${memoryId}`,
    content: `Content ${memoryId}`,
    type: "knowledge",
    source: "api",
    tags: overrides.tags ?? [],
    confidence: 0.9,
    createdAt: overrides.createdAt,
    sourceType: overrides.sourceType,
  });
}

async function backfill(t: Harness) {
  tick();
  await t.mutation(internal.memoryStats.startMemoryStatsBackfillInternal, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function verify(t: Harness) {
  return await t.action(internal.memoryStats.verifyMemoryStatsInternal, {});
}

async function personalStats(
  t: Harness,
  profileId: string | undefined,
  userId = USER,
) {
  return await t.query(internal.memoryStats.getMemoryStatsInternal, {
    kind: "personal",
    userId,
    profileId,
    now: Date.now(),
  });
}

async function teamStats(t: Harness, profileId: string) {
  return await t.query(internal.memoryStats.getMemoryStatsInternal, {
    kind: "team",
    profileId,
    now: Date.now(),
  });
}

async function walkRows(
  t: Harness,
  match: (doc: { userId: string; profileId?: string }) => boolean,
): Promise<MemoryStatRow[]> {
  return await t.run(async (ctx) =>
    (await ctx.db.query("memories").collect())
      .filter(match)
      .map((doc) => ({ createdAt: doc.createdAt, tags: doc.tags })),
  );
}

describe("memory stat counters", () => {
  it("stays dormant (no counters, null reads) until the backfill starts", async () => {
    const t = convexTest(schema, modules);
    await create(t, "m1", { tags: ["a"] });
    expect(await personalStats(t, P1)).toBeNull();
    const rows = await t.run(async (ctx) =>
      ctx.db.query("memoryStatCounters").collect(),
    );
    expect(rows).toHaveLength(0);
    expect(
      await t.query(internal.memoryStats.memoryStatsStatusInternal, {}),
    ).toBeNull();
  });

  it("backfills existing memories across several pages and matches the row walk", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 130; i += 1) {
        await ctx.db.insert("memories", {
          memoryId: `m${String(i)}`,
          userId: USER,
          profileId: P1,
          title: `Title ${String(i)}`,
          content: "body",
          type: "knowledge",
          source: "api",
          confidence: 0.9,
          status: "active",
          tags: i % 2 === 0 ? ["even", "all"] : ["odd", "all"],
          createdAt: now - (i % 40) * DAY,
          updatedAt: now,
          contentHash: "h",
          visitCount: 1,
          firstVisitAt: now,
          lastVisitAt: now,
        });
      }
    });
    await backfill(t);
    const status = await t.query(
      internal.memoryStats.memoryStatsStatusInternal,
      {},
    );
    expect(status?.ready).toBe(true);

    const counted = await personalStats(t, P1);
    const walked = computeDashboardStats(
      await walkRows(t, (doc) => doc.userId === USER),
      Date.now(),
    );
    expect(counted?.totalMemories).toBe(130);
    expect(counted?.totalTags).toBe(3);
    expect(counted?.growthData).toEqual(walked.growthData);
    expect(counted?.memoriesAddedToday).toBe(walked.memoriesAddedToday);
    const check = await verify(t);
    expect(check.mismatches).toBe(0);
    expect(check.memories).toBe(130);
  });

  it("counts only visible memories, in the backfill, the row walk and on status changes", async () => {
    const t = convexTest(schema, modules);
    await create(t, "m1", { tags: ["a"] });
    await create(t, "m2", { tags: ["b"] });
    await create(t, "m3", { tags: ["hidden"] });
    await t.run(async (ctx) => {
      const doc = await ctx.db
        .query("memories")
        .withIndex("by_memory_id", (q) => q.eq("memoryId", "m3"))
        .first();
      if (doc) await ctx.db.patch(doc._id, { status: "suppressed" });
    });
    await backfill(t);
    expect((await personalStats(t, P1))?.totalMemories).toBe(2);
    expect((await personalStats(t, P1))?.totalTags).toBe(2);
    const check = await verify(t);
    expect(check.mismatches).toBe(0);
    expect(check.memories).toBe(3);

    const statRows = await t.query(
      internal.memoryStore.functions.paginateScopedMemoryStatsInternal,
      {
        kind: "personal",
        userId: USER,
        profileId: P1,
        cursor: null,
        numItems: 10,
      },
    );
    expect(statRows.rows.map((row) => row.tags)).toEqual(
      expect.arrayContaining([["a"], ["b"]]),
    );
    expect(statRows.rows).toHaveLength(2);

    const setStatus = async (
      memoryId: string,
      status: "active" | "suppressed",
    ) => {
      tick();
      await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
        userId: USER,
        memoryId,
        status,
      });
    };
    await setStatus("m1", "suppressed");
    expect((await personalStats(t, P1))?.totalMemories).toBe(1);
    expect((await personalStats(t, P1))?.totalTags).toBe(1);
    await setStatus("m3", "active");
    await setStatus("m1", "active");
    expect((await personalStats(t, P1))?.totalMemories).toBe(3);
    expect((await personalStats(t, P1))?.totalTags).toBe(3);
    expect((await verify(t)).mismatches).toBe(0);
  });

  it("tracks creates, tag edits, deletes and scope changes after the backfill", async () => {
    const t = convexTest(schema, modules);
    await create(t, "old", { tags: ["x"] });
    await backfill(t);

    await create(t, "new1", { tags: ["x", "y"] });
    await create(t, "new2", { profileId: P2, tags: ["z"] });
    expect((await personalStats(t, undefined))?.totalMemories).toBe(3);
    expect((await personalStats(t, P1))?.totalMemories).toBe(2);
    expect((await personalStats(t, P1))?.totalTags).toBe(2);

    tick();
    await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
      userId: USER,
      memoryId: "new1",
      tags: ["q"],
    });
    expect((await personalStats(t, P1))?.totalTags).toBe(2);
    expect((await verify(t)).mismatches).toBe(0);

    tick();
    await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
      userId: USER,
      memoryId: "new1",
      title: "renamed only",
    });
    expect((await verify(t)).mismatches).toBe(0);

    tick();
    await t.mutation(internal.memoryStore.functions.deleteMemoryInternal, {
      userId: USER,
      memoryId: "old",
    });
    const afterDelete = await personalStats(t, P1);
    expect(afterDelete?.totalMemories).toBe(1);
    expect(afterDelete?.totalTags).toBe(1);

    tick();
    await t.mutation(
      internal.memoryStore.functions.reassignMemoriesProfileInternal,
      { fromProfileId: P2, toProfileId: P1 },
    );
    expect((await personalStats(t, P1))?.totalMemories).toBe(2);
    expect((await personalStats(t, P2))?.totalMemories).toBe(0);
    expect((await verify(t)).mismatches).toBe(0);

    tick();
    await t.mutation(
      internal.memoryStore.functions.deleteMemoriesByProfileInternal,
      { profileId: P1 },
    );
    expect((await personalStats(t, undefined))?.totalMemories).toBe(0);
    expect((await personalStats(t, undefined))?.totalTags).toBe(0);
    const rows = await t.run(async (ctx) =>
      ctx.db.query("memoryStatCounters").collect(),
    );
    expect(rows).toHaveLength(0);
  });

  it("scopes personal reads like the row walk and team reads by profile", async () => {
    const t = convexTest(schema, modules);
    await create(t, "legacy", { profileId: null, tags: ["l"] });
    await create(t, "p1", { profileId: P1, tags: ["a"] });
    await create(t, "p2", { profileId: P2, tags: ["b"] });
    await create(t, "other", { userId: OTHER, profileId: P1, tags: ["o"] });
    await create(t, "team-a", { profileId: TEAM, tags: ["t"] });
    await create(t, "team-b", { userId: OTHER, profileId: TEAM, tags: ["t2"] });
    await backfill(t);

    expect((await personalStats(t, P1))?.totalMemories).toBe(2);
    expect((await personalStats(t, P2))?.totalMemories).toBe(2);
    expect((await personalStats(t, undefined))?.totalMemories).toBe(4);
    expect((await personalStats(t, P1, OTHER))?.totalMemories).toBe(1);
    expect((await personalStats(t, undefined, OTHER))?.totalMemories).toBe(2);
    const team = await teamStats(t, TEAM);
    expect(team?.totalMemories).toBe(2);
    expect(team?.totalTags).toBe(2);
    expect((await verify(t)).mismatches).toBe(0);
  });

  it("removes a user's counters when all their memories are deleted", async () => {
    const t = convexTest(schema, modules);
    await create(t, "a", { tags: ["a"] });
    await create(t, "b", { userId: OTHER, tags: ["b"] });
    await backfill(t);
    await t.mutation(
      internal.memoryStore.functions.deleteMemoriesForUserInternal,
      { userId: USER },
    );
    expect((await personalStats(t, undefined))?.totalMemories).toBe(0);
    expect((await personalStats(t, undefined, OTHER))?.totalMemories).toBe(1);
    expect((await verify(t)).mismatches).toBe(0);
  });

  it("deletes by source type are reflected", async () => {
    const t = convexTest(schema, modules);
    await create(t, "keep", { tags: ["k"] });
    await create(t, "drop", { tags: ["d"], sourceType: "notion" });
    await backfill(t);
    await t.mutation(
      internal.memoryStore.functions.deleteMemoriesBySourceTypesInternal,
      { userId: USER, sourceTypes: ["notion"] },
    );
    const stats = await personalStats(t, undefined);
    expect(stats?.totalMemories).toBe(1);
    expect(stats?.totalTags).toBe(1);
    expect((await verify(t)).mismatches).toBe(0);
  });

  it("stays exact when memories change while the backfill is mid-flight", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 6; i += 1) {
      await create(t, `old${String(i)}`, { tags: [`t${String(i)}`, "shared"] });
    }
    tick();
    await t.mutation(internal.memoryStats.startMemoryStatsBackfillInternal, {});
    // scheduled step has not run yet; take over with a small page
    await t.mutation(internal.memoryStats.backfillMemoryStatsStepInternal, {
      batchSize: 2,
    });
    const midway = await t.query(
      internal.memoryStats.memoryStatsStatusInternal,
      {},
    );
    expect(midway?.ready).toBe(false);

    // old0/old1 were counted already, old5 has not been reached
    await create(t, "fresh", { tags: ["fresh"] });
    tick();
    await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
      userId: USER,
      memoryId: "old0",
      tags: ["moved"],
    });
    tick();
    await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
      userId: USER,
      memoryId: "old5",
      tags: ["moved5"],
    });
    tick();
    await t.mutation(internal.memoryStore.functions.deleteMemoryInternal, {
      userId: USER,
      memoryId: "old1",
    });
    tick();
    await t.mutation(internal.memoryStore.functions.deleteMemoryInternal, {
      userId: USER,
      memoryId: "old4",
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const status = await t.query(
      internal.memoryStats.memoryStatsStatusInternal,
      {},
    );
    expect(status?.ready).toBe(true);
    const check = await verify(t);
    expect(check.mismatches).toBe(0);
    expect(check.memories).toBe(5);
    expect((await personalStats(t, undefined))?.totalMemories).toBe(5);
  });

  it("reset clears counters so a rebuild starts clean and reads fall back to null", async () => {
    const t = convexTest(schema, modules);
    await create(t, "a", { tags: ["a"] });
    await backfill(t);
    await t.mutation(internal.memoryStats.resetMemoryStatsInternal, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await personalStats(t, undefined)).toBeNull();
    await backfill(t);
    expect((await personalStats(t, undefined))?.totalMemories).toBe(1);
    expect((await verify(t)).mismatches).toBe(0);
  });

  it("verify reports mismatches when a counter drifts and supports dry runs", async () => {
    const t = convexTest(schema, modules);
    await create(t, "a", { tags: ["a"] });
    await backfill(t);
    const dry = await t.action(internal.memoryStats.verifyMemoryStatsInternal, {
      dryRun: true,
    });
    expect(dry.memories).toBe(1);
    expect(dry.expectedRows).toBe(3);
    await t.run(async (ctx) => {
      const row = await ctx.db.query("memoryStatCounters").first();
      if (row) await ctx.db.patch(row._id, { count: row.count + 5 });
    });
    const check = await verify(t);
    expect(check.mismatches).toBe(1);
    expect(check.sample).toHaveLength(1);
  });
});
