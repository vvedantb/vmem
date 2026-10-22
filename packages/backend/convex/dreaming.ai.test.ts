/// <reference types="vite/client" />
import type * as Ai from "ai";
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = Date.parse("2026-10-22T02:30:00Z");

type EvaluateCall = {
  state: { memories: { key: string; title: string }[] };
  providerOptions: { gateway: { tags?: string[] } };
};

type GenerateCall = {
  messages: { role: string; content: string }[];
  providerOptions: Record<string, Record<string, string | boolean>>;
};

// no network: Jev (evaluate) and Qwen (generateText) are spies
const evaluate = vi.hoisted(() =>
  vi.fn<(call: EvaluateCall) => Promise<object>>(),
);
const generateText = vi.hoisted(() =>
  vi.fn<(call: GenerateCall) => Promise<object>>(),
);

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  experimental_evaluate: evaluate,
  generateText,
}));

// Jev: duplicate (keep m0, remove m1) or not
function jevReply(duplicate: number, reason: string) {
  return {
    response: { modelId: "typesafe-ai/jev" },
    answers: {
      duplicate: { type: "boolean", probability: duplicate },
      keep: { type: "choice", choice: "m0", probabilities: { m0: 0.9 } },
      reason: { type: "choice", choice: reason },
      remove_m1: { type: "boolean", probability: 0.9 },
    },
    usage: { inputTokens: 300, outputTokens: 12 },
    providerMetadata: { gateway: { cost: "0.0002" } },
  };
}

// Qwen: one JSON verdict
function qwenReply(fields: Record<string, string | number | null>) {
  return {
    text: JSON.stringify(fields),
    finishReason: "stop",
    response: { id: "gen_dream" },
    usage: {
      inputTokens: 700,
      outputTokens: 40,
      totalTokens: 740,
      inputTokenDetails: {},
      outputTokenDetails: {},
    },
    providerMetadata: { gateway: { cost: "0.0001" } },
  };
}

function setupT() {
  const t = convexTest(schema, modules);
  // profiles.create writes an audit row
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

let seq = 0;

async function addMemory(
  t: T,
  owner: Owner,
  fields: Partial<Doc<"memories">> = {},
): Promise<Id<"memories">> {
  seq += 1;
  const id = `mem_${String(seq)}`;
  // outside the change window, so the deterministic steps leave them alone
  const at = fields.createdAt ?? NOW - 3 * 24 * 60 * 60 * 1000 + seq;
  return await t.run(async (ctx) =>
    ctx.db.insert("memories", {
      memoryId: id,
      userId: owner.clerkId,
      profileId: owner.profileId,
      title: `Title ${id}`,
      content: `Content ${id}`,
      type: "knowledge",
      source: "mcp",
      confidence: 1,
      status: "active",
      tags: [],
      createdAt: at,
      updatedAt: at,
      contentHash: id,
      visitCount: 1,
      firstVisitAt: at,
      lastVisitAt: at,
      ...fields,
    }),
  );
}

async function addCandidate(
  t: T,
  owner: Owner,
  kind: Doc<"dreamCandidates">["kind"],
  memoryId: Id<"memories">,
  neighborId: Id<"memories">,
  profileId: string = owner.profileId,
): Promise<Id<"dreamCandidates">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("dreamCandidates", {
      userId: owner.clerkId,
      profileId,
      memoryId,
      neighborId,
      pairKey: `${memoryId}|${neighborId}`,
      score: kind === "near_dup" ? 0.98 : 0.9,
      kind,
      status: "open",
      createdAt: NOW - 1000,
    }),
  );
}

// a near_dup or maybe_conflict pair of fresh rows
async function addPair(
  t: T,
  owner: Owner,
  kind: Doc<"dreamCandidates">["kind"],
  first: Partial<Doc<"memories">> = {},
  second: Partial<Doc<"memories">> = {},
) {
  const a = await addMemory(t, owner, first);
  const b = await addMemory(t, owner, second);
  const candidateId = await addCandidate(t, owner, kind, a, b);
  return { a, b, candidateId };
}

