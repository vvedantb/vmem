/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { supersedeRow } from "./dream";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = Date.parse("2026-10-20T03:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function setupT() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setupT>;

async function addUser(t: T, clerkId: string) {
  const user = t.withIdentity({ subject: clerkId });
  const { userId } = await user.mutation(api.auth.ensureUserExists, {});
  const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
  if (!profile) throw new Error("profile missing");
  return { user, userId, profileId: profile._id, clerkId };
}

type Owner = Awaited<ReturnType<typeof addUser>>;

async function addMemory(
  t: T,
  owner: Owner,
  memoryId: string,
  fields: Partial<Doc<"memories">> = {},
): Promise<Id<"memories">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("memories", {
      memoryId,
      userId: owner.clerkId,
      profileId: owner.profileId,
      title: `Title ${memoryId}`,
      content: `Content ${memoryId}`,
      type: "knowledge",
      source: "mcp",
      confidence: 1,
      status: "active",
      tags: [],
      createdAt: NOW - DAY_MS,
      updatedAt: NOW - DAY_MS,
      contentHash: memoryId,
      visitCount: 1,
      firstVisitAt: NOW - DAY_MS,
      lastVisitAt: NOW - DAY_MS,
      ...fields,
    }),
  );
}

async function addRun(t: T, owner: Owner): Promise<Id<"dreamRuns">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("dreamRuns", {
      userId: owner.userId,
      profileId: owner.profileId,
      trigger: "nightly",
      dryRun: false,
      status: "running",
      startedAt: NOW,
      counts: {
        exactMerged: 0,
        keyMerged: 0,
        nearDupMerged: 0,
        superseded: 0,
        proposals: 0,
        expired: 0,
        archived: 0,
        aiFlagged: 0,
      },
      aiCalls: 0,
      costUsd: 0,
    }),
  );
}

async function getDoc(
  t: T,
  id: Id<"memories">,
): Promise<Doc<"memories"> | null> {
  return await t.run(async (ctx) => ctx.db.get(id));
}

const AI: { relation: "update"; confidence: number; model: string } = {
  relation: "update",
  confidence: 0.95,
  model: "test",
};

async function dreamSupersede(
  t: T,
  runId: Id<"dreamRuns">,
  olderId: Id<"memories">,
  keeperId: Id<"memories">,
): Promise<Id<"dreamActions"> | null> {
  return await t.run(async (ctx) =>
    supersedeRow(ctx, { runId, keeperId, olderId, reason: "newer", ai: AI }),
  );
}

async function totalMemories(t: T, owner: Owner): Promise<number> {
  vi.setSystemTime(Date.now() + 5);
  await t.mutation(internal.memoryStats.startMemoryStatsBackfillInternal, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const stats = await t.query(internal.memoryStats.getMemoryStatsInternal, {
    kind: "personal",
    userId: owner.clerkId,
    profileId: owner.profileId,
    now: Date.now(),
  });
  if (!stats) throw new Error("stats not ready");
  return stats.totalMemories;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("version history: dream supersede vs duplicate merge", () => {
  it("keeps the older row as a prior version, hidden from lists and stats", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_history");
    const runId = await addRun(t, owner);
    const older = await addMemory(t, owner, "mem_old");
    const newer = await addMemory(t, owner, "mem_new", { createdAt: NOW });
    expect(await dreamSupersede(t, runId, older, newer)).not.toBeNull();

    expect(await getDoc(t, older)).toMatchObject({
      status: "suppressed",
      suppressedBy: "dream-supersede",
      supersededBy: newer,
      supersededAt: NOW,
    });
    const history = await owner.user.query(api.memoryApi.history, {
      memoryId: "mem_new",
    });
    expect(history).toEqual([
      expect.objectContaining({ id: "mem_old", content: "Content mem_old" }),
    ]);

    const listed = await owner.user.query(api.memoryApi.list, {
      limit: 50,
      offset: 0,
    });
    expect(listed.memories.map((memory) => memory.id)).toEqual(["mem_new"]);
    expect(await totalMemories(t, owner)).toBe(1);
  });

  it("the 30-day sweep deletes duplicates but never prior versions", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_history");
    const runId = await addRun(t, owner);
    const keeper = await addMemory(t, owner, "mem_keep");
    const dup = await addMemory(t, owner, "mem_dup");
    const older = await addMemory(t, owner, "mem_old");
    await t.mutation(internal.dream.applyMerge, {
      runId,
      keeperId: keeper,
      loserIds: [dup],
      reason: "judge said duplicate",
      ai: { relation: "duplicate", confidence: 0.95, model: "test" },
    });
    await dreamSupersede(t, runId, older, keeper);
    // a write-path version (no suppressedBy) that a bad patch tagged as a
    // dream duplicate is still kept: supersededBy wins
    const tagged = await addMemory(t, owner, "mem_tagged", {
      status: "suppressed",
      suppressedBy: "dream-ai",
      suppressedAt: NOW,
      supersededBy: keeper,
      supersededAt: NOW,
    });

    vi.setSystemTime(NOW + 31 * DAY_MS);
    await t.mutation(internal.dream.sweepExpiredDuplicates, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await getDoc(t, dup)).toBeNull();
    expect(await getDoc(t, older)).not.toBeNull();
    expect(await getDoc(t, tagged)).not.toBeNull();
    expect(await getDoc(t, keeper)).not.toBeNull();
  });

  it("undo of a supersede clears the version link", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_history");
    const runId = await addRun(t, owner);
    const older = await addMemory(t, owner, "mem_old");
    const newer = await addMemory(t, owner, "mem_new");
    const actionId = await dreamSupersede(t, runId, older, newer);
    if (actionId === null) throw new Error("supersede skipped");
    await t.mutation(internal.dream.undoActionInternal, { actionId });

    const restored = await getDoc(t, older);
    expect(restored?.status).toBe("active");
    expect(restored?.supersededBy).toBeUndefined();
    expect(
      await owner.user.query(api.memoryApi.history, { memoryId: "mem_new" }),
    ).toEqual([]);
  });

  it("a manual restore ends the prior-version link", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_history");
    const runId = await addRun(t, owner);
    const older = await addMemory(t, owner, "mem_old");
    const newer = await addMemory(t, owner, "mem_new");
    await dreamSupersede(t, runId, older, newer);
    await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
      userId: owner.clerkId,
      memoryId: "mem_old",
      status: "active",
    });
    expect((await getDoc(t, older))?.supersededBy).toBeUndefined();
  });

  it("history is empty for another user's memory", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_history");
    const stranger = await addUser(t, "clerk_stranger");
    const runId = await addRun(t, owner);
    const older = await addMemory(t, owner, "mem_old");
    const newer = await addMemory(t, owner, "mem_new");
    await dreamSupersede(t, runId, older, newer);
    expect(
      await stranger.user.query(api.memoryApi.history, { memoryId: "mem_new" }),
    ).toEqual([]);
  });
});
