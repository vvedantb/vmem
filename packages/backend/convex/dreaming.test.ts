/// <reference types="vite/client" />
import type * as Ai from "ai";
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browseKey } from "@vmem/shared";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type * as RollupActions from "./rollupActions";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = Date.parse("2026-10-22T02:30:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
// the last successful run closed its change window here
const LAST_RUN = NOW - DAY_MS;

// no AI in the dream step: both spies must stay untouched
const generateText = vi.hoisted(() => vi.fn());
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  generateText,
}));

// the rollup step records which of the scope's memories it could still see
const rollupSaw = vi.hoisted(() => {
  const calls: { clerkId: string; profileId: string; ids: string[] }[] = [];
  return calls;
});
vi.mock("./rollupActions", async (importOriginal) => {
  const actual = await importOriginal<typeof RollupActions>();
  return {
    ...actual,
    runRollupDay: vi.fn(
      async (ctx: Parameters<typeof actual.runRollupDay>[0]) => {
        for (const call of rollupSaw) {
          const listed = await ctx.runQuery(
            internal.memoryStore.functions.listMemoriesInternal,
            {
              userId: call.clerkId,
              profileId: call.profileId,
              limit: 50,
              offset: 0,
            },
          );
          call.ids = listed.memories.map((memory) => memory.id);
        }
        return { status: "idle", ok: 0, failed: 0 };
      },
    ),
  };
});

function setupT() {
  const t = convexTest(schema, modules);
  registerAuditLog(t);
  return t;
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
  const at = fields.updatedAt ?? NOW - 1000;
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
      createdAt: at,
      updatedAt: at,
      contentHash: memoryId,
      visitCount: 1,
      firstVisitAt: at,
      lastVisitAt: at,
      ...fields,
    }),
  );
}

// a browsing-history row as old extension versions wrote it (no sourceId)
async function addVisit(
  t: T,
  owner: Owner,
  memoryId: string,
  url: string,
  fields: Partial<Doc<"memories">> = {},
): Promise<Id<"memories">> {
  return await addMemory(t, owner, memoryId, {
    title: "vhub — your own hub",
    content: `vhub\n${url}`,
    source: "browsing-history",
    sourceType: "browsing-history",
    url,
    usefulnessScore: 0.187,
    ...fields,
  });
}

async function addRun(
  t: T,
  owner: Owner,
  fields: Pick<Doc<"dreamRuns">, "trigger" | "dryRun"> &
    Partial<Doc<"dreamRuns">>,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("dreamRuns", {
      userId: owner.userId,
      profileId: owner.profileId,
      status: "ok",
      startedAt: LAST_RUN,
      finishedAt: LAST_RUN,
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
      ...fields,
    });
  });
}

// a finished nightly run whose window ended at LAST_RUN
async function addPreviousRun(t: T, owner: Owner) {
  await addRun(t, owner, {
    trigger: "nightly",
    dryRun: false,
    windowThrough: LAST_RUN,
  });
}

// a finished one-off cleanup (dreamCleanup); dryRun false means applied
async function addCleanupRun(t: T, owner: Owner, dryRun: boolean) {
  await addRun(t, owner, { trigger: "backfill", dryRun });
}

async function getDoc(t: T, id: Id<"memories">): Promise<Doc<"memories">> {
  const doc = await t.run(async (ctx) => ctx.db.get(id));
  if (!doc) throw new Error("memory missing");
  return doc;
}

async function statusOf(t: T, id: Id<"memories">) {
  return (await getDoc(t, id)).status;
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

async function actionsOf(t: T, runId: Id<"dreamRuns">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("dreamActions")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect(),
  );
}

async function notificationsOf(t: T, owner: Owner) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", owner.userId))
      .collect(),
  );
}

