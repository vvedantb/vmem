/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { TRACE_RETENTION_MS } from "./mcpTraces";
import { buildToolTrace } from "./mcp/traceSummary";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type RecordArgs = FunctionArgs<typeof internal.mcpTraces.record>;

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof setup>;

async function seedUser(t: Backend, clerkId: string) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Personal",
      color: "#3B82F6",
      icon: "user",
      isDefault: true,
      createdAt: 1,
      updatedAt: 1,
    });
    return { userId, profileId };
  });
}

function recordArgs(
  clerkUserId: string,
  over: Partial<RecordArgs> = {},
): RecordArgs {
  const body = buildToolTrace(
    "memory_retrieve",
    { query: "convex", apiKey: "vmem_sk_secret" },
    { ok: true, data: { memories: [{ id: "m1", title: "Bounded list" }] } },
  );
  return {
    clerkUserId,
    scope: "personal",
    tool: "memory_retrieve",
    ok: true,
    durationMs: 12,
    createdAt: Date.now(),
    ...body,
    ...over,
  };
}

async function insertAgedTrace(
  t: Backend,
  userId: Id<"users">,
  createdAt: number,
) {
  return t.run(async (ctx) => {
    const traceId = await ctx.db.insert("mcpTraces", {
      userId,
      scope: "personal",
      tool: "ping",
      ok: true,
      durationMs: 1,
      summary: "ping",
      createdAt,
    });
    await ctx.db.insert("mcpTraceDetails", {
      traceId,
      userId,
      args: "{}",
      resultIds: [],
      createdAt,
    });
    return traceId;
  });
}

describe("mcpTraces.record", () => {
  it("stores a trace and its detail on the active profile", async () => {
    const t = setup();
    const { userId, profileId } = await seedUser(t, "clerk_a");
    await t.mutation(internal.mcpTraces.record, recordArgs("clerk_a"));

    const { traces, details } = await t.run(async (ctx) => ({
      traces: await ctx.db.query("mcpTraces").collect(),
      details: await ctx.db.query("mcpTraceDetails").collect(),
    }));
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      userId,
      profileId,
      tool: "memory_retrieve",
      ok: true,
      resultCount: 1,
      summary: 'memory_retrieve "convex" → 1 hit (top: "Bounded list")',
    });
    expect(details).toHaveLength(1);
    expect(details[0]?.traceId).toBe(traces[0]?._id);
    expect(details[0]?.resultIds).toEqual(["m1"]);
    expect(details[0]?.args).toBe('{"query":"convex"}');
  });

  it("uses a hinted profile only when the user owns it", async () => {
    const t = setup();
    const a = await seedUser(t, "clerk_a");
    const b = await seedUser(t, "clerk_b");
    const second = await t.run(async (ctx) =>
      ctx.db.insert("profiles", {
        userId: a.userId,
        name: "Work",
        color: "#000000",
        icon: "briefcase",
        isDefault: false,
        createdAt: 2,
        updatedAt: 2,
      }),
    );
    await t.mutation(
      internal.mcpTraces.record,
      recordArgs("clerk_a", { profileIdHint: second }),
    );
    await t.mutation(
      internal.mcpTraces.record,
      recordArgs("clerk_a", { profileIdHint: b.profileId }),
    );
    await t.mutation(
      internal.mcpTraces.record,
      recordArgs("clerk_a", { profileIdHint: "not-an-id" }),
    );
    const profiles = await t.run(async (ctx) =>
      (await ctx.db.query("mcpTraces").collect()).map((row) => row.profileId),
    );
    expect(profiles).toEqual([second, a.profileId, a.profileId]);
  });

  it("drops the trace when the clerk user has no row", async () => {
    const t = setup();
    await t.mutation(internal.mcpTraces.record, recordArgs("clerk_missing"));
    const count = await t.run(
      async (ctx) => (await ctx.db.query("mcpTraces").collect()).length,
    );
    expect(count).toBe(0);
  });
});

