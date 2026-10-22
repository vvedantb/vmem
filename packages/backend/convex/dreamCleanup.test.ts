/// <reference types="vite/client" />
import type * as Ai from "ai";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MEMORY_EMBEDDING_DIMENSIONS } from "../engine/memory/searchableText";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = Date.parse("2026-10-20T03:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const VHUB_TITLE = "vhub — your own hub for mcp connections and agent secrets";
const VHUB_PATHS = [
  "/",
  "/connectors",
  "/connectors?view=mine",
  "/connectors?category=Notes",
  "/connectors?category=Communication",
  "/connectors?category=Health",
  "/connectors?category=Productivity",
  "/connectors?category=Code",
];

type EvaluateCall = {
  state: { memories: { key: string; title: string }[] };
  providerOptions: { gateway: Record<string, string | boolean | string[]> };
};

// no network: the AI SDK evaluate call (Jev) is a spy
const evaluate = vi.hoisted(() =>
  vi.fn<(call: EvaluateCall) => Promise<object>>(),
);

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  experimental_evaluate: evaluate,
}));

// Jev says "duplicate, keep the first, remove the rest"
function duplicateReply(call: EvaluateCall) {
  const removes = Object.fromEntries(
    call.state.memories
      .slice(1)
      .map((m) => [`remove_${m.key}`, { type: "boolean", probability: 0.9 }]),
  );
  return {
    response: { modelId: "typesafe-ai/jev" },
    answers: {
      duplicate: { type: "boolean", probability: 0.95 },
      keep: { type: "choice", choice: "m0", probabilities: { m0: 0.9 } },
      reason: { type: "choice", choice: "same_fact" },
      ...removes,
    },
    usage: { inputTokens: 300, outputTokens: 12 },
    providerMetadata: { gateway: { cost: "0.0002" } },
  };
}

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

let seq = 0;

async function addMemory(
  t: T,
  owner: Owner,
  fields: Partial<Doc<"memories">> = {},
): Promise<Id<"memories">> {
  seq += 1;
  const memoryId = `mem_${String(seq)}`;
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
      createdAt: NOW - DAY_MS + seq,
      updatedAt: NOW - DAY_MS + seq,
      contentHash: `hash_${memoryId}`,
      visitCount: 1,
      firstVisitAt: NOW - DAY_MS,
      lastVisitAt: NOW - DAY_MS,
      ...fields,
    }),
  );
}

// unit vector on `axis`, tilted a little towards axis + 1
function vector(axis: number, tilt = 0): number[] {
  const out = Array.from({ length: MEMORY_EMBEDDING_DIMENSIONS }, () => 0);
  out[axis] = 1;
  out[axis + 1] = tilt;
  const norm = Math.hypot(1, tilt);
  return out.map((x) => x / norm);
}

async function embed(
  t: T,
  owner: Owner,
  memoryDocId: Id<"memories">,
  embedding: number[],
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("memoryEmbeddings", {
      memoryDocId,
      userId: owner.clerkId,
      profileId: owner.profileId,
      embedding,
    });
  });
}

async function addVhub(t: T, owner: Owner): Promise<Id<"memories">[]> {
  const ids: Id<"memories">[] = [];
  for (const [i, path] of VHUB_PATHS.entries()) {
    ids.push(
      await addMemory(t, owner, {
        title: VHUB_TITLE,
        content: `${VHUB_TITLE}\nhttps://vhub.projectv.uk${path}`,
        url: `https://vhub.projectv.uk${path}`,
        source: "browsing-history",
        sourceType: "browsing-history",
        visitCount: i + 1,
        createdAt: NOW - DAY_MS + i,
      }),
    );
  }
  return ids;
}

