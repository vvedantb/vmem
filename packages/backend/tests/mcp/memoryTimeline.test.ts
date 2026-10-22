import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { memoryToolSpecs } from "../../convex/mcp/toolsMemory";
import {
  asUser,
  createConvexBackend,
  mcpCaller,
  signUp,
  type ConvexTestBackend,
} from "./convexHarness";

const ALICE = "clerk_timeline_alice";
const BOB = "clerk_timeline_bob";
const DAY = 86_400_000;
const at = (iso: string) => Date.parse(iso);

const summarySchema = z.object({
  period: z.enum(["day", "week", "month"]),
  periodKey: z.string(),
  start: z.string(),
  end: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()),
  memoryIds: z.array(z.string()),
  stats: z.object({
    created: z.number(),
    updated: z.number(),
    suppressed: z.number(),
    toolCalls: z.number(),
  }),
});
const windowSchema = z.object({
  start: z.string(),
  end: z.string(),
  period: z.enum(["day", "week", "month"]),
  summaries: z.array(summarySchema),
});
const knownAtSchema = z.object({
  at: z.string(),
  summaries: z.array(summarySchema),
  memories: z.array(
    z.object({ id: z.string(), title: z.string(), preview: z.string() }),
  ),
});
const packSchema = z.object({
  memoryIds: z.array(z.string()),
  periodSummaries: z.array(summarySchema).optional(),
});

async function insertRollup(
  t: ConvexTestBackend,
  args: {
    userId: Id<"users">;
    profileId: Id<"profiles">;
    period: "day" | "week" | "month";
    periodKey: string;
    startMs: number;
    endMs: number;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("rollups", {
      ...args,
      summary: `Summary ${args.periodKey}`,
      highlights: [`Highlight ${args.periodKey}`],
      memoryIds: [`mem_${args.periodKey}`],
      stats: { created: 1, updated: 0, suppressed: 0, toolCalls: 0 },
      model: "test",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.0001,
      createdAt: args.endMs,
      status: "ok",
    });
  });
}

async function insertDays(
  t: ConvexTestBackend,
  owner: { userId: Id<"users">; profileId: Id<"profiles"> },
  dayKeys: string[],
) {
  for (const key of dayKeys) {
    const startMs = at(`${key}T00:00:00Z`);
    await insertRollup(t, {
      ...owner,
      period: "day",
      periodKey: key,
      startMs,
      endMs: startMs + DAY,
    });
  }
}

async function insertMemory(
  t: ConvexTestBackend,
  args: {
    clerkId: string;
    profileId: string;
    memoryId: string;
    createdAt: number;
    status?: "active" | "suppressed";
  },
) {
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
      status: args.status ?? "active",
      tags: [],
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
      contentHash: args.memoryId,
      visitCount: 1,
      firstVisitAt: args.createdAt,
      lastVisitAt: args.createdAt,
    });
  });
}

