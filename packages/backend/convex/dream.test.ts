/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
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
      contentHash: "same",
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
      trigger: "backfill",
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

async function addMention(
  t: T,
  owner: Owner,
  memoryId: string,
  name: string,
): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("memoryEntities")
      .withIndex("by_user_normalized", (q) =>
        q.eq("userId", owner.clerkId).eq("normalizedName", name),
      )
      .first();
    const entityId =
      existing?._id ??
      (await ctx.db.insert("memoryEntities", {
        userId: owner.clerkId,
        profileId: owner.profileId,
        name,
        normalizedName: name,
        type: "technology",
        createdAt: NOW,
      }));
    await ctx.db.insert("memoryEntityMentions", {
      userId: owner.clerkId,
      profileId: owner.profileId,
      memoryId,
      entityId,
      normalizedName: name,
      createdAt: NOW,
    });
  });
}

async function getDoc(t: T, id: Id<"memories">): Promise<Doc<"memories">> {
  const doc = await t.run(async (ctx) => ctx.db.get(id));
  if (!doc) throw new Error("memory missing");
  return doc;
}

async function mentionNames(t: T, memoryId: string): Promise<string[]> {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("memoryEntityMentions")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .collect(),
  );
  return rows.map((row) => row.normalizedName).sort();
}

