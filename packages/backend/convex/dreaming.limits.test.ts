/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Nightly from "../engine/memory/dream/nightly";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = Date.parse("2026-10-22T02:30:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE = NOW - 40 * DAY_MS;

// small limits so a handful of rows hits them: 6 rows scanned per profile,
// batches of 2, 2 decay actions per night
vi.mock("../engine/memory/dream/nightly", async (importOriginal) => ({
  ...(await importOriginal<typeof Nightly>()),
  DREAM_MAX_SCAN_ROWS: 6,
  DREAM_BATCH_ROWS: 2,
  DREAM_MAX_DECAY_ACTIONS: 2,
}));

function setupT() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setupT>;

async function addUser(t: T, clerkId: string) {
  const user = t.withIdentity({ subject: clerkId });
  const { userId } = await user.mutation(api.auth.ensureUserExists, {});
  const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
  if (!profile) throw new Error("profile missing");
  return { userId, profileId: profile._id, clerkId };
}

type Owner = Awaited<ReturnType<typeof addUser>>;

async function addRows(
  t: T,
  owner: Owner,
  count: number,
  fields: (i: number) => Partial<Doc<"memories">>,
) {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i += 1) {
      const at = NOW - (count - i) * 1000;
      await ctx.db.insert("memories", {
        memoryId: `mem_${String(i)}`,
        userId: owner.clerkId,
        profileId: owner.profileId,
        title: `Title ${String(i)}`,
        content: `Content ${String(i)}`,
        type: "knowledge",
        source: "mcp",
        confidence: 1,
        status: "active",
        tags: [],
        createdAt: at,
        updatedAt: at,
        contentHash: `h_${String(i)}`,
        visitCount: 1,
        firstVisitAt: at,
        lastVisitAt: at,
        ...fields(i),
      });
    }
  });
}

async function runsOf(t: T, owner: Owner) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("dreamRuns")
      .withIndex("by_user_started", (q) => q.eq("userId", owner.userId))
      .order("desc")
      .collect(),
  );
}

async function statuses(t: T) {
  const rows = await t.run(async (ctx) => ctx.db.query("memories").collect());
  return rows.map((row) => row.status);
}

async function runNightly(t: T, owner: Owner) {
  await t.action(internal.nightly.runUser, {
    userId: owner.userId,
    dayKey: "2026-10-21",
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("nightly dreaming limits", () => {
  it("stops the change window at the scan cap and resumes there next night", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_cap");
    // ten pairs of exact duplicates, written one after another
    await addRows(t, owner, 20, (i) => ({
      contentHash: `pair_${String(Math.floor(i / 2))}`,
    }));

    await runNightly(t, owner);
    const [first] = await runsOf(t, owner);
    // 6 rows scanned = 3 pairs
    expect(first).toMatchObject({
      status: "partial",
      counts: { exactMerged: 3 },
      windowThrough: NOW - 15 * 1000,
    });

    vi.setSystemTime(NOW + DAY_MS);
    await runNightly(t, owner);
    const [second] = await runsOf(t, owner);
    // the boundary row is read again, then 5 new rows: 2 more pairs + 1 half
    expect(second?.status).toBe("partial");
    expect(second?.counts.exactMerged).toBe(3);

    for (let night = 2; night < 6; night += 1) {
      vi.setSystemTime(NOW + night * DAY_MS);
      await runNightly(t, owner);
    }
    const [last] = await runsOf(t, owner);
    expect(last?.status).toBe("ok");
    expect(
      (await statuses(t)).filter((status) => status === "suppressed"),
    ).toHaveLength(10);
  });

  it("archives at most the decay cap per night and resumes the decay scan", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_decay_cap");
    // the change window is empty, so the scan budget is all decay's
    await t.run(async (ctx) => {
      await ctx.db.insert("dreamRuns", {
        userId: owner.userId,
        profileId: owner.profileId,
        trigger: "nightly",
        dryRun: false,
        status: "ok",
        startedAt: NOW - 1,
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
        windowThrough: NOW - 1,
      });
    });
    await addRows(t, owner, 5, (i) => ({
      source: "browsing-history",
      sourceType: "browsing-history",
      url: `https://site${String(i)}.test/`,
      usefulnessScore: 0.1,
      lastVisitAt: STALE + i,
      updatedAt: STALE + i,
    }));

    await runNightly(t, owner);
    const [first] = await runsOf(t, owner);
    expect(first).toMatchObject({
      status: "partial",
      counts: { archived: 2 },
      decayThrough: STALE + 1,
    });

    vi.setSystemTime(NOW + DAY_MS);
    await runNightly(t, owner);
    expect((await runsOf(t, owner))[0]?.counts.archived).toBe(2);
    vi.setSystemTime(NOW + 2 * DAY_MS);
    await runNightly(t, owner);
    expect((await runsOf(t, owner))[0]).toMatchObject({
      status: "ok",
      counts: { archived: 1 },
    });
    expect(
      (await statuses(t)).filter((status) => status === "suppressed"),
    ).toHaveLength(5);
  });
});