beforeEach(() => {
  // no Jev rerank, skills judge or profile LLM call
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MCP memory_timeline (convex-test backend)", () => {
  it("is a memory tool with a description agents can act on", () => {
    const description = memoryToolSpecs.memory_timeline.description;
    expect(description).toContain("never calls an LLM");
    expect(description).toContain("memory_get");
    expect(
      memoryToolSpecs.memory_timeline.schema.safeParse({ date: "yesterday" })
        .success,
    ).toBe(false);
  });

  it("window: picks the coarsest period, keeps slim rows, and only the caller's", async () => {
    const t = createConvexBackend();
    const alice = await signUp(t, ALICE, "alice@example.com");
    const bob = await signUp(t, BOB, "bob@example.com");
    await insertRollup(t, {
      ...alice,
      period: "month",
      periodKey: "2026-10",
      startMs: at("2026-10-01T00:00:00Z"),
      endMs: at("2026-11-01T00:00:00Z"),
    });
    await insertDays(t, alice, ["2026-10-18", "2026-10-19", "2026-10-20"]);
    await insertDays(t, bob, ["2026-10-19"]);

    const raw = await mcpCaller(t, ALICE).call("memory_timeline", {
      start: "2026-10-01",
      end: "2026-10-31",
    });
    // tokens, cost and model stay server-side
    expect(JSON.stringify(raw)).not.toMatch(/costUsd|inputTokens|model/);
    const month = windowSchema.parse(raw);
    expect(month.period).toBe("month");
    expect(month.end).toBe("2026-11-01T00:00:00.000Z");
    expect(month.summaries).toEqual([
      {
        period: "month",
        periodKey: "2026-10",
        start: "2026-10-01T00:00:00.000Z",
        end: "2026-11-01T00:00:00.000Z",
        summary: "Summary 2026-10",
        highlights: ["Highlight 2026-10"],
        memoryIds: ["mem_2026-10"],
        stats: { created: 1, updated: 0, suppressed: 0, toolCalls: 0 },
      },
    ]);

    const days = windowSchema.parse(
      await mcpCaller(t, ALICE).call("memory_timeline", {
        start: "2026-10-19",
        end: "2026-10-20",
      }),
    );
    expect(days.period).toBe("day");
    expect(days.summaries.map((s) => s.periodKey)).toEqual([
      "2026-10-19",
      "2026-10-20",
    ]);

    const forced = windowSchema.parse(
      await mcpCaller(t, ALICE).call("memory_timeline", {
        start: "2026-10-01",
        end: "2026-10-31",
        period: "day",
      }),
    );
    expect(forced.summaries).toHaveLength(3);

    const bobDays = windowSchema.parse(
      await mcpCaller(t, BOB).call("memory_timeline", {
        start: "2026-10-19",
        end: "2026-10-20",
      }),
    );
    expect(bobDays.summaries.map((s) => s.periodKey)).toEqual(["2026-10-19"]);
  });

  it("date: rollups that ended by then plus the newest memories created before it", async () => {
    const t = createConvexBackend();
    const alice = await signUp(t, ALICE, "alice@example.com");
    const bob = await signUp(t, BOB, "bob@example.com");
    await insertDays(t, alice, ["2026-10-18", "2026-10-19", "2026-10-20"]);
    await insertRollup(t, {
      ...alice,
      period: "week",
      periodKey: "2026-W42",
      startMs: at("2026-10-12T00:00:00Z"),
      endMs: at("2026-10-19T00:00:00Z"),
    });
    // W43 has not ended on the 19th
    await insertRollup(t, {
      ...alice,
      period: "week",
      periodKey: "2026-W43",
      startMs: at("2026-10-19T00:00:00Z"),
      endMs: at("2026-10-26T00:00:00Z"),
    });
    for (let i = 0; i < 22; i += 1) {
      await insertMemory(t, {
        clerkId: ALICE,
        profileId: alice.profileId,
        memoryId: `mem_old_${String(i).padStart(2, "0")}`,
        createdAt: at("2026-10-01T00:00:00Z") + i * 1000,
      });
    }
    await insertMemory(t, {
      clerkId: ALICE,
      profileId: alice.profileId,
      memoryId: "mem_hidden",
      createdAt: at("2026-10-19T09:00:00Z"),
      status: "suppressed",
    });
    await insertMemory(t, {
      clerkId: ALICE,
      profileId: alice.profileId,
      memoryId: "mem_later",
      createdAt: at("2026-10-20T09:00:00Z"),
    });
    await insertMemory(t, {
      clerkId: BOB,
      profileId: bob.profileId,
      memoryId: "mem_bob",
      createdAt: at("2026-10-19T09:00:00Z"),
    });

    const known = knownAtSchema.parse(
      await mcpCaller(t, ALICE).call("memory_timeline", {
        date: "2026-10-19",
      }),
    );
    expect(known.at).toBe("2026-10-20T00:00:00.000Z");
    expect(known.summaries.map((s) => s.periodKey)).toEqual([
      "2026-W42",
      "2026-10-19",
      "2026-10-18",
    ]);
    expect(known.memories).toHaveLength(20);
    expect(known.memories[0]?.id).toBe("mem_old_21");
    const ids = known.memories.map((m) => m.id);
    expect(ids).not.toContain("mem_hidden");
    expect(ids).not.toContain("mem_later");
    expect(ids).not.toContain("mem_bob");
  });

  it("team: members share memories but each sees their own rollups", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    const bob = await signUp(t, BOB, "bob@example.com");
    const team = await asUser(t, ALICE, "alice@example.com").mutation(
      api.teams.create,
      { name: "Timeline" },
    );
    await asUser(t, ALICE, "alice@example.com").mutation(api.teams.addMember, {
      teamId: team.teamId,
      email: "bob@example.com",
    });
    await insertDays(t, { userId: bob.userId, profileId: team.profileId }, [
      "2026-10-18",
    ]);
    await insertMemory(t, {
      clerkId: ALICE,
      profileId: team.profileId,
      memoryId: "mem_team",
      createdAt: at("2026-10-18T09:00:00Z"),
    });

    const forBob = knownAtSchema.parse(
      await mcpCaller(t, BOB, "team").call("memory_timeline", {
        date: "2026-10-19",
      }),
    );
    expect(forBob.summaries.map((s) => s.periodKey)).toEqual(["2026-10-18"]);
    expect(forBob.memories.map((m) => m.id)).toEqual(["mem_team"]);

    const forAlice = knownAtSchema.parse(
      await mcpCaller(t, ALICE, "team").call("memory_timeline", {
        date: "2026-10-19",
      }),
    );
    expect(forAlice.summaries).toEqual([]);
    expect(forAlice.memories.map((m) => m.id)).toEqual(["mem_team"]);
  });

  it("rejects date with start / end and an empty window", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    const alice = mcpCaller(t, ALICE);
    await expect(
      alice.call("memory_timeline", {
        date: "2026-10-19",
        start: "2026-10-01",
      }),
    ).rejects.toThrow("not both");
    await expect(
      alice.call("memory_timeline", {
        start: "2026-10-20",
        end: "2026-10-19T00:00:00Z",
      }),
    ).rejects.toThrow("start must be before end");
  });
});

describe("MCP context_pack periodSummaries (convex-test backend)", () => {
  it("attaches up to 3 rollups for a temporal task, none otherwise", async () => {
    const t = createConvexBackend();
    const alice = await signUp(t, ALICE, "alice@example.com");
    // "last week" at Thu 22 Oct 12:00 is 8 Oct 12:00 to 15 Oct 12:00
    await insertDays(t, alice, [
      "2026-10-07",
      "2026-10-08",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    const caller = mcpCaller(t, ALICE);
    const base = { skillLimit: 0, referenceDate: "2026-10-22T12:00:00Z" };

    const temporal = packSchema.parse(
      await caller.call("context_pack", {
        ...base,
        task: "what did I work on last week",
      }),
    );
    expect(temporal.periodSummaries?.map((s) => s.periodKey)).toEqual([
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
    ]);

    const plain = await caller.call("context_pack", {
      ...base,
      task: "pnpm workspace setup",
    });
    expect(packSchema.parse(plain).memoryIds).toEqual([]);
    expect(plain).not.toHaveProperty("periodSummaries");

    // a temporal task with no stored rows keeps the old shape too
    const empty = await caller.call("context_pack", {
      ...base,
      task: "what happened yesterday",
      referenceDate: "2026-09-01T12:00:00Z",
    });
    expect(empty).not.toHaveProperty("periodSummaries");
  });
});