async function getDoc<Table extends "memories" | "dreamCandidates">(
  t: T,
  id: Id<Table>,
): Promise<Doc<Table>> {
  const doc = await t.run(async (ctx) => ctx.db.get(id));
  if (!doc) throw new Error("row missing");
  return doc;
}

async function lastRun(t: T, owner: Owner): Promise<Doc<"dreamRuns">> {
  const run = await t.run(async (ctx) =>
    ctx.db
      .query("dreamRuns")
      .withIndex("by_user_started", (q) => q.eq("userId", owner.userId))
      .order("desc")
      .first(),
  );
  if (!run) throw new Error("run missing");
  return run;
}

async function actionsOf(t: T, runId: Id<"dreamRuns">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("dreamActions")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect(),
  );
}

async function proposalsOf(t: T, owner: Owner) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("proposedUpdates")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", owner.clerkId).eq("status", "pending"),
      )
      .collect(),
  );
}

async function setAutoAccept(owner: Owner, on: boolean) {
  await owner.user.mutation(api.userSettings.update, {
    dreamModeAutoAccept: on,
  });
}

async function runNightly(t: T, owner: Owner) {
  await t.action(internal.nightly.runUser, {
    userId: owner.userId,
    dayKey: "2026-10-21",
  });
}

beforeEach(() => {
  seq = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  evaluate.mockReset();
  evaluate.mockResolvedValue(jevReply(0.95, "same_fact"));
  generateText.mockReset();
  generateText.mockResolvedValue(
    qwenReply({ relation: "unrelated", keeperId: null, confidence: 0.9 }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("nightly AI judge: near-duplicates (Jev)", () => {
  it("auto-merges a confident duplicate with auto-accept, undoable", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_merge");
    await setAutoAccept(owner, true);
    const { a, b, candidateId } = await addPair(t, owner, "near_dup");

    await runNightly(t, owner);

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate.mock.calls[0]?.[0].providerOptions.gateway.tags).toEqual(
      expect.arrayContaining(["dream-nightly"]),
    );
    expect(generateText).not.toHaveBeenCalled();
    expect(await getDoc(t, b)).toMatchObject({
      status: "suppressed",
      mergedInto: a,
      suppressedBy: "dream-ai",
      suppressedAt: expect.any(Number),
    });
    expect((await getDoc(t, candidateId)).status).toBe("judged");
    const run = await lastRun(t, owner);
    expect(run.counts).toMatchObject({ nearDupMerged: 1, proposals: 0 });
    expect(run.aiCalls).toBe(1);
    expect(run.costUsd).toBeCloseTo(0.0002);
    const [action] = await actionsOf(t, run._id);
    expect(action).toMatchObject({
      kind: "merge",
      keeperId: a,
      memoryIds: [b],
      ai: { relation: "duplicate", confidence: 0.95, model: "typesafe-ai/jev" },
    });
    expect(await proposalsOf(t, owner)).toEqual([]);

    await t.mutation(internal.dream.undoRunInternal, { runId: run._id });
    expect((await getDoc(t, b)).status).toBe("active");
  });

  it("queues a merge proposal without auto-accept; approving merges with undo", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_propose");
    const { a, b } = await addPair(t, owner, "near_dup");

    await runNightly(t, owner);

    expect((await getDoc(t, b)).status).toBe("active");
    const run = await lastRun(t, owner);
    expect(run.counts).toMatchObject({ nearDupMerged: 0, proposals: 1 });
    const [proposal] = await proposalsOf(t, owner);
    const keeper = await getDoc(t, a);
    const loser = await getDoc(t, b);
    expect(proposal).toMatchObject({
      kind: "merge",
      memoryId: keeper.memoryId,
      sourceMemoryIds: [keeper.memoryId, loser.memoryId],
      dreamRunId: run._id,
      source: "dream-mode",
      confidence: 0.95,
    });
    if (!proposal) throw new Error("proposal missing");
    await t.mutation(internal.proposedUpdateApi.resolveInternal, {
      clerkId: owner.clerkId,
      proposalId: proposal.proposalId,
      action: "approve",
    });
    expect(await getDoc(t, b)).toMatchObject({
      status: "suppressed",
      mergedInto: a,
      suppressedBy: "dream-ai",
      suppressedAt: expect.any(Number),
    });
  });

  it("proposes instead of merging below 0.9 confidence, even with auto-accept", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_low");
    await setAutoAccept(owner, true);
    evaluate.mockResolvedValue(jevReply(0.8, "same_fact"));
    const { b } = await addPair(t, owner, "near_dup");
    await runNightly(t, owner);
    expect((await getDoc(t, b)).status).toBe("active");
    expect((await lastRun(t, owner)).counts.proposals).toBe(1);
  });

  it("leaves eva vs vmem 'UI Eva alignment' apart when Jev says different", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_eva");
    await setAutoAccept(owner, true);
    evaluate.mockResolvedValue(jevReply(0.2, "different"));
    const { a, b, candidateId } = await addPair(
      t,
      owner,
      "near_dup",
      { title: "eva UI Eva alignment", content: "eva UI: Eva alignment" },
      { title: "vmem UI Eva alignment", content: "vmem UI: Eva alignment" },
    );
    await runNightly(t, owner);
    const titles = evaluate.mock.calls[0]?.[0].state.memories.map(
      (m) => m.title,
    );
    expect(titles).toEqual(["eva UI Eva alignment", "vmem UI Eva alignment"]);
    expect((await getDoc(t, a)).status).toBe("active");
    expect((await getDoc(t, b)).status).toBe("active");
    expect((await getDoc(t, candidateId)).status).toBe("judged");
    expect(await proposalsOf(t, owner)).toEqual([]);
    expect((await lastRun(t, owner)).aiCalls).toBe(1);
  });

  it("drops a candidate whose row is gone, without a call", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_stale");
    const { candidateId } = await addPair(
      t,
      owner,
      "near_dup",
      {},
      { status: "suppressed" },
    );
    await runNightly(t, owner);
    expect(evaluate).not.toHaveBeenCalled();
    expect((await getDoc(t, candidateId)).status).toBe("dropped");
  });
});