async function runNightly(t: T, owner: Owner) {
  await t.action(internal.nightly.runUser, {
    userId: owner.userId,
    dayKey: "2026-10-21",
  });
}

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // a key is set, so "no AI" means the step never asks, not that it lacks one
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchSpy);
  generateText.mockReset();
  fetchSpy.mockReset();
  rollupSaw.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("nightly dreaming: exact dedupe", () => {
  it("merges duplicates of rows changed since the last run, and only those", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_exact");
    await addPreviousRun(t, owner);
    const before = LAST_RUN - DAY_MS;
    // both outside the window: left alone
    const oldA = await addMemory(t, owner, "old_a", {
      contentHash: "h_old",
      updatedAt: before,
    });
    const oldB = await addMemory(t, owner, "old_b", {
      contentHash: "h_old",
      updatedAt: before,
    });
    // both inside the window: the older one keeps
    const newA = await addMemory(t, owner, "new_a", {
      contentHash: "h_new",
      createdAt: NOW - 5000,
      updatedAt: NOW - 5000,
    });
    const newB = await addMemory(t, owner, "new_b", { contentHash: "h_new" });
    // an old row pulled in by a new duplicate of it
    const peer = await addMemory(t, owner, "peer_old", {
      contentHash: "h_peer",
      updatedAt: before,
      createdAt: before,
    });
    const peerNew = await addMemory(t, owner, "peer_new", {
      contentHash: "h_peer",
    });

    await runNightly(t, owner);

    expect(await statusOf(t, oldA)).toBe("active");
    expect(await statusOf(t, oldB)).toBe("active");
    expect(await statusOf(t, newA)).toBe("active");
    expect(await getDoc(t, newB)).toMatchObject({
      status: "suppressed",
      mergedInto: newA,
      suppressedBy: "dream",
    });
    expect(await statusOf(t, peer)).toBe("active");
    expect(await getDoc(t, peerNew)).toMatchObject({
      status: "suppressed",
      mergedInto: peer,
    });

    const [run] = await runsOf(t, owner);
    expect(run).toMatchObject({
      trigger: "nightly",
      status: "ok",
      windowThrough: NOW,
      counts: { exactMerged: 2, keyMerged: 0 },
    });
    if (!run) return;
    expect((await actionsOf(t, run._id)).map((action) => action.kind)).toEqual([
      "merge",
      "merge",
    ]);
    // one notification for the whole run
    const notes = await notificationsOf(t, owner);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.description).toContain("merged 2 duplicate groups");

    const settings = await t.run(async (ctx) =>
      ctx.db
        .query("userSettings")
        .withIndex("by_user", (q) => q.eq("userId", owner.userId))
        .first(),
    );
    expect(settings?.lastDreamRunAt).toBe(NOW);
  });

  it("starts the next window where the last one ended", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_window");
    await addMemory(t, owner, "a", { contentHash: "h" });
    await addMemory(t, owner, "b", { contentHash: "h" });
    await runNightly(t, owner);
    expect((await runsOf(t, owner))[0]?.counts.exactMerged).toBe(1);

    vi.setSystemTime(NOW + DAY_MS);
    // older than the first run: outside the second window
    await addMemory(t, owner, "c", { contentHash: "h2", updatedAt: NOW - 1 });
    await addMemory(t, owner, "d", { contentHash: "h2", updatedAt: NOW - 1 });
    await runNightly(t, owner);
    const [second] = await runsOf(t, owner);
    expect(second).toMatchObject({
      status: "ok",
      windowThrough: NOW + DAY_MS,
      counts: { exactMerged: 0 },
    });
  });
});

describe("nightly dreaming: first run", () => {
  it("reads only the last day; older duplicates wait for the cleanup", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_first");
    const old = NOW - 2 * DAY_MS;
    // pre-existing duplicates: only the one-off cleanup may merge them
    const oldA = await addMemory(t, owner, "old_a", {
      contentHash: "h_old",
      createdAt: old - 1,
      updatedAt: old - 1,
    });
    const oldB = await addMemory(t, owner, "old_b", {
      contentHash: "h_old",
      updatedAt: old,
    });
    // just outside the first window
    const edgeA = await addMemory(t, owner, "edge_a", {
      contentHash: "h_edge",
      createdAt: NOW - DAY_MS - 2,
      updatedAt: NOW - DAY_MS - 2,
    });
    const edgeB = await addMemory(t, owner, "edge_b", {
      contentHash: "h_edge",
      updatedAt: NOW - DAY_MS - 1,
    });
    // both written in the last day: merged
    const newA = await addMemory(t, owner, "new_a", {
      contentHash: "h_new",
      createdAt: NOW - 5000,
      updatedAt: NOW - 5000,
    });
    const newB = await addMemory(t, owner, "new_b", { contentHash: "h_new" });

    await runNightly(t, owner);

    for (const id of [oldA, oldB, edgeA, edgeB, newA]) {
      expect(await statusOf(t, id)).toBe("active");
    }
    expect(await getDoc(t, newB)).toMatchObject({
      status: "suppressed",
      mergedInto: newA,
    });
    expect((await runsOf(t, owner))[0]).toMatchObject({
      status: "ok",
      windowThrough: NOW,
      counts: { exactMerged: 1 },
    });
  });
});