async function linkCount(t: T, a: string, b: string): Promise<number> {
  const [sourceId, targetId] = a < b ? [a, b] : [b, a];
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("memoryLinks")
      .withIndex("by_source_target", (q) =>
        q.eq("sourceId", sourceId).eq("targetId", targetId),
      )
      .collect(),
  );
  return rows.length;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dream.applyMerge + undo", () => {
  it("merges into the keeper and undo restores every field", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_dream");
    const keeperId = await addMemory(t, owner, "mem_keep", {
      createdAt: NOW - 3 * DAY_MS,
      visitCount: 2,
      firstVisitAt: NOW - 3 * DAY_MS,
      lastVisitAt: NOW - 2 * DAY_MS,
      tags: ["a"],
      url: "https://old.test",
    });
    const loserId = await addMemory(t, owner, "mem_lose", {
      visitCount: 3,
      firstVisitAt: NOW - 5 * DAY_MS,
      lastVisitAt: NOW - 1000,
      tags: ["b"],
      source: "browsing-history",
      sources: ["browsing-history", "extension"],
      url: "https://new.test",
      sourceId: "loser-key",
    });
    await addMemory(t, owner, "mem_other");
    // the loser's own link and mentions stay; the keeper gets the one it lacks
    await t.run(async (ctx) => {
      await ctx.db.insert("memoryLinks", {
        userId: owner.clerkId,
        profileId: owner.profileId,
        sourceId: "mem_lose",
        targetId: "mem_other",
        reason: "related",
        createdAt: NOW,
      });
    });
    await addMention(t, owner, "mem_keep", "convex");
    await addMention(t, owner, "mem_lose", "convex");
    await addMention(t, owner, "mem_lose", "pnpm");
    const keeperBefore = await getDoc(t, keeperId);
    const loserBefore = await getDoc(t, loserId);
    const runId = await addRun(t, owner);

    const actionId = await t.mutation(internal.dream.applyMerge, {
      runId,
      keeperId,
      loserIds: [loserId],
      reason: "same content hash",
      sourceKey: "browse-key",
    });
    if (!actionId) throw new Error("no action");

    const keeper = await getDoc(t, keeperId);
    expect(keeper).toMatchObject({
      status: "active",
      visitCount: 5,
      firstVisitAt: NOW - 5 * DAY_MS,
      lastVisitAt: NOW - 1000,
      tags: ["a", "b"],
      sources: ["mcp", "browsing-history", "extension"],
      url: "https://new.test",
      sourceId: "browse-key",
    });
    expect(keeper.searchableText).toContain("b");
    const loser = await getDoc(t, loserId);
    expect(loser).toMatchObject({
      status: "suppressed",
      mergedInto: keeperId,
      suppressedBy: "dream",
      suppressedRunId: runId,
    });
    expect(await linkCount(t, "mem_lose", "mem_keep")).toBe(1);
    expect(await linkCount(t, "mem_lose", "mem_other")).toBe(1);
    expect(await mentionNames(t, "mem_keep")).toEqual(["convex", "pnpm"]);
    expect(await mentionNames(t, "mem_lose")).toEqual(["convex", "pnpm"]);
    const action = await t.run(async (ctx) => ctx.db.get(actionId));
    expect(action).toMatchObject({
      kind: "merge",
      keeperId,
      memoryIds: [loserId],
      undoExpiresAt: NOW + 30 * DAY_MS,
    });

    await owner.user.mutation(api.dream.undoAction, { actionId });

    const { _creationTime: _k, ...keeperFields } = keeperBefore;
    const { _creationTime: _l, ...loserFields } = loserBefore;
    expect(await getDoc(t, keeperId)).toMatchObject({
      ...keeperFields,
      searchableText: expect.not.stringContaining(" b"),
    });
    const restoredKeeper = await getDoc(t, keeperId);
    expect(restoredKeeper.sources).toBeUndefined();
    expect(restoredKeeper.sourceId).toBeUndefined();
    const restoredLoser = await getDoc(t, loserId);
    expect(restoredLoser).toMatchObject(loserFields);
    expect(restoredLoser.mergedInto).toBeUndefined();
    expect(restoredLoser.suppressedBy).toBeUndefined();
    expect(restoredLoser.suppressedRunId).toBeUndefined();
    // the added link and mention go; the loser's own rows stay
    expect(await linkCount(t, "mem_lose", "mem_keep")).toBe(0);
    expect(await linkCount(t, "mem_lose", "mem_other")).toBe(1);
    expect(await mentionNames(t, "mem_keep")).toEqual(["convex"]);
    expect(await mentionNames(t, "mem_lose")).toEqual(["convex", "pnpm"]);
    expect((await t.run(async (ctx) => ctx.db.get(actionId)))?.undoneAt).toBe(
      NOW,
    );
  });

  it("refuses a double undo and an undo after the window", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_dream");
    const runId = await addRun(t, owner);
    const merge = async (suffix: string) => {
      const keeperId = await addMemory(t, owner, `keep_${suffix}`);
      const loserId = await addMemory(t, owner, `lose_${suffix}`);
      const actionId = await t.mutation(internal.dream.applyMerge, {
        runId,
        keeperId,
        loserIds: [loserId],
        reason: "dup",
      });
      if (!actionId) throw new Error("no action");
      return { actionId, loserId };
    };
    const first = await merge("a");
    await t.mutation(internal.dream.undoActionInternal, {
      actionId: first.actionId,
    });
    await expect(
      t.mutation(internal.dream.undoActionInternal, {
        actionId: first.actionId,
      }),
    ).rejects.toThrow("Already undone");

    const second = await merge("b");
    vi.setSystemTime(NOW + 31 * DAY_MS);
    await expect(
      owner.user.mutation(api.dream.undoAction, { actionId: second.actionId }),
    ).rejects.toThrow("Undo window has passed");
    expect((await getDoc(t, second.loserId)).status).toBe("suppressed");
  });

  it("never suppresses a pinned row", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_dream");
    const runId = await addRun(t, owner);
    const activeId = await addMemory(t, owner, "mem_active");
    const pinnedId = await addMemory(t, owner, "mem_pinned", {
      status: "pinned",
    });
    const actionId = await t.mutation(internal.dream.applyMerge, {
      runId,
      keeperId: activeId,
      loserIds: [pinnedId],
      reason: "dup",
    });
    expect(actionId).not.toBeNull();
    expect((await getDoc(t, pinnedId)).status).toBe("pinned");
    expect(await getDoc(t, activeId)).toMatchObject({
      status: "suppressed",
      mergedInto: pinnedId,
    });

    const otherPinned = await addMemory(t, owner, "mem_pinned_2", {
      status: "pinned",
    });
    expect(
      await t.mutation(internal.dream.applyMerge, {
        runId,
        keeperId: pinnedId,
        loserIds: [otherPinned],
        reason: "dup",
      }),
    ).toBeNull();
    expect((await getDoc(t, otherPinned)).status).toBe("pinned");
  });

  it("tags AI merges and refuses rows outside the run scope", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_dream");
    const stranger = await addUser(t, "clerk_stranger");
    const runId = await addRun(t, owner);
    const keeperId = await addMemory(t, owner, "mem_keep");
    const loserId = await addMemory(t, owner, "mem_lose");
    const foreignId = await addMemory(t, stranger, "mem_foreign");
    await expect(
      t.mutation(internal.dream.applyMerge, {
        runId,
        keeperId,
        loserIds: [foreignId],
        reason: "dup",
      }),
    ).rejects.toThrow("Memory not in dream run scope");
    expect((await getDoc(t, foreignId)).status).toBe("active");

    await t.mutation(internal.dream.applyMerge, {
      runId,
      keeperId,
      loserIds: [loserId],
      reason: "judge said duplicate",
      ai: { relation: "duplicate", confidence: 0.95, model: "test-model" },
    });
    expect((await getDoc(t, loserId)).suppressedBy).toBe("dream-ai");
  });

  it("clears dream fields on a manual status change", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_dream");
    const runId = await addRun(t, owner);
    const keeperId = await addMemory(t, owner, "mem_keep");
    const loserId = await addMemory(t, owner, "mem_lose");
    await t.mutation(internal.dream.applyMerge, {
      runId,
      keeperId,
      loserIds: [loserId],
      reason: "dup",
    });
    await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
      userId: owner.clerkId,
      memoryId: "mem_lose",
      status: "suppressed",
    });
    const loser = await getDoc(t, loserId);
    expect(loser.status).toBe("suppressed");
    expect(loser.suppressedBy).toBeUndefined();
    expect(loser.mergedInto).toBeUndefined();
  });
});

