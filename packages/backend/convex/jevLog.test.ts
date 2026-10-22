/// <reference types="vite/client" />
import type * as Ai from "ai";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = Date.parse("2026-10-20T12:00:00Z");

type EvaluateCall = {
  providerOptions: { gateway: Record<string, string | boolean | string[]> };
};

// no network: Jev (evaluate) is a spy and embeddings always fail
const evaluate = vi.hoisted(() =>
  vi.fn<(call: EvaluateCall) => Promise<object>>(),
);
const embedMany = vi.hoisted(() =>
  vi.fn(async () => Promise.reject(new Error("no embeddings in tests"))),
);

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  experimental_evaluate: evaluate,
  embedMany,
}));

function jevReply() {
  return {
    response: { modelId: "typesafe-ai/jev" },
    answers: {
      rel_0: { type: "boolean", probability: 0.9 },
      best: { type: "choice", choice: "h0", probabilities: { h0: 0.8 } },
    },
    usage: { inputTokens: 400, outputTokens: 20 },
    providerMetadata: { gateway: { cost: "0.0003" } },
  };
}

function setupT() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setupT>;

async function seed(t: T, clerkId: string) {
  const user = t.withIdentity({ subject: clerkId });
  const { userId } = await user.mutation(api.auth.ensureUserExists, {});
  const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
  if (!profile) throw new Error("profile missing");
  await t.run(async (ctx) => {
    const title = "Alpha launch plan";
    const content = "The alpha launch is on Friday";
    await ctx.db.insert("memories", {
      memoryId: "mem_alpha",
      userId: clerkId,
      profileId: profile._id,
      title,
      content,
      searchableText: `${title}\n${content}`,
      type: "knowledge",
      source: "mcp",
      confidence: 1,
      status: "active",
      tags: [],
      createdAt: NOW - 1000,
      updatedAt: NOW - 1000,
      contentHash: "hash_alpha",
      visitCount: 1,
      firstVisitAt: NOW - 1000,
      lastVisitAt: NOW - 1000,
    });
  });
  return { user, userId, profileId: profile._id };
}

async function retrieveAndLogs(t: T, clerkId: string) {
  const { user, userId, profileId } = await seed(t, clerkId);
  const result = await user.action(api.memoryApi.retrieveMemories, {
    query: "alpha launch",
    profileId,
    limit: 5,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const logs = await t.run(async (ctx) =>
    (await ctx.db.query("openRouterLogs").collect()).filter(
      (row) => row.feature === "jev",
    ),
  );
  return { result, logs, userId, profileId };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  evaluate.mockReset();
  evaluate.mockImplementation(async () => jevReply());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Jev call logging", () => {
  it("records one jev row with tokens and cost for a judged retrieve", async () => {
    const t = setupT();
    const { result, logs, userId, profileId } = await retrieveAndLogs(
      t,
      "clerk_jev_ok",
    );
    expect(result.memories.map((m) => m.id)).toEqual(["mem_alpha"]);
    expect(evaluate).toHaveBeenCalledTimes(1);
    const gateway = evaluate.mock.calls[0]?.[0].providerOptions.gateway;
    expect(gateway).toMatchObject({ disallowPromptTraining: true });
    expect(gateway).not.toHaveProperty("zeroDataRetention");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      userId,
      profileId,
      feature: "jev",
      endpoint: "chat",
      model: "typesafe-ai/jev",
      promptTokens: 400,
      completionTokens: 20,
      totalTokens: 420,
      costUsd: 0.0003,
    });
    expect(logs[0]?.errorMessage).toBeUndefined();
  });

  it("records the error message when Jev fails, and retrieve still answers", async () => {
    evaluate.mockImplementation(async () =>
      Promise.reject(new Error("gateway exploded")),
    );
    const t = setupT();
    const { result, logs } = await retrieveAndLogs(t, "clerk_jev_fail");
    expect(result.memories.map((m) => m.id)).toEqual(["mem_alpha"]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      feature: "jev",
      model: "typesafe-ai/jev",
      errorMessage: "gateway exploded",
    });
    expect(logs[0]?.costUsd).toBeUndefined();
  });

  it("calls nothing and records nothing without a gateway key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const t = setupT();
    const { result, logs } = await retrieveAndLogs(t, "clerk_jev_nokey");
    expect(result.memories.map((m) => m.id)).toEqual(["mem_alpha"]);
    expect(evaluate).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0);
  });
});
