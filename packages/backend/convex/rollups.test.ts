/// <reference types="vite/client" />
import type * as Ai from "ai";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const DAY_KEY = "2026-10-19";
const DAY_START = Date.parse(`${DAY_KEY}T00:00:00Z`);
const NIGHTLY_AT = Date.parse("2026-10-20T02:30:00Z");

const GOOD_REPLY = JSON.stringify({
  summary: "You set up pnpm for vmem.",
  highlights: ["Chose pnpm"],
  memoryIds: ["mem_a", "invented_id"],
});

function reply(text: string) {
  return {
    text,
    finishReason: "stop",
    response: { id: "gen_test" },
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      inputTokenDetails: {},
      outputTokenDetails: {},
    },
    providerMetadata: { gateway: { cost: "0.0001" } },
  };
}

// no network: the AI SDK chat call is a spy with a canned reply
const generateText = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  generateText,
}));

// convex-test cannot run the workpool loop, so the fake pool runs each job
// through the plain scheduler
vi.mock("./workpools", () => ({
  nightlyPool: {
    enqueueActionBatch: async (
      ctx: MutationCtx,
      fn: typeof internal.nightly.runUser,
      argsList: { userId: Id<"users">; dayKey: string }[],
    ) => {
      for (const args of argsList) await ctx.scheduler.runAfter(0, fn, args);
    },
  },
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
  return { user, userId, profileId: profile._id };
}

async function addMemory(
  t: T,
  args: {
    clerkId: string;
    profileId: string;
    memoryId: string;
    at?: number;
  },
) {
  const at = args.at ?? DAY_START + 3_600_000;
  await t.run(async (ctx) => {
    await ctx.db.insert("memories", {
      memoryId: args.memoryId,
      userId: args.clerkId,
      profileId: args.profileId,
      title: `Title ${args.memoryId}`,
      content: `Content ${args.memoryId}`,
      type: "knowledge",
      source: "mcp",
      confidence: 1,
      status: "active",
      tags: [],
      createdAt: at,
      updatedAt: at,
      contentHash: args.memoryId,
      visitCount: 1,
      firstVisitAt: at,
      lastVisitAt: at,
    });
  });
}

async function rollupRows(t: T, userId: Id<"users">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("rollups")
      .withIndex("by_user_period", (q) =>
        q.eq("userId", userId).eq("period", "day"),
      )
      .collect(),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NIGHTLY_AT);
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  generateText.mockReset();
  generateText.mockResolvedValue(reply(GOOD_REPLY));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("rollups.runDayForUserInternal", () => {
  it("makes no call and writes no row for an empty day", async () => {
    const t = setupT();
    const { userId, profileId } = await addUser(t, "clerk_quiet");
    // activity outside the window does not count
    await addMemory(t, {
      clerkId: "clerk_quiet",
      profileId,
      memoryId: "mem_old",
      at: DAY_START - 1,
    });

    const result = await t.action(internal.rollups.runDayForUserInternal, {
      userId,
      dayKey: DAY_KEY,
    });

    expect(result).toEqual({ status: "idle", ok: 0, failed: 0 });
    expect(generateText).not.toHaveBeenCalled();
    expect(await rollupRows(t, userId)).toEqual([]);
  });

  it("writes one ok row, filters invented ids, and upserts on rerun", async () => {
    const t = setupT();
    const { userId, profileId } = await addUser(t, "clerk_active");
    await addMemory(t, {
      clerkId: "clerk_active",
      profileId,
      memoryId: "mem_a",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpTraces", {
        userId,
        profileId,
        scope: "personal",
        tool: "memory_retrieve",
        ok: true,
        durationMs: 5,
        summary: "convex bandwidth",
        createdAt: DAY_START + 7_200_000,
      });
    });

    const first = await t.action(internal.rollups.runDayForUserInternal, {
      userId,
      dayKey: DAY_KEY,
    });
    expect(first).toEqual({ status: "done", ok: 1, failed: 0 });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0]).toEqual([
      expect.objectContaining({
        model: "alibaba/qwen3.7-flash",
        providerOptions: {
          gateway: { serviceTier: "flex" },
          alibaba: { enableThinking: false },
        },
      }),
    ]);

    const rows = await rollupRows(t, userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      profileId,
      period: "day",
      periodKey: DAY_KEY,
      startMs: DAY_START,
      endMs: DAY_START + 86_400_000,
      status: "ok",
      summary: "You set up pnpm for vmem.",
      highlights: ["Chose pnpm"],
      memoryIds: ["mem_a"],
      stats: { created: 1, updated: 0, suppressed: 0, toolCalls: 1 },
      model: "alibaba/qwen3.7-flash",
      inputTokens: 100,
      outputTokens: 20,
      costUsd: 0.0001,
    });

    generateText.mockResolvedValue(
      reply(JSON.stringify({ summary: "Second run.", memoryIds: [] })),
    );
    await t.action(internal.rollups.runDayForUserInternal, {
      userId,
      dayKey: DAY_KEY,
    });
    const rerun = await rollupRows(t, userId);
    expect(rerun).toHaveLength(1);
    expect(rerun[0]?._id).toBe(rows[0]?._id);
    expect(rerun[0]?.summary).toBe("Second run.");
  });

  it("retries once, then writes a failed row; a failed rerun keeps an ok row", async () => {
    const t = setupT();
    const { userId, profileId } = await addUser(t, "clerk_flaky");
    await addMemory(t, {
      clerkId: "clerk_flaky",
      profileId,
      memoryId: "mem_a",
    });

    generateText.mockResolvedValue(reply("not json"));
    const failed = await t.action(internal.rollups.runDayForUserInternal, {
      userId,
      dayKey: DAY_KEY,
    });
    expect(failed).toEqual({ status: "done", ok: 0, failed: 1 });
    expect(generateText).toHaveBeenCalledTimes(2);
    const failedRows = await rollupRows(t, userId);
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0]).toMatchObject({
      status: "failed",
      summary: "",
      inputTokens: 200,
    });

    generateText.mockResolvedValue(reply(GOOD_REPLY));
    await t.action(internal.rollups.runDayForUserInternal, {
      userId,
      dayKey: DAY_KEY,
    });
    generateText.mockRejectedValue(new Error("gateway down"));
    await t.action(internal.rollups.runDayForUserInternal, {
      userId,
      dayKey: DAY_KEY,
    });
    const kept = await rollupRows(t, userId);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.status).toBe("ok");
  });

  it("does nothing without a gateway key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const t = setupT();
    const { userId, profileId } = await addUser(t, "clerk_nokey");
    await addMemory(t, {
      clerkId: "clerk_nokey",
      profileId,
      memoryId: "mem_a",
    });
    const result = await t.action(internal.rollups.runDayForUserInternal, {
      userId,
      dayKey: DAY_KEY,
    });
    expect(result.status).toBe("no_key");
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("rollups.listForProfile", () => {
  it("returns the caller's rows and refuses other users' profiles", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_owner");
    const other = await addUser(t, "clerk_other");
    await addMemory(t, {
      clerkId: "clerk_owner",
      profileId: owner.profileId,
      memoryId: "mem_a",
    });
    await t.action(internal.rollups.runDayForUserInternal, {
      userId: owner.userId,
      dayKey: DAY_KEY,
    });

    const args = {
      profileId: owner.profileId,
      period: "day" as const,
      startMs: DAY_START,
      endMs: DAY_START + 86_400_000,
    };
    const rows = await owner.user.query(api.rollups.listForProfile, args);
    expect(rows.map((r) => r.periodKey)).toEqual([DAY_KEY]);
    expect(
      await owner.user.query(api.rollups.listForProfile, {
        ...args,
        startMs: DAY_START + 86_400_000,
        endMs: DAY_START + 2 * 86_400_000,
      }),
    ).toEqual([]);
    await expect(
      other.user.query(api.rollups.listForProfile, args),
    ).rejects.toThrow("Profile not accessible");
  });
});