async function dryRun(
  t: T,
  owner: Owner,
  extra: { jevMaxCalls?: number } = {},
): Promise<Id<"dreamRuns">> {
  const runId = await t.mutation(internal.dreamCleanup.dryRunForUser, {
    clerkUserId: owner.clerkId,
    ...extra,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return runId;
}

async function summary(t: T, runId: Id<"dreamRuns">) {
  const result = await t.query(internal.dreamCleanup.getRunSummary, { runId });
  if (!result) throw new Error("run missing");
  return result.run;
}

async function apply(
  t: T,
  runId: Id<"dreamRuns">,
  includeAi = false,
): Promise<Id<"dreamRuns">> {
  const applyRunId = await t.mutation(internal.dreamCleanup.applyInternal, {
    runId,
    includeAi,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return applyRunId;
}

async function memories(t: T): Promise<Doc<"memories">[]> {
  return await t.run(async (ctx) => ctx.db.query("memories").collect());
}

async function getDoc(t: T, id: Id<"memories">): Promise<Doc<"memories">> {
  const doc = await t.run(async (ctx) => ctx.db.get(id));
  if (!doc) throw new Error("memory missing");
  return doc;
}

function evaluatedStates(): EvaluateCall["state"][] {
  return evaluate.mock.calls.map(([call]) => call.state);
}

beforeEach(() => {
  seq = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  evaluate.mockReset();
  evaluate.mockImplementation(async (call: EvaluateCall) =>
    duplicateReply(call),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("dreamCleanup dry run", () => {
  it("plans the vhub pattern, an exact trio and A∩B without touching memories", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_cleanup");
    await addVhub(t, owner);
    for (let i = 0; i < 3; i += 1) {
      await addMemory(t, owner, { contentHash: "trio" });
    }
    // a and b share a hash; b and c share a browse key
    const browsing = {
      source: "browsing-history",
      sourceType: "browsing-history",
    };
    await addMemory(t, owner, {
      ...browsing,
      title: "Other",
      url: "https://x.dev/a",
      contentHash: "ab",
    });
    await addMemory(t, owner, {
      ...browsing,
      title: "Docs",
      url: "https://x.dev/b",
      contentHash: "ab",
    });
    await addMemory(t, owner, {
      ...browsing,
      title: "Docs",
      url: "https://x.dev/c",
    });
    const before = await memories(t);

    const run = await summary(t, await dryRun(t, owner));

    expect(await memories(t)).toEqual(before);
    expect(run).toMatchObject({
      dryRun: true,
      trigger: "backfill",
      status: "ok",
      aiCalls: 0,
      cleanup: {
        scannedRows: 14,
        exactGroups: 1,
        keyGroups: 1,
        bothGroups: 1,
        groups: 3,
        rowsToSuppress: 7 + 2 + 2,
      },
    });
    expect(run.sample?.[0]).toMatchObject({
      rule: "key",
      count: 8,
      keeperTitle: VHUB_TITLE,
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("caps sample titles at 80 chars", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_titles");
    const title = "x".repeat(200);
    await addMemory(t, owner, { title, contentHash: "same" });
    await addMemory(t, owner, { title, contentHash: "same" });
    const run = await summary(t, await dryRun(t, owner));
    expect(run.sample?.[0]?.keeperTitle.length).toBe(80);
  });
});

describe("dreamCleanup apply", () => {
  it("merges the vhub rows into one keeper, sums visits, and undoRun restores", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_apply");
    const ids = await addVhub(t, owner);
    const pinnedDup = await addMemory(t, owner, {
      contentHash: "pin",
      status: "pinned",
    });
    const plainDup = await addMemory(t, owner, { contentHash: "pin" });
    const before = await memories(t);

    const planId = await dryRun(t, owner);
    const applyId = await apply(t, planId);

    const [first, ...rest] = ids;
    if (!first) throw new Error("no rows");
    const keeper = await getDoc(t, first);
    expect(keeper).toMatchObject({
      status: "active",
      visitCount: 36,
      sourceId: `vhub.projectv.uk|${VHUB_TITLE.toLowerCase()}`,
    });
    for (const id of rest) {
      expect(await getDoc(t, id)).toMatchObject({
        status: "suppressed",
        mergedInto: first,
        suppressedBy: "dream",
      });
    }
    expect((await getDoc(t, pinnedDup)).status).toBe("pinned");
    expect((await getDoc(t, plainDup)).mergedInto).toBe(pinnedDup);
    expect(await summary(t, applyId)).toMatchObject({
      dryRun: false,
      status: "ok",
      planRunId: planId,
      counts: { exactMerged: 1, keyMerged: 1 },
    });

    await t.mutation(internal.dream.undoRunInternal, { runId: applyId });
    const restored = await memories(t);
    const pick = (docs: Doc<"memories">[]) =>
      docs.map((doc) => [doc._id, doc.status, doc.visitCount, doc.sourceId]);
    expect(pick(restored)).toEqual(pick(before));
  });

  it("skips groups whose rows changed after the plan", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_changed");
    const a = await addMemory(t, owner, { contentHash: "h" });
    const b = await addMemory(t, owner, { contentHash: "h" });
    const planId = await dryRun(t, owner);
    await t.run(async (ctx) => ctx.db.patch(b, { status: "suppressed" }));

    const applyId = await apply(t, planId);

    expect((await getDoc(t, a)).status).toBe("active");
    expect(await summary(t, applyId)).toMatchObject({
      counts: { exactMerged: 0 },
      cleanup: { skippedChanged: 1 },
    });
  });
});

describe("dreamCleanup Jev pass", () => {
  // n1 ~ n2 by vector, e1/e2 share an entity, far is alone, web is a
  // low-prior row with the same vector as n1
  async function seedJev(t: T, owner: Owner) {
    const n1 = await addMemory(t, owner, { title: "Uses pnpm" });
    const n2 = await addMemory(t, owner, { title: "Prefers pnpm" });
    const far = await addMemory(t, owner, { title: "Lives in London" });
    const web = await addMemory(t, owner, {
      title: "pnpm docs",
      source: "browsing-history",
      url: "https://pnpm.io",
    });
    await embed(t, owner, n1, vector(0));
    await embed(t, owner, n2, vector(0, 0.1));
    await embed(t, owner, far, vector(10));
    await embed(t, owner, web, vector(0));
    const e1 = await addMemory(t, owner, { title: "Works on vmem" });
    const e2 = await addMemory(t, owner, { title: "Builds vmem" });
    await t.run(async (ctx) => {
      const entityId = await ctx.db.insert("memoryEntities", {
        userId: owner.clerkId,
        profileId: owner.profileId,
        name: "vmem",
        normalizedName: "vmem",
        type: "technology",
        createdAt: NOW,
      });
      for (const id of [e1, e2]) {
        const doc = await ctx.db.get(id);
        if (!doc) throw new Error("memory missing");
        await ctx.db.insert("memoryEntityMentions", {
          userId: owner.clerkId,
          profileId: owner.profileId,
          memoryId: doc.memoryId,
          entityId,
          normalizedName: "vmem",
          createdAt: NOW,
        });
      }
    });
    return { n1, n2, far, web, e1, e2 };
  }

  it("judges only candidate groups and skips low-prior rows", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_jev");
    await seedJev(t, owner);

    const run = await summary(t, await dryRun(t, owner));

    const titles = evaluatedStates().map((state) =>
      state.memories.map((m) => m.title).sort(),
    );
    expect(titles).toEqual(
      expect.arrayContaining([
        ["Prefers pnpm", "Uses pnpm"],
        ["Builds vmem", "Works on vmem"],
      ]),
    );
    expect(titles).toHaveLength(2);
    expect(run).toMatchObject({
      status: "ok",
      aiCalls: 2,
      counts: { aiFlagged: 2 },
      cleanup: { aiCandidates: 2, aiSkipped: 0, aiCostUnknown: 0 },
    });
    expect(run.costUsd).toBeCloseTo(0.0004);
    expect(run.sample?.filter((s) => s.rule === "near_dup")).toHaveLength(2);
    const logs = await t.run(async (ctx) =>
      ctx.db.query("openRouterLogs").collect(),
    );
    expect(logs.map((log) => [log.feature, log.promptPreview])).toEqual([
      ["dream", undefined],
      ["dream", undefined],
    ]);
    expect(logs[0]).toMatchObject({
      promptTokens: 300,
      completionTokens: 12,
      costUsd: 0.0002,
    });
  });

  it("asks the gateway for no-training routing, not ZDR", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_policy");
    await seedJev(t, owner);
    await dryRun(t, owner);

    const gateways = evaluate.mock.calls.map(
      ([call]) => call.providerOptions.gateway,
    );
    expect(gateways.length).toBeGreaterThan(0);
    for (const gateway of gateways) {
      expect(gateway).toMatchObject({
        disallowPromptTraining: true,
        tags: ["dream-cleanup"],
      });
      expect(gateway).not.toHaveProperty("zeroDataRetention");
    }
  });

  it("respects jevMaxCalls", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_cap");
    await seedJev(t, owner);
    const run = await summary(t, await dryRun(t, owner, { jevMaxCalls: 1 }));
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(run).toMatchObject({
      status: "partial",
      aiCalls: 1,
      cleanup: { aiCandidates: 2, aiSkipped: 1, aiStopReason: "cap" },
    });
  });

  it("stops at the daily budget", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_budget");
    await seedJev(t, owner);
    await t.run(async (ctx) => {
      await ctx.db.insert("openRouterLogs", {
        userId: owner.userId,
        feature: "dream",
        endpoint: "chat",
        model: "typesafe-ai/jev",
        costUsd: 0.5,
        createdAt: NOW - 60_000,
      });
    });
    const run = await summary(t, await dryRun(t, owner));
    expect(evaluate).not.toHaveBeenCalled();
    expect(run).toMatchObject({
      status: "partial",
      aiCalls: 0,
      cleanup: { aiSkipped: 2, aiStopReason: "budget" },
    });
  });

  it("skips rule J without an AI key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const t = setupT();
    const owner = await addUser(t, "clerk_nokey");
    await seedJev(t, owner);
    const run = await summary(t, await dryRun(t, owner));
    expect(evaluate).not.toHaveBeenCalled();
    expect(run).toMatchObject({
      status: "ok",
      cleanup: { aiCandidates: 0, aiStopReason: "no_key" },
    });
  });

  it("ignores malformed Jev output", async () => {
    evaluate.mockImplementation(async () => ({
      response: { modelId: "typesafe-ai/jev" },
      answers: { keep: { type: "choice", choice: "nope" } },
      usage: {},
      providerMetadata: {},
    }));
    const t = setupT();
    const owner = await addUser(t, "clerk_bad");
    const { n2 } = await seedJev(t, owner);
    const planId = await dryRun(t, owner);
    expect(await summary(t, planId)).toMatchObject({
      status: "partial",
      counts: { aiFlagged: 0 },
      cleanup: { aiErrors: 2, aiCostUnknown: 2 },
    });
    await apply(t, planId, true);
    expect((await getDoc(t, n2)).status).toBe("active");
  });

  it("turns Jev groups into proposals; approval suppresses with undo", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_proposal");
    const { n1, n2 } = await seedJev(t, owner);
    const planId = await dryRun(t, owner);

    const applyId = await apply(t, planId, true);

    expect((await getDoc(t, n2)).status).toBe("active");
    const proposals = await t.run(async (ctx) =>
      ctx.db.query("proposedUpdates").collect(),
    );
    expect(proposals).toHaveLength(2);
    expect(proposals[0]).toMatchObject({
      kind: "merge",
      status: "pending",
      dreamRunId: applyId,
    });
    expect((await summary(t, applyId)).counts.proposals).toBe(2);

    const n1Doc = await getDoc(t, n1);
    const proposal = proposals.find((p) => p.memoryId === n1Doc.memoryId);
    if (!proposal) throw new Error("proposal missing");
    await t.mutation(internal.proposedUpdateApi.resolveInternal, {
      clerkId: owner.clerkId,
      proposalId: proposal.proposalId,
      action: "approve",
    });
    expect(await getDoc(t, n2)).toMatchObject({
      status: "suppressed",
      mergedInto: n1,
      suppressedBy: "dream-ai",
      suppressedAt: expect.any(Number),
    });
    await t.mutation(internal.dream.undoRunInternal, { runId: applyId });
    expect((await getDoc(t, n2)).status).toBe("active");
  });

  it("merges Jev groups at once when auto-accept is on", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_auto");
    const { n1, n2 } = await seedJev(t, owner);
    await t.run(async (ctx) => {
      await ctx.db.insert("userSettings", {
        userId: owner.userId,
        dreamModeAutoAccept: true,
      });
    });
    const planId = await dryRun(t, owner);
    const applyId = await apply(t, planId, true);
    expect(await getDoc(t, n2)).toMatchObject({
      status: "suppressed",
      mergedInto: n1,
      suppressedBy: "dream-ai",
      suppressedAt: expect.any(Number),
    });
    expect(await summary(t, applyId)).toMatchObject({
      counts: { nearDupMerged: 2, proposals: 0 },
    });
  });

  it("does not apply Jev groups unless asked", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_noai");
    const { n2 } = await seedJev(t, owner);
    await apply(t, await dryRun(t, owner));
    expect((await getDoc(t, n2)).status).toBe("active");
    const proposals = await t.run(async (ctx) =>
      ctx.db.query("proposedUpdates").collect(),
    );
    expect(proposals).toHaveLength(0);
  });
});

