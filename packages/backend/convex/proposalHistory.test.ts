/// <reference types="vite/client" />
import type * as Ai from "ai";
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DREAM_UNDO_WINDOW_MS } from "../engine/memory/dream/merge";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

// Dreaming page proposal history: approved / rejected proposals, and undo of
// an approved merge through the dream action it made.

const modules = import.meta.glob("./**/*.ts");

const NOW = Date.parse("2026-10-22T02:30:00Z");

// no network: Jev (evaluate) is a spy; no chat call is expected
const evaluate = vi.hoisted(() => vi.fn<() => Promise<object>>());
const generateText = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  experimental_evaluate: evaluate,
  generateText,
}));

// Jev: a confident duplicate, keep m0, remove m1
const JEV_DUPLICATE = {
  response: { modelId: "typesafe-ai/jev" },
  answers: {
    duplicate: { type: "boolean", probability: 0.95 },
    keep: { type: "choice", choice: "m0", probabilities: { m0: 0.9 } },
    reason: { type: "choice", choice: "same_fact" },
    remove_m1: { type: "boolean", probability: 0.9 },
  },
  usage: { inputTokens: 300, outputTokens: 12 },
  providerMetadata: { gateway: { cost: "0.0002" } },
};

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

let seq = 0;

async function addMemory(t: T, owner: Owner): Promise<Id<"memories">> {
  seq += 1;
  const id = `mem_${String(seq)}`;
  const at = NOW - 3 * 24 * 60 * 60 * 1000 + seq;
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
    }),
  );
}

// a near-dup pair, judged tonight into a pending merge proposal
async function proposeMerge(t: T, owner: Owner) {
  const a = await addMemory(t, owner);
  const b = await addMemory(t, owner);
  await t.run(async (ctx) =>
    ctx.db.insert("dreamCandidates", {
      userId: owner.clerkId,
      profileId: owner.profileId,
      memoryId: a,
      neighborId: b,
      pairKey: `${a}|${b}`,
      score: 0.98,
      kind: "near_dup",
      status: "open",
      createdAt: NOW - 1000,
    }),
  );
  await t.action(internal.nightly.runUser, {
    userId: owner.userId,
    dayKey: "2026-10-21",
  });
  const proposal = await t.run(async (ctx) =>
    ctx.db
      .query("proposedUpdates")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", owner.clerkId).eq("status", "pending"),
      )
      .first(),
  );
  if (!proposal) throw new Error("proposal missing");
  return { a, b, proposal };
}

async function resolve(
  t: T,
  owner: Owner,
  proposal: Doc<"proposedUpdates">,
  action: "approve" | "reject",
) {
  await t.mutation(internal.proposedUpdateApi.resolveInternal, {
    clerkId: owner.clerkId,
    proposalId: proposal.proposalId,
    action,
  });
  const resolved = await t.run(async (ctx) => ctx.db.get(proposal._id));
  if (!resolved) throw new Error("proposal gone");
  return resolved;
}

async function history(owner: Owner) {
  return await owner.user.query(api.proposedUpdateApi.listResolved, {
    profileId: owner.profileId,
  });
}

beforeEach(() => {
  seq = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  evaluate.mockReset();
  evaluate.mockResolvedValue(JEV_DUPLICATE);
  generateText.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("proposal history", () => {
  it("stores the dream action of an approved merge; undo restores the hidden memory", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_history_undo");
    const { b, proposal } = await proposeMerge(t, owner);
    expect(await history(owner)).toEqual([]);

    const approved = await resolve(t, owner, proposal, "approve");
    expect((await t.run((ctx) => ctx.db.get(b)))?.status).toBe("suppressed");
    const actionId = approved.dreamActionId;
    if (actionId === undefined) throw new Error("no dream action stored");
    const action = await t.run((ctx) => ctx.db.get(actionId));
    expect(action).toMatchObject({ kind: "merge", memoryIds: [b] });

    const [row] = await history(owner);
    expect(row).toEqual({
      proposalId: proposal.proposalId,
      kind: "merge",
      status: "approved",
      title: proposal.proposedTitle,
      reason: proposal.reason,
      createdAt: proposal.createdAt,
      resolvedAt: NOW,
      undo: { actionId, undoExpiresAt: NOW + DREAM_UNDO_WINDOW_MS },
    });

    await owner.user.mutation(api.dream.undoAction, { actionId });

    expect((await t.run((ctx) => ctx.db.get(b)))?.status).toBe("active");
    const [after] = await history(owner);
    expect(after?.undo).toEqual({
      actionId,
      undoExpiresAt: NOW + DREAM_UNDO_WINDOW_MS,
      undoneAt: NOW,
    });
    await expect(
      owner.user.mutation(api.dream.undoAction, { actionId }),
    ).rejects.toThrow(/Already undone/);
  });

  it("lists a rejected proposal with no undo", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_history_reject");
    const { b, proposal } = await proposeMerge(t, owner);

    const rejected = await resolve(t, owner, proposal, "reject");

    expect(rejected.dreamActionId).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get(b)))?.status).toBe("active");
    expect(await history(owner)).toEqual([
      expect.objectContaining({ status: "rejected", undo: null }),
    ]);
  });

  it("hides undo once a hidden memory was deleted, and refuses it", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_history_gone");
    const { b, proposal } = await proposeMerge(t, owner);
    const approved = await resolve(t, owner, proposal, "approve");
    const actionId = approved.dreamActionId;
    if (actionId === undefined) throw new Error("no dream action stored");

    // the 30-day sweep deletes the hidden duplicate
    vi.setSystemTime(NOW + DREAM_UNDO_WINDOW_MS + 60_000);
    await t.mutation(internal.dream.sweepExpiredDuplicates, {
      suppressedBy: "dream-ai",
    });
    expect(await t.run((ctx) => ctx.db.get(b))).toBeNull();

    expect((await history(owner))[0]?.undo).toBeNull();
    await expect(
      owner.user.mutation(api.dream.undoAction, { actionId }),
    ).rejects.toThrow();
  });

  it("only lists a profile the caller can use", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_history_owner");
    const other = await addUser(t, "clerk_history_other");
    await expect(
      other.user.query(api.proposedUpdateApi.listResolved, {
        profileId: owner.profileId,
      }),
    ).rejects.toThrow();
  });
});