describe("mcpTraces.listMine", () => {
  it("returns only the caller's traces, newest first, paginated", async () => {
    const t = setup();
    await seedUser(t, "clerk_a");
    await seedUser(t, "clerk_b");
    for (let i = 0; i < 5; i++) {
      await t.mutation(
        internal.mcpTraces.record,
        recordArgs("clerk_a", { createdAt: 1_000 + i, summary: `a${i}` }),
      );
    }
    await t.mutation(
      internal.mcpTraces.record,
      recordArgs("clerk_b", { createdAt: 2_000, summary: "b" }),
    );

    const asA = t.withIdentity({ subject: "clerk_a" });
    const first = await asA.query(api.mcpTraces.listMine, {
      paginationOpts: { numItems: 3, cursor: null },
    });
    expect(first.page.map((row) => row.summary)).toEqual(["a4", "a3", "a2"]);
    expect(first.isDone).toBe(false);

    const second = await asA.query(api.mcpTraces.listMine, {
      paginationOpts: { numItems: 3, cursor: first.continueCursor },
    });
    expect(second.page.map((row) => row.summary)).toEqual(["a1", "a0"]);
    expect(second.isDone).toBe(true);
  });

  it("filters by tool, ok and profile", async () => {
    const t = setup();
    const a = await seedUser(t, "clerk_a");
    await t.mutation(
      internal.mcpTraces.record,
      recordArgs("clerk_a", { tool: "ping", summary: "ping" }),
    );
    await t.mutation(
      internal.mcpTraces.record,
      recordArgs("clerk_a", { ok: false, summary: "failed" }),
    );
    const asA = t.withIdentity({ subject: "clerk_a" });
    const page = { paginationOpts: { numItems: 10, cursor: null } };

    const byTool = await asA.query(api.mcpTraces.listMine, {
      ...page,
      tool: "ping",
    });
    expect(byTool.page.map((row) => row.summary)).toEqual(["ping"]);

    const errors = await asA.query(api.mcpTraces.listMine, {
      ...page,
      ok: false,
    });
    expect(errors.page.map((row) => row.summary)).toEqual(["failed"]);

    const byProfile = await asA.query(api.mcpTraces.listMine, {
      ...page,
      profileId: a.profileId,
    });
    expect(byProfile.page).toHaveLength(2);
  });
});

describe("mcpTraces.getDetail", () => {
  it("returns the detail to the owner and null to anyone else", async () => {
    const t = setup();
    await seedUser(t, "clerk_a");
    await seedUser(t, "clerk_b");
    await t.mutation(internal.mcpTraces.record, recordArgs("clerk_a"));
    const traceId = await t.run(async (ctx) => {
      const row = await ctx.db.query("mcpTraces").first();
      if (!row) throw new Error("trace missing");
      return row._id;
    });

    const own = await t
      .withIdentity({ subject: "clerk_a" })
      .query(api.mcpTraces.getDetail, { traceId });
    expect(own?.trace._id).toBe(traceId);
    expect(own?.detail?.resultIds).toEqual(["m1"]);

    const other = await t
      .withIdentity({ subject: "clerk_b" })
      .query(api.mcpTraces.getDetail, { traceId });
    expect(other).toBeNull();
  });
});

describe("mcpTraces.purgeExpired", () => {
  it("deletes traces and details older than 7 days only", async () => {
    const t = setup();
    const { userId } = await seedUser(t, "clerk_a");
    const now = Date.now();
    await insertAgedTrace(t, userId, now - TRACE_RETENTION_MS - 60_000);
    const fresh = await insertAgedTrace(t, userId, now - 60_000);

    const deleted = await t.mutation(internal.mcpTraces.purgeExpired, {});
    expect(deleted).toBe(2);

    const { traces, details } = await t.run(async (ctx) => ({
      traces: await ctx.db.query("mcpTraces").collect(),
      details: await ctx.db.query("mcpTraceDetails").collect(),
    }));
    expect(traces.map((row) => row._id)).toEqual([fresh]);
    expect(details.map((row) => row.traceId)).toEqual([fresh]);
  });

  it("reschedules itself while a full batch was deleted", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { userId } = await seedUser(t, "clerk_a");
    const old = Date.now() - TRACE_RETENTION_MS - 60_000;
    await t.run(async (ctx) => {
      for (let i = 0; i < 501; i++) {
        await ctx.db.insert("mcpTraces", {
          userId,
          scope: "personal",
          tool: "ping",
          ok: true,
          durationMs: 1,
          summary: "ping",
          createdAt: old + i,
        });
      }
    });

    expect(await t.mutation(internal.mcpTraces.purgeExpired, {})).toBe(500);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await t.run(
      async (ctx) => (await ctx.db.query("mcpTraces").collect()).length,
    );
    expect(left).toBe(0);
  });
});