describe("dreamCleanup web", () => {
  it("startDryRun -> latestForProfile -> applyCleanup -> undo one group", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_web");
    const user = t.withIdentity({ subject: owner.clerkId });
    const [first, ...rest] = await addVhub(t, owner);
    if (!first) throw new Error("no rows");
    const a = await addMemory(t, owner, { contentHash: "h" });
    const b = await addMemory(t, owner, { contentHash: "h" });

    const planId = await user.mutation(api.dreamCleanup.startDryRun, {
      profileId: owner.profileId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await user.query(api.dreamCleanup.latestForProfile, {
        profileId: owner.profileId,
      }),
    ).toMatchObject({ _id: planId, dryRun: true, status: "ok" });

    const applyId = await user.mutation(api.dreamCleanup.applyCleanup, {
      runId: planId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await user.query(api.dreamCleanup.latestForProfile, {
        profileId: owner.profileId,
      }),
    ).toMatchObject({ _id: applyId, dryRun: false, status: "ok" });
    await expect(
      user.mutation(api.dreamCleanup.applyCleanup, { runId: planId }),
    ).rejects.toThrow("already applied");
    for (const id of rest) {
      expect((await getDoc(t, id)).status).toBe("suppressed");
    }
    expect((await getDoc(t, b)).mergedInto).toBe(a);

    const page = await user.query(api.dream.listActions, {
      runId: applyId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    const exact = page.page.find((action) => action.keeperId === a);
    if (!exact) throw new Error("exact action missing");
    await user.mutation(api.dream.undoAction, { actionId: exact._id });
    expect((await getDoc(t, b)).status).toBe("active");
    for (const id of rest) {
      expect((await getDoc(t, id)).status).toBe("suppressed");
    }
  });

  it("only applies the caller's own dry run and rate limits scans", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_web_owner");
    const stranger = await addUser(t, "clerk_web_stranger");
    const asStranger = t.withIdentity({ subject: stranger.clerkId });
    await addMemory(t, owner, { contentHash: "h" });
    await addMemory(t, owner, { contentHash: "h" });
    const planId = await dryRun(t, owner);

    await expect(
      asStranger.mutation(api.dreamCleanup.applyCleanup, { runId: planId }),
    ).rejects.toThrow("Dream run not found");
    await expect(
      asStranger.mutation(api.dreamCleanup.startDryRun, {
        profileId: owner.profileId,
      }),
    ).rejects.toThrow("Profile not found");
    expect(
      await asStranger.query(api.dreamCleanup.latestForProfile, {
        profileId: owner.profileId,
      }),
    ).toBeNull();
    await expect(
      t
        .withIdentity({ subject: owner.clerkId })
        .mutation(api.dreamCleanup.startDryRun, {
          profileId: owner.profileId,
        }),
    ).rejects.toThrow("last hour");
  });

  it("sends Jev groups to the inbox even with auto-accept on", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_web_ai");
    const n1 = await addMemory(t, owner, { title: "Uses pnpm" });
    const n2 = await addMemory(t, owner, { title: "Prefers pnpm" });
    await embed(t, owner, n1, vector(0));
    await embed(t, owner, n2, vector(0, 0.1));
    await t.run(async (ctx) => {
      await ctx.db.insert("userSettings", {
        userId: owner.userId,
        dreamModeAutoAccept: true,
      });
    });
    const planId = await dryRun(t, owner);
    await t
      .withIdentity({ subject: owner.clerkId })
      .mutation(api.dreamCleanup.applyCleanup, { runId: planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await getDoc(t, n2)).status).toBe("active");
    const proposals = await t.run(async (ctx) =>
      ctx.db.query("proposedUpdates").collect(),
    );
    expect(proposals).toEqual([
      expect.objectContaining({ kind: "merge", status: "pending" }),
    ]);
  });

  it("skips Jev on a web scan when dreamModeUseAi is off", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_web_noai");
    const n1 = await addMemory(t, owner, { title: "Uses pnpm" });
    const n2 = await addMemory(t, owner, { title: "Prefers pnpm" });
    await embed(t, owner, n1, vector(0));
    await embed(t, owner, n2, vector(0, 0.1));
    await t.run(async (ctx) => {
      await ctx.db.insert("userSettings", {
        userId: owner.userId,
        dreamModeUseAi: false,
      });
    });
    await t
      .withIdentity({ subject: owner.clerkId })
      .mutation(api.dreamCleanup.startDryRun, { profileId: owner.profileId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(evaluate).not.toHaveBeenCalled();
  });
});