describe("nightly AI judge: conflicts (Qwen)", () => {
  it("asks Qwen with thinking off and queues a contradiction proposal", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_contra");
    await setAutoAccept(owner, true);
    generateText.mockResolvedValue(
      qwenReply({
        relation: "contradiction",
        keeperId: "m0",
        confidence: 0.97,
        reason: "The two memories disagree on the launch date.",
      }),
    );
    const { a, b, candidateId } = await addPair(t, owner, "maybe_conflict");

    await runNightly(t, owner);

    expect(evaluate).not.toHaveBeenCalled();
    expect(generateText).toHaveBeenCalledTimes(1);
    const call = generateText.mock.calls[0]?.[0];
    expect(call?.providerOptions).toMatchObject({
      alibaba: { enableThinking: false },
    });
    expect(call?.messages[1]?.content).toContain("Title mem_1");
    // contradictions always wait for the user, even with auto-accept
    expect((await getDoc(t, a)).status).toBe("active");
    expect((await getDoc(t, b)).status).toBe("active");
    const [proposal] = await proposalsOf(t, owner);
    expect(proposal).toMatchObject({
      kind: "contradiction",
      reason: "The two memories disagree on the launch date.",
      sourceMemoryIds: ["mem_1", "mem_2"],
    });
    expect(proposal?.dreamRunId).toBeUndefined();
    expect((await getDoc(t, candidateId)).status).toBe("judged");
    const run = await lastRun(t, owner);
    expect(run.counts.proposals).toBe(1);
    expect(run.aiCalls).toBe(1);
    expect(run.costUsd).toBeCloseTo(0.0001);
  });

  it("supersedes the older row on a confident update with auto-accept, undoable", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_update");
    await setAutoAccept(owner, true);
    generateText.mockResolvedValue(
      qwenReply({
        relation: "update",
        keeperId: "m1",
        confidence: 0.95,
        reason: "The newer memory changes the deployment.",
      }),
    );
    const { a, b } = await addPair(t, owner, "maybe_conflict");

    await runNightly(t, owner);

    expect(await getDoc(t, a)).toMatchObject({
      status: "suppressed",
      mergedInto: b,
      suppressedBy: "dream-ai",
      suppressedAt: expect.any(Number),
    });
    expect((await getDoc(t, b)).status).toBe("active");
    const run = await lastRun(t, owner);
    expect(run.counts).toMatchObject({ superseded: 1, proposals: 0 });
    const [action] = await actionsOf(t, run._id);
    expect(action).toMatchObject({
      kind: "supersede",
      keeperId: b,
      memoryIds: [a],
      ai: { relation: "update", confidence: 0.95 },
    });
    expect(action?.created.linkIds).toHaveLength(1);

    await t.mutation(internal.dream.undoRunInternal, { runId: run._id });
    const restored = await getDoc(t, a);
    expect(restored.status).toBe("active");
    expect(restored.mergedInto).toBeUndefined();
  });

  it("proposes an update across source families, and approving supersedes", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_family");
    await setAutoAccept(owner, true);
    generateText.mockResolvedValue(
      qwenReply({ relation: "update", keeperId: "m1", confidence: 0.95 }),
    );
    const { a, b } = await addPair(
      t,
      owner,
      "maybe_conflict",
      { source: "mcp" },
      { source: "notion" },
    );

    await runNightly(t, owner);

    expect((await getDoc(t, a)).status).toBe("active");
    const run = await lastRun(t, owner);
    expect(run.counts).toMatchObject({ superseded: 0, proposals: 1 });
    const [proposal] = await proposalsOf(t, owner);
    expect(proposal).toMatchObject({
      kind: "update",
      memoryId: "mem_1",
      sourceMemoryIds: ["mem_1", "mem_2"],
      proposedTitle: "Title mem_2",
      dreamRunId: run._id,
    });
    if (!proposal) throw new Error("proposal missing");
    await t.mutation(internal.proposedUpdateApi.resolveInternal, {
      clerkId: owner.clerkId,
      proposalId: proposal.proposalId,
      action: "approve",
    });
    expect(await getDoc(t, a)).toMatchObject({
      status: "suppressed",
      mergedInto: b,
      suppressedBy: "dream-ai",
      suppressedAt: expect.any(Number),
    });
    // no new memory is written for a dream update
    const rows = await t.run(async (ctx) => ctx.db.query("memories").collect());
    expect(rows).toHaveLength(2);
  });

  it("drops the candidate when Qwen says eva vs vmem are unrelated", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_unrelated");
    const { a, b, candidateId } = await addPair(
      t,
      owner,
      "maybe_conflict",
      { title: "eva UI Eva alignment" },
      { title: "vmem UI Eva alignment" },
    );
    await runNightly(t, owner);
    const prompt = generateText.mock.calls[0]?.[0].messages[1]?.content;
    expect(prompt).toContain("eva UI Eva alignment");
    expect(prompt).toContain("vmem UI Eva alignment");
    expect((await getDoc(t, candidateId)).status).toBe("dropped");
    expect((await getDoc(t, a)).status).toBe("active");
    expect((await getDoc(t, b)).status).toBe("active");
    expect(await proposalsOf(t, owner)).toEqual([]);
  });
});