describe("userSettings.setRollupsEnabledInternal", () => {
  it("accepts a user id and rejects a call with neither id", async () => {
    const t = setupT();
    const { userId } = await addUser(t, "clerk_by_id");
    await t.mutation(internal.userSettings.setRollupsEnabledInternal, {
      userId,
      enabled: true,
    });
    expect(
      await t.query(internal.userSettings.getRollupsEnabledInternal, {
        userId,
      }),
    ).toBe(true);
    await expect(
      t.mutation(internal.userSettings.setRollupsEnabledInternal, {
        enabled: true,
      }),
    ).rejects.toThrow("User not found");
  });
});

describe("nightly.kick", () => {
  it("pages all users and rolls up only opted-in users", async () => {
    const t = setupT();
    const quiet = await addUser(t, "clerk_optout");
    await addMemory(t, {
      clerkId: "clerk_optout",
      profileId: quiet.profileId,
      memoryId: "mem_optout",
    });
    // 55 users: the opted-in one is on the second page of 50
    await t.run(async (ctx) => {
      for (let i = 0; i < 54; i++) {
        await ctx.db.insert("users", { clerkId: `clerk_filler_${i}` });
      }
    });
    const enabled = await addUser(t, "clerk_optin");
    await addMemory(t, {
      clerkId: "clerk_optin",
      profileId: enabled.profileId,
      memoryId: "mem_a",
    });
    await t.mutation(internal.userSettings.setRollupsEnabledInternal, {
      clerkId: "clerk_optin",
      enabled: true,
    });

    await t.mutation(internal.nightly.kick, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(await rollupRows(t, quiet.userId)).toEqual([]);
    const rows = await rollupRows(t, enabled.userId);
    expect(rows.map((r) => [r.periodKey, r.status])).toEqual([[DAY_KEY, "ok"]]);
  });

  it("does nothing when NIGHTLY_DISABLED=1", async () => {
    vi.stubEnv("NIGHTLY_DISABLED", "1");
    const t = setupT();
    const { userId, profileId } = await addUser(t, "clerk_killed");
    await addMemory(t, {
      clerkId: "clerk_killed",
      profileId,
      memoryId: "mem_a",
    });
    await t.mutation(internal.userSettings.setRollupsEnabledInternal, {
      userId,
      enabled: true,
    });

    await t.mutation(internal.nightly.kick, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(generateText).not.toHaveBeenCalled();
    expect(await rollupRows(t, userId)).toEqual([]);
    const jobs = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs).toEqual([]);
  });
});
