/// <reference types="vite/client" />
import type * as Ai from "ai";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = Date.parse("2026-10-20T03:00:00Z");

type EvaluateCall = { state: { memories: { key: string }[] } };

// no network: the AI SDK evaluate call (Jev) is a spy
const evaluate = vi.hoisted(() =>
  vi.fn<(call: EvaluateCall) => Promise<object>>(),
);

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  experimental_evaluate: evaluate,
}));

function jevReply(call: EvaluateCall, duplicate: number) {
  const removes = Object.fromEntries(
    call.state.memories
      .slice(1)
      .map((m) => [`remove_${m.key}`, { type: "boolean", probability: 0.9 }]),
  );
  return {
    response: { modelId: "typesafe-ai/jev" },
    answers: {
      duplicate: { type: "boolean", probability: duplicate },
      keep: { type: "choice", choice: "m0", probabilities: { m0: 0.9 } },
      reason: { type: "choice", choice: "same_fact" },
      ...removes,
    },
    usage: { inputTokens: 100, outputTokens: 8 },
    providerMetadata: { gateway: { cost: "0.0001" } },
  };
}

function setupT() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setupT>;

async function addUser(t: T, clerkId: string, useAi: boolean) {
  const user = t.withIdentity({ subject: clerkId });
  const { userId } = await user.mutation(api.auth.ensureUserExists, {});
  const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
  if (!profile) throw new Error("profile missing");
  await t.run(async (ctx) => {
    await ctx.db.insert("userSettings", { userId, dreamModeUseAi: useAi });
  });
  return { userId, profileId: profile._id, clerkId };
}

type Owner = Awaited<ReturnType<typeof addUser>>;

let seq = 0;

async function addMemory(t: T, owner: Owner, tags: string[]) {
  seq += 1;
  return await t.run(async (ctx) =>
    ctx.db.insert("memories", {
      memoryId: `mem_${String(seq)}`,
      userId: owner.clerkId,
      profileId: owner.profileId,
      title: `Title ${String(seq)}`,
      content: `Content ${String(seq)}`,
      type: "knowledge",
      source: "mcp",
      confidence: 1,
      status: "active",
      tags,
      createdAt: NOW + seq,
      updatedAt: NOW + seq,
      contentHash: `hash_${String(seq)}`,
      visitCount: 1,
      firstVisitAt: NOW,
      lastVisitAt: NOW,
    }),
  );
}

async function tagsOf(t: T, id: Id<"memories">): Promise<string[]> {
  return await t.run(async (ctx) => (await ctx.db.get(id))?.tags ?? []);
}

function consolidate(t: T, owner: Owner, withUser: boolean) {
  return t.action(internal.tagConsolidate.consolidateProfileTagsInternal, {
    profileId: owner.profileId,
    ...(withUser ? { userId: owner.userId } : {}),
  });
}

// one memory per tag set: ml-style tags in two spellings, 2 vs 1 uses
async function seedLookAlikes(t: T, owner: Owner) {
  const a = await addMemory(t, owner, ["machine-learning"]);
  const b = await addMemory(t, owner, ["machine-learning", "rust"]);
  const c = await addMemory(t, owner, ["machinelearning"]);
  return { a, b, c };
}

beforeEach(() => {
  seq = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  evaluate.mockReset();
  evaluate.mockImplementation(async (call) => jevReply(call, 0.95));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("tag consolidation AI tier", () => {
  it("merges look-alike tags Jev rates the same, into the most used one, in one call", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_tag_ai", true);
    const { b, c } = await seedLookAlikes(t, owner);
    const result = await t.action(
      internal.tagConsolidate.consolidateProfileTagsInternal,
      { profileId: owner.profileId, userId: owner.userId },
    );
    expect(result).toBeNull();
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(await tagsOf(t, c)).toEqual(["machine-learning"]);
    expect(await tagsOf(t, b)).toEqual(["machine-learning", "rust"]);

    // idempotent: nothing left to merge, so no group and no new call
    await consolidate(t, owner, true);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("keeps both tags when Jev says they differ", async () => {
    evaluate.mockImplementation(async (call) => jevReply(call, 0.1));
    const t = setupT();
    const owner = await addUser(t, "clerk_tag_differ", true);
    const { c } = await seedLookAlikes(t, owner);
    await consolidate(t, owner, true);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(await tagsOf(t, c)).toEqual(["machinelearning"]);
  });

  it("skips the AI tier without a key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const t = setupT();
    const owner = await addUser(t, "clerk_tag_nokey", true);
    const { c } = await seedLookAlikes(t, owner);
    await consolidate(t, owner, true);
    expect(evaluate).not.toHaveBeenCalled();
    expect(await tagsOf(t, c)).toEqual(["machinelearning"]);
  });

  it("skips the AI tier when dreamModeUseAi is off or no user is given", async () => {
    const t = setupT();
    const off = await addUser(t, "clerk_tag_off", false);
    const { c } = await seedLookAlikes(t, off);
    await consolidate(t, off, true);
    await consolidate(t, off, false);
    expect(evaluate).not.toHaveBeenCalled();
    expect(await tagsOf(t, c)).toEqual(["machinelearning"]);
  });

  it("still merges host-name tags deterministically with no AI", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const t = setupT();
    const owner = await addUser(t, "clerk_tag_det", true);
    const a = await addMemory(t, owner, ["wwwyoutubecom"]);
    await consolidate(t, owner, true);
    expect(await tagsOf(t, a)).toEqual(["youtube"]);
  });
});