describe("nightly AI judge: switches, caps and budget", () => {
  it("makes no AI call without AI_GATEWAY_API_KEY and leaves candidates open", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_nokey");
    await setAutoAccept(owner, true);
    const near = await addPair(t, owner, "near_dup");
    const conflict = await addPair(t, owner, "maybe_conflict");
    await runNightly(t, owner);
    expect(evaluate).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect((await getDoc(t, near.b)).status).toBe("active");
    expect((await getDoc(t, near.candidateId)).status).toBe("open");
    expect((await getDoc(t, conflict.candidateId)).status).toBe("open");
    const run = await lastRun(t, owner);
    expect(run.status).toBe("ok");
    expect(run.aiCalls).toBe(0);
    expect(
      (await owner.user.query(api.userSettings.get, {})).dreamModeUseAi,
    ).toBe(false);
  });

  it("makes no AI call when dreamModeUseAi is off", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_off");
    expect(
      (await owner.user.query(api.userSettings.get, {})).dreamModeUseAi,
    ).toBe(true);
    await owner.user.mutation(api.userSettings.update, {
      dreamModeUseAi: false,
    });
    const { candidateId } = await addPair(t, owner, "near_dup");
    await runNightly(t, owner);
    expect(evaluate).not.toHaveBeenCalled();
    expect((await getDoc(t, candidateId)).status).toBe("open");
  });

  it("caps near-dup calls at 25 per user per night across profiles", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_cap");
    const second = await owner.user.mutation(api.profiles.create, {
      name: "Work",
      color: "#10B981",
      icon: "briefcase",
    });
    if (!second) throw new Error("profile missing");
    const secondOwner = { ...owner, profileId: second._id };
    for (let i = 0; i < 15; i += 1) {
      await addPair(t, owner, "near_dup");
      await addPair(t, secondOwner, "near_dup");
    }
    for (let i = 0; i < 18; i += 1) {
      await addPair(t, owner, "maybe_conflict");
    }
    evaluate.mockResolvedValue(jevReply(0.2, "different"));

    await runNightly(t, owner);

    expect(evaluate).toHaveBeenCalledTimes(25);
    expect(generateText).toHaveBeenCalledTimes(15);
    const runs = await t.run(async (ctx) =>
      ctx.db
        .query("dreamRuns")
        .withIndex("by_user_started", (q) => q.eq("userId", owner.userId))
        .collect(),
    );
    expect(runs.reduce((sum, run) => sum + run.aiCalls, 0)).toBe(40);
    const open = await t.run(async (ctx) =>
      ctx.db
        .query("dreamCandidates")
        .filter((q) => q.eq(q.field("status"), "open"))
        .collect(),
    );
    // 30 near-dup - 25 judged, 18 conflicts - 15 judged
    expect(open).toHaveLength(8);
  });

  it("stops once today's dream spend reached $0.50 (all users)", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_budget");
    const other = await addUser(t, "clerk_ai_spender");
    await t.run(async (ctx) => {
      for (const costUsd of [0.3, 0.2]) {
        await ctx.db.insert("openRouterLogs", {
          userId: other.userId,
          feature: "dream",
          endpoint: "chat",
          model: "typesafe-ai/jev",
          costUsd,
          createdAt: NOW - 60_000,
        });
      }
      // yesterday's spend does not count
      await ctx.db.insert("openRouterLogs", {
        userId: other.userId,
        feature: "dream",
        endpoint: "chat",
        model: "typesafe-ai/jev",
        costUsd: 5,
        createdAt: NOW - 3 * 60 * 60 * 1000,
      });
    });
    const { candidateId } = await addPair(t, owner, "near_dup");

    await runNightly(t, owner);

    expect(evaluate).not.toHaveBeenCalled();
    expect((await getDoc(t, candidateId)).status).toBe("open");
    expect((await lastRun(t, owner)).status).toBe("partial");
  });

  it("judges under the budget when only yesterday was spent", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai_yesterday");
    await t.run(async (ctx) => {
      await ctx.db.insert("openRouterLogs", {
        userId: owner.userId,
        feature: "dream",
        endpoint: "chat",
        model: "typesafe-ai/jev",
        costUsd: 5,
        createdAt: NOW - 3 * 60 * 60 * 1000,
      });
    });
    await addPair(t, owner, "near_dup");
    await runNightly(t, owner);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