describe("nightly dreaming: source-key dedupe", () => {
  it("merges browsing rows of the same page, recomputing the key for old rows", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_keys");
    await addPreviousRun(t, owner);
    const key = browseKey({
      url: "https://vhub.projectv.uk/",
      title: "vhub — your own hub",
    });
    // keyed by an earlier merge, outside the window
    const keeper = await addVisit(
      t,
      owner,
      "visit_keeper",
      "https://vhub.projectv.uk/",
      {
        sourceId: key,
        createdAt: LAST_RUN - DAY_MS,
        updatedAt: LAST_RUN - DAY_MS,
        visitCount: 3,
      },
    );
    const a = await addVisit(
      t,
      owner,
      "visit_a",
      "https://vhub.projectv.uk/connectors",
    );
    const b = await addVisit(
      t,
      owner,
      "visit_b",
      "https://vhub.projectv.uk/connectors?view=mine",
    );
    // same page, old and untouched by any new row: stays
    const other = await addVisit(
      t,
      owner,
      "visit_other",
      "https://example.com/",
      {
        title: "Example",
        updatedAt: LAST_RUN - DAY_MS,
      },
    );
    await addVisit(t, owner, "visit_other_2", "https://example.com/?a=1", {
      title: "Example",
      updatedAt: LAST_RUN - DAY_MS,
    });

    await runNightly(t, owner);

    expect(await getDoc(t, keeper)).toMatchObject({
      status: "active",
      visitCount: 5,
      sourceId: key,
    });
    for (const id of [a, b]) {
      expect(await getDoc(t, id)).toMatchObject({
        status: "suppressed",
        mergedInto: keeper,
      });
    }
    expect(await statusOf(t, other)).toBe("active");
    expect((await runsOf(t, owner))[0]?.counts).toMatchObject({
      exactMerged: 0,
      keyMerged: 1,
    });
  });
});

describe("nightly dreaming: expire", () => {
  it("expires active rows past expiresAt with an undoable action", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_expire");
    const old = LAST_RUN - DAY_MS;
    const gone = await addMemory(t, owner, "gone", {
      expiresAt: NOW - 1,
      updatedAt: old,
    });
    const pinned = await addMemory(t, owner, "pinned", {
      expiresAt: NOW - 1,
      status: "pinned",
      updatedAt: old,
    });
    const later = await addMemory(t, owner, "later", {
      expiresAt: NOW + DAY_MS,
      updatedAt: old,
    });
    const never = await addMemory(t, owner, "never", { updatedAt: old });

    await runNightly(t, owner);

    expect(await statusOf(t, gone)).toBe("expired");
    expect(await statusOf(t, pinned)).toBe("pinned");
    expect(await statusOf(t, later)).toBe("active");
    expect(await statusOf(t, never)).toBe("active");
    const [run] = await runsOf(t, owner);
    expect(run?.counts.expired).toBe(1);
    if (!run) return;
    const [action] = await actionsOf(t, run._id);
    expect(action).toMatchObject({ kind: "expire", memoryIds: [gone] });
    if (!action) return;
    await t.mutation(internal.dream.undoActionInternal, {
      actionId: action._id,
    });
    expect(await statusOf(t, gone)).toBe("active");
  });
});

describe("nightly dreaming: decay", () => {
  const stale = NOW - 40 * DAY_MS;

  it("archives stale low-prior rows only", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_decay");
    // first nightly run, after an applied cleanup: decay runs
    await addCleanupRun(t, owner, false);
    const fields = { lastVisitAt: stale, updatedAt: stale, createdAt: stale };
    const archived = await addVisit(t, owner, "stale", "https://a.test/", {
      ...fields,
      title: "A",
    });
    const used = await addVisit(t, owner, "used", "https://b.test/", {
      ...fields,
      title: "B",
    });
    const fact = await addMemory(t, owner, "fact", {
      ...fields,
      usefulnessScore: 0.1,
    });
    const visited = await addVisit(t, owner, "visited", "https://c.test/", {
      ...fields,
      title: "C",
      visitCount: 3,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("memoryUsage", {
        memoryId: "used",
        retrieveHits: 1,
        searchHits: 0,
        contextPackHits: 0,
        lastAccessedAt: stale,
      });
    });

    await runNightly(t, owner);

    expect(await getDoc(t, archived)).toMatchObject({
      status: "suppressed",
      suppressedBy: "dream-decay",
    });
    expect((await getDoc(t, archived)).mergedInto).toBeUndefined();
    expect(await statusOf(t, used)).toBe("active");
    expect(await statusOf(t, fact)).toBe("active");
    expect(await statusOf(t, visited)).toBe("active");
    const [run] = await runsOf(t, owner);
    expect(run).toMatchObject({
      counts: { archived: 1 },
      decayThrough: NOW - 30 * DAY_MS,
    });
    if (!run) return;
    expect(await actionsOf(t, run._id)).toEqual([
      expect.objectContaining({ kind: "archive", memoryIds: [archived] }),
    ]);
  });

  it("skips decay on the first run without an applied cleanup", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_decay_first");
    // a dry run alone changes nothing, so it does not count
    await addCleanupRun(t, owner, true);
    const row = await addVisit(t, owner, "stale", "https://a.test/", {
      lastVisitAt: stale,
      updatedAt: stale,
    });
    await runNightly(t, owner);
    expect(await statusOf(t, row)).toBe("active");
    const [first] = await runsOf(t, owner);
    expect(first).toMatchObject({ trigger: "nightly", status: "ok" });
    expect(first?.decayThrough).toBeUndefined();

    // the second run has a previous nightly run: decay runs
    vi.setSystemTime(NOW + DAY_MS);
    await runNightly(t, owner);
    expect(await getDoc(t, row)).toMatchObject({
      status: "suppressed",
      suppressedBy: "dream-decay",
    });
  });

  it("does nothing when dreamModeDecay is off", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_no_decay");
    await owner.user.mutation(api.userSettings.update, {
      dreamModeDecay: false,
    });
    const row = await addVisit(t, owner, "stale", "https://a.test/", {
      lastVisitAt: stale,
      updatedAt: stale,
    });
    await runNightly(t, owner);
    expect(await statusOf(t, row)).toBe("active");
    expect((await runsOf(t, owner))[0]?.decayThrough).toBeUndefined();
    // nothing changed: no notification
    expect(await notificationsOf(t, owner)).toEqual([]);
  });
});

