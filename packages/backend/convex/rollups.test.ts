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

async function insertRollup(
  t: T,
  args: {
    userId: Id<"users">;
    profileId: Id<"profiles">;
    period: "day" | "week" | "month";
    periodKey: string;
    startMs: number;
    endMs: number;
    status?: "ok" | "failed";
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("rollups", {
      userId: args.userId,
      profileId: args.profileId,
      period: args.period,
      periodKey: args.periodKey,
      startMs: args.startMs,
      endMs: args.endMs,
      summary: `Summary ${args.periodKey}`,
      highlights: [],
      memoryIds: [],
      stats: { created: 1, updated: 0, suppressed: 0, toolCalls: 0 },
      model: "test",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      createdAt: args.endMs,
      status: args.status ?? "ok",
    });
  });
}

describe("rollups.getRollups", () => {
  const DAY = 86_400_000;
  const OCT = Date.parse("2026-10-01T00:00:00Z");
  const NOV = Date.parse("2026-11-01T00:00:00Z");
  const W43 = Date.parse("2026-10-19T00:00:00Z");

  async function seed(t: T) {
    const owner = await addUser(t, "clerk_reader");
    const rows = { userId: owner.userId, profileId: owner.profileId };
    await insertRollup(t, {
      ...rows,
      period: "month",
      periodKey: "2026-10",
      startMs: OCT,
      endMs: NOV,
    });
    await insertRollup(t, {
      ...rows,
      period: "week",
      periodKey: "2026-W43",
      startMs: W43,
      endMs: W43 + 7 * DAY,
    });
    for (const [key, status] of [
      ["2026-10-18", "ok"],
      ["2026-10-19", "ok"],
      ["2026-10-20", "failed"],
      ["2026-10-21", "ok"],
      ["2026-10-22", "ok"],
    ] as const) {
      const startMs = Date.parse(`${key}T00:00:00Z`);
      await insertRollup(t, {
        ...rows,
        period: "day",
        periodKey: key,
        startMs,
        endMs: startMs + DAY,
        status,
      });
    }
    return owner;
  }

  it("picks the coarsest period that fits and reads only that period", async () => {
    const t = setupT();
    const owner = await seed(t);
    const month = await owner.user.query(api.rollups.getRollups, {
      profileId: owner.profileId,
      startMs: OCT,
      endMs: NOV,
    });
    expect(month.period).toBe("month");
    expect(month.rollups.map((r) => r.periodKey)).toEqual(["2026-10"]);

    const week = await owner.user.query(api.rollups.getRollups, {
      profileId: owner.profileId,
      startMs: W43,
      endMs: W43 + 7 * DAY,
    });
    expect(week.period).toBe("week");
    expect(week.rollups.map((r) => r.periodKey)).toEqual(["2026-W43"]);
  });

  it("returns ok rows that overlap the window, oldest first", async () => {
    const t = setupT();
    const owner = await seed(t);
    // 19 Oct 12:00 to 21 Oct 12:00 overlaps the 19th, 20th and 21st
    const days = await owner.user.query(api.rollups.getRollups, {
      profileId: owner.profileId,
      startMs: W43 + DAY / 2,
      endMs: W43 + 2.5 * DAY,
    });
    expect(days.period).toBe("day");
    // the failed 20th is left out; the 18th and 22nd are outside
    expect(days.rollups.map((r) => r.periodKey)).toEqual([
      "2026-10-19",
      "2026-10-21",
    ]);
    // an explicit period wins over the auto pick
    const forced = await owner.user.query(api.rollups.getRollups, {
      profileId: owner.profileId,
      startMs: OCT,
      endMs: NOV,
      period: "week",
    });
    expect(forced.rollups.map((r) => r.periodKey)).toEqual(["2026-W43"]);
  });

  it("refuses another user's profile", async () => {
    const t = setupT();
    const owner = await seed(t);
    const other = await addUser(t, "clerk_snoop");
    await expect(
      other.user.query(api.rollups.getRollups, {
        profileId: owner.profileId,
        startMs: OCT,
        endMs: NOV,
      }),
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

const WEEK_KEY = "2026-W43";
// Mon 19 to Sun 25 October 2026
const WEEK_DAYS = [19, 20, 21, 22, 23, 24, 25].map((d) => `2026-10-${d}`);

async function addRollup(
  t: T,
  args: {
    userId: Id<"users">;
    profileId: Id<"profiles">;
    period: "day" | "week";
    periodKey: string;
    startMs: number;
    endMs: number;
    status?: "ok" | "failed";
    memoryIds?: string[];
  },
) {
  const { status = "ok", memoryIds = [] } = args;
  await t.run(async (ctx) => {
    await ctx.db.insert("rollups", {
      userId: args.userId,
      profileId: args.profileId,
      period: args.period,
      periodKey: args.periodKey,
      startMs: args.startMs,
      endMs: args.endMs,
      status,
      memoryIds,
      summary: status === "ok" ? `Summary of ${args.periodKey}.` : "",
      highlights: status === "ok" ? [`Highlight of ${args.periodKey}`] : [],
      stats: { created: 2, updated: 1, suppressed: 0, toolCalls: 3 },
      model: "alibaba/qwen3.7-flash",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      createdAt: 0,
    });
  });
}

async function addDayRows(
  t: T,
  owner: { userId: Id<"users">; profileId: Id<"profiles"> },
  dayKeys: string[],
) {
  for (const dayKey of dayKeys) {
    const startMs = Date.parse(`${dayKey}T00:00:00Z`);
    await addRollup(t, {
      ...owner,
      period: "day",
      periodKey: dayKey,
      startMs,
      endMs: startMs + 86_400_000,
      memoryIds: [`mem_${dayKey}`],
    });
  }
}

async function periodRows(t: T, userId: Id<"users">, period: "week" | "month") {
  return await t.run(async (ctx) =>
    ctx.db
      .query("rollups")
      .withIndex("by_user_period", (q) =>
        q.eq("userId", userId).eq("period", period),
      )
      .collect(),
  );
}

function promptOfCall(index: number): string {
  return JSON.stringify(generateText.mock.calls[index]);
}

async function addOptedInUser(t: T, clerkId: string) {
  const owner = await addUser(t, clerkId);
  await t.mutation(internal.userSettings.setRollupsEnabledInternal, {
    userId: owner.userId,
    enabled: true,
  });
  return owner;
}

describe("nightly week / month rollups", () => {
  it("builds the week from the 7 stored day rows after a Sunday", async () => {
    const t = setupT();
    const owner = await addOptedInUser(t, "clerk_week");
    // six stored days; Sunday's day row comes from the nightly day rollup
    await addDayRows(t, owner, WEEK_DAYS.slice(0, 6));
    await addMemory(t, {
      clerkId: "clerk_week",
      profileId: owner.profileId,
      memoryId: "mem_a",
      at: Date.parse("2026-10-25T09:00:00Z"),
    });

    await t.action(internal.nightly.runUser, {
      userId: owner.userId,
      dayKey: "2026-10-25",
    });

    expect(generateText).toHaveBeenCalledTimes(2);
    const weekPrompt = promptOfCall(1);
    for (const dayKey of WEEK_DAYS) {
      expect(weekPrompt).toContain(`## Day ${dayKey}`);
    }
    expect(weekPrompt).toContain("You set up pnpm for vmem.");
    // built from stored rows: no raw memory text in the prompt
    expect(weekPrompt).not.toContain("Content mem_a");
    expect(generateText.mock.calls[1]).toEqual([
      expect.objectContaining({
        providerOptions: {
          gateway: { serviceTier: "flex" },
          alibaba: { enableThinking: false },
        },
      }),
    ]);

    const weeks = await periodRows(t, owner.userId, "week");
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({
      profileId: owner.profileId,
      periodKey: WEEK_KEY,
      startMs: Date.parse("2026-10-19T00:00:00Z"),
      endMs: Date.parse("2026-10-26T00:00:00Z"),
      status: "ok",
      summary: "You set up pnpm for vmem.",
      // the reply's "invented_id" is ignored; ids come from the sources
      memoryIds: [...WEEK_DAYS.slice(0, 6).map((d) => `mem_${d}`), "mem_a"],
      // 6 stored days of 2/1/0/3 plus Sunday's 1 created memory
      stats: { created: 13, updated: 6, suppressed: 0, toolCalls: 18 },
    });
    expect(await periodRows(t, owner.userId, "month")).toEqual([]);
  });

  it("builds no week or month after a mid-week day", async () => {
    const t = setupT();
    const owner = await addOptedInUser(t, "clerk_midweek");
    await addDayRows(t, owner, WEEK_DAYS.slice(0, 5));
    await addMemory(t, {
      clerkId: "clerk_midweek",
      profileId: owner.profileId,
      memoryId: "mem_a",
      at: Date.parse("2026-10-24T09:00:00Z"),
    });

    await t.action(internal.nightly.runUser, {
      userId: owner.userId,
      dayKey: "2026-10-24",
    });

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(await periodRows(t, owner.userId, "week")).toEqual([]);
    expect(await periodRows(t, owner.userId, "month")).toEqual([]);
  });

  it("builds the month from full weeks plus edge days after its last day", async () => {
    const t = setupT();
    const owner = await addOptedInUser(t, "clerk_month");
    // October 2026: Thu 1 – Sun 4, weeks W41–W43, Mon 26 – Sat 31
    for (const [weekKey, start] of [
      ["2026-W41", "2026-10-05"],
      ["2026-W42", "2026-10-12"],
      ["2026-W43", "2026-10-19"],
    ] as const) {
      const startMs = Date.parse(`${start}T00:00:00Z`);
      await addRollup(t, {
        ...owner,
        period: "week",
        periodKey: weekKey,
        startMs,
        endMs: startMs + 7 * 86_400_000,
        memoryIds: [`mem_${weekKey}`],
      });
    }
    await addDayRows(t, owner, ["2026-10-01", "2026-10-04", "2026-10-26"]);
    // days inside a full week are covered by the week row
    await addDayRows(t, owner, ["2026-10-20"]);
    // failed rows are not sources
    const failedStart = Date.parse("2026-10-27T00:00:00Z");
    await addRollup(t, {
      ...owner,
      period: "day",
      periodKey: "2026-10-27",
      startMs: failedStart,
      endMs: failedStart + 86_400_000,
      status: "failed",
    });

    // Saturday 31 October: month closes, week does not
    await t.action(internal.nightly.runUser, {
      userId: owner.userId,
      dayKey: "2026-10-31",
    });

    // no activity on the 31st, so the only call is the month
    expect(generateText).toHaveBeenCalledTimes(1);
    const monthPrompt = promptOfCall(0);
    expect(monthPrompt).toContain("# Month 2026-10 (UTC)");
    expect(monthPrompt).toContain("## Week 2026-W41");
    expect(monthPrompt).toContain("## Day 2026-10-26");
    expect(monthPrompt).not.toContain("2026-10-20");
    expect(monthPrompt).not.toContain("2026-10-27");
    // time order: Oct 1 before W41 before Oct 26
    expect(monthPrompt.indexOf("## Day 2026-10-01")).toBeLessThan(
      monthPrompt.indexOf("## Week 2026-W41"),
    );
    expect(monthPrompt.indexOf("## Week 2026-W43")).toBeLessThan(
      monthPrompt.indexOf("## Day 2026-10-26"),
    );

    const months = await periodRows(t, owner.userId, "month");
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({
      periodKey: "2026-10",
      startMs: Date.parse("2026-10-01T00:00:00Z"),
      endMs: Date.parse("2026-11-01T00:00:00Z"),
      status: "ok",
      memoryIds: [
        "mem_2026-10-01",
        "mem_2026-10-04",
        "mem_2026-W41",
        "mem_2026-W42",
        "mem_2026-W43",
        "mem_2026-10-26",
      ],
      stats: { created: 12, updated: 6, suppressed: 0, toolCalls: 18 },
    });
    // Saturday closes no week: only the 3 seeded week rows
    expect(await periodRows(t, owner.userId, "week")).toHaveLength(3);
  });

  it("makes no call and writes no row without ok source rows", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_nosource");
    const startMs = Date.parse("2026-10-19T00:00:00Z");
    await addRollup(t, {
      ...owner,
      period: "day",
      periodKey: "2026-10-19",
      startMs,
      endMs: startMs + 86_400_000,
      status: "failed",
    });
    // another user's rows are not sources
    const other = await addUser(t, "clerk_other_week");
    await addDayRows(t, other, WEEK_DAYS);

    for (const [period, periodKey] of [
      ["week", WEEK_KEY],
      ["month", "2026-10"],
    ] as const) {
      const result = await t.action(internal.rollups.runPeriodForUserInternal, {
        userId: owner.userId,
        period,
        periodKey,
      });
      expect(result).toEqual({ status: "idle", ok: 0, failed: 0 });
    }
    expect(generateText).not.toHaveBeenCalled();
    expect(await periodRows(t, owner.userId, "week")).toEqual([]);
    expect(await periodRows(t, owner.userId, "month")).toEqual([]);
  });

  it("upserts the same row on a manual rerun", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_rerun");
    await addDayRows(t, owner, WEEK_DAYS);
    const args = {
      userId: owner.userId,
      period: "week" as const,
      periodKey: WEEK_KEY,
    };

    expect(
      await t.action(internal.rollups.runPeriodForUserInternal, args),
    ).toEqual({ status: "done", ok: 1, failed: 0 });
    const first = await periodRows(t, owner.userId, "week");

    generateText.mockResolvedValue(
      reply(JSON.stringify({ summary: "Second week run." })),
    );
    await t.action(internal.rollups.runPeriodForUserInternal, args);
    const rerun = await periodRows(t, owner.userId, "week");
    expect(rerun).toHaveLength(1);
    expect(rerun[0]?._id).toBe(first[0]?._id);
    expect(rerun[0]?.summary).toBe("Second week run.");
    expect(rerun[0]?.memoryIds).toEqual(WEEK_DAYS.map((d) => `mem_${d}`));
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid period key before any read", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_badkey");
    await expect(
      t.action(internal.rollups.runPeriodForUserInternal, {
        userId: owner.userId,
        period: "week",
        periodKey: "2027-W53",
      }),
    ).rejects.toThrow("Invalid week key");
    expect(generateText).not.toHaveBeenCalled();
  });
});