describe("dream.undoRun", () => {
  it("undoes every action of the run, newest first", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_dream");
    const runId = await addRun(t, owner);
    const keeperId = await addMemory(t, owner, "mem_keep", { visitCount: 1 });
    const loserA = await addMemory(t, owner, "mem_a", { visitCount: 2 });
    const loserB = await addMemory(t, owner, "mem_b", { visitCount: 4 });
    for (const loserId of [loserA, loserB]) {
      await t.mutation(internal.dream.applyMerge, {
        runId,
        keeperId,
        loserIds: [loserId],
        reason: "dup",
      });
    }
    expect((await getDoc(t, keeperId)).visitCount).toBe(7);

    expect(await owner.user.mutation(api.dream.undoRun, { runId })).toBe(2);
    expect((await getDoc(t, keeperId)).visitCount).toBe(1);
    expect((await getDoc(t, loserA)).status).toBe("active");
    expect((await getDoc(t, loserB)).status).toBe("active");
    expect(await owner.user.mutation(api.dream.undoRun, { runId })).toBe(0);
  });
});

describe("dream ownership", () => {
  it("lists and undoes only the caller's runs", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_dream");
    const stranger = await addUser(t, "clerk_stranger");
    const runId = await addRun(t, owner);
    const keeperId = await addMemory(t, owner, "mem_keep");
    const loserId = await addMemory(t, owner, "mem_lose");
    const actionId = await t.mutation(internal.dream.applyMerge, {
      runId,
      keeperId,
      loserIds: [loserId],
      reason: "dup",
    });
    if (!actionId) throw new Error("no action");

    expect(
      (await owner.user.query(api.dream.listRuns, {})).map((r) => r._id),
    ).toEqual([runId]);
    expect(await stranger.user.query(api.dream.listRuns, {})).toEqual([]);
    const page = await owner.user.query(api.dream.listActions, {
      runId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((a) => a._id)).toEqual([actionId]);
    await expect(
      stranger.user.query(api.dream.listActions, {
        runId,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow("Dream run not found");
    await expect(
      stranger.user.mutation(api.dream.undoAction, { actionId }),
    ).rejects.toThrow("Dream action not found");
    await expect(
      stranger.user.mutation(api.dream.undoRun, { runId }),
    ).rejects.toThrow("Dream run not found");
    expect((await getDoc(t, loserId)).status).toBe("suppressed");
  });
});

describe("dream.purgeExpiredActions", () => {
  it("drops log rows 90 days after the undo window and keeps memories", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_dream");
    const runId = await addRun(t, owner);
    const keeperId = await addMemory(t, owner, "mem_keep");
    const loserId = await addMemory(t, owner, "mem_lose");
    const actionId = await t.mutation(internal.dream.applyMerge, {
      runId,
      keeperId,
      loserIds: [loserId],
      reason: "dup",
    });
    vi.setSystemTime(NOW + 119 * DAY_MS);
    expect(await t.mutation(internal.dream.purgeExpiredActions, {})).toBe(0);
    vi.setSystemTime(NOW + 121 * DAY_MS);
    expect(await t.mutation(internal.dream.purgeExpiredActions, {})).toBe(1);
    if (!actionId) throw new Error("no action");
    expect(await t.run(async (ctx) => ctx.db.get(actionId))).toBeNull();
    expect((await getDoc(t, loserId)).status).toBe("suppressed");
    expect((await getDoc(t, keeperId)).status).toBe("active");
  });
});

describe("dream web reads", () => {
  it("mergedFrom lists the rows hidden into a keeper until Split out", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_merged");
    const stranger = await addUser(t, "clerk_merged_other");
    const runId = await addRun(t, owner);
    const keeperId = await addMemory(t, owner, "mem_keeper");
    const loserA = await addMemory(t, owner, "mem_a");
    const loserB = await addMemory(t, owner, "mem_b");
    const actionId = await t.mutation(internal.dream.applyMerge, {
      runId,
      keeperId,
      loserIds: [loserA, loserB],
      reason: "dup",
    });
    if (!actionId) throw new Error("no action");

    const merged = await owner.user.query(api.dream.mergedFrom, {
      memoryId: "mem_keeper",
    });
    expect(merged.total).toBe(2);
    expect(merged.groups).toEqual([
      expect.objectContaining({
        actionId,
        kind: "merge",
        rows: [
          { id: "mem_a", title: "Title mem_a" },
          { id: "mem_b", title: "Title mem_b" },
        ],
      }),
    ]);
    expect(
      await stranger.user.query(api.dream.mergedFrom, {
        memoryId: "mem_keeper",
      }),
    ).toEqual({ total: 0, groups: [] });

    await owner.user.mutation(api.dream.undoAction, { actionId });
    expect(
      await owner.user.query(api.dream.mergedFrom, { memoryId: "mem_keeper" }),
    ).toEqual({ total: 0, groups: [] });
  });

  it("lastSuccessfulRunAt skips dry, failed and running runs and other profiles", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_moon");
    const base = {
      userId: owner.userId,
      profileId: owner.profileId,
      trigger: "nightly" as const,
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
    };
    expect(
      await owner.user.query(api.dream.lastSuccessfulRunAt, {
        profileId: owner.profileId,
      }),
    ).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.insert("dreamRuns", {
        ...base,
        dryRun: false,
        status: "ok",
        startedAt: NOW - 3 * DAY_MS,
        finishedAt: NOW - 3 * DAY_MS + 5,
      });
      await ctx.db.insert("dreamRuns", {
        ...base,
        dryRun: false,
        status: "failed",
        startedAt: NOW - 2 * DAY_MS,
        finishedAt: NOW - 2 * DAY_MS + 5,
      });
      await ctx.db.insert("dreamRuns", {
        ...base,
        trigger: "backfill",
        dryRun: true,
        status: "ok",
        startedAt: NOW - DAY_MS,
        finishedAt: NOW - DAY_MS + 5,
      });
      await ctx.db.insert("dreamRuns", {
        ...base,
        dryRun: false,
        status: "running",
        startedAt: NOW,
      });
    });
    expect(
      await owner.user.query(api.dream.lastSuccessfulRunAt, {
        profileId: owner.profileId,
      }),
    ).toBe(NOW - 3 * DAY_MS + 5);
  });

  it("historyInternal returns the last 10 runs, counts only", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_history");
    for (let i = 0; i < 12; i += 1) {
      await t.run(async (ctx) =>
        ctx.db.insert("dreamRuns", {
          userId: owner.userId,
          profileId: owner.profileId,
          trigger: "nightly",
          dryRun: false,
          status: "ok",
          startedAt: NOW + i,
          finishedAt: NOW + i + 1,
          counts: {
            exactMerged: i,
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
          sample: [
            { rule: "exact", keeperTitle: "secret", count: 2, memoryIds: [] },
          ],
        }),
      );
    }
    const rows = await t.query(internal.dream.historyInternal, {
      userId: owner.userId,
    });
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({
      trigger: "nightly",
      startedAt: new Date(NOW + 11).toISOString(),
      counts: { exactMerged: 11 },
    });
    expect(JSON.stringify(rows)).not.toContain("secret");
  });
});