describe("nightly dreaming: runUser, switches and AI", () => {
  it("dreams before the rollup reads the day", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_order");
    await t.mutation(internal.userSettings.setRollupsEnabledInternal, {
      userId: owner.userId,
      enabled: true,
    });
    await addMemory(t, owner, "first", {
      contentHash: "h",
      createdAt: NOW - 5000,
    });
    await addMemory(t, owner, "second", { contentHash: "h" });
    rollupSaw.push({
      clerkId: owner.clerkId,
      profileId: owner.profileId,
      ids: [],
    });

    await runNightly(t, owner);

    expect(rollupSaw[0]?.ids).toEqual(["first"]);
  });

  it("skips nightly dreaming when dreamModeAutomatic is off", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_off");
    await owner.user.mutation(api.userSettings.update, {
      dreamModeAutomatic: false,
    });
    const b = await addMemory(t, owner, "b", { contentHash: "h" });
    await addMemory(t, owner, "a", { contentHash: "h", createdAt: 1 });
    await runNightly(t, owner);
    expect(await runsOf(t, owner)).toEqual([]);
    expect(await statusOf(t, b)).toBe("active");
  });

  it("DREAM_DISABLED=1 stops nightly and manual dreaming", async () => {
    vi.stubEnv("DREAM_DISABLED", "1");
    const t = setupT();
    const owner = await addUser(t, "clerk_kill");
    const b = await addMemory(t, owner, "b", { contentHash: "h" });
    await addMemory(t, owner, "a", { contentHash: "h", createdAt: 1 });
    await runNightly(t, owner);
    expect(await owner.user.action(api.dreaming.runNow, {})).toMatchObject({
      reason: "disabled",
      runIds: [],
    });
    expect(await runsOf(t, owner)).toEqual([]);
    expect(await statusOf(t, b)).toBe("active");
  });

  it("makes no AI call", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_no_ai");
    await addPreviousRun(t, owner);
    const stale = NOW - 40 * DAY_MS;
    await addMemory(t, owner, "a", { contentHash: "h", createdAt: 1 });
    await addMemory(t, owner, "b", { contentHash: "h" });
    await addMemory(t, owner, "c", { expiresAt: NOW - 1 });
    await addVisit(t, owner, "d", "https://d.test/", {
      lastVisitAt: stale,
      updatedAt: stale,
    });
    await runNightly(t, owner);
    expect((await runsOf(t, owner))[0]?.counts).toMatchObject({
      exactMerged: 1,
      expired: 1,
      archived: 1,
      aiFlagged: 0,
    });
    expect((await runsOf(t, owner))[0]?.aiCalls).toBe(0);
    expect(generateText).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("manual dreaming", () => {
  it("returns the run id and is limited to once an hour", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_manual");
    const b = await addMemory(t, owner, "b", { contentHash: "h" });
    await addMemory(t, owner, "a", { contentHash: "h", createdAt: 1 });

    const first = await owner.user.action(api.dreaming.runNow, {});
    expect(first).toMatchObject({
      reason: "ok",
      failed: 0,
      counts: { exactMerged: 1 },
    });
    expect(first.runIds).toHaveLength(1);
    const [run] = await runsOf(t, owner);
    expect(run).toMatchObject({ _id: first.runIds[0], trigger: "manual" });
    expect(await statusOf(t, b)).toBe("suppressed");
    // manual runs answer in the UI, not with a notification
    expect(await notificationsOf(t, owner)).toEqual([]);

    vi.setSystemTime(NOW + 30 * 60 * 1000);
    expect(await owner.user.action(api.dreaming.runNow, {})).toMatchObject({
      reason: "rate-limited",
      runIds: [],
    });
    vi.setSystemTime(NOW + 61 * 60 * 1000);
    expect((await owner.user.action(api.dreaming.runNow, {})).reason).toBe(
      "ok",
    );
  });
});
