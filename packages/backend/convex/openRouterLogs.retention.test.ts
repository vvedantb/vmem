/// <reference types="vite/client" />
import aggregateTest from "@convex-dev/aggregate/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { openRouterCost, userLogNamespace } from "./openRouterAggregates";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function setup() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "openRouterLogCost");
  aggregateTest.register(t, "openRouterLogTokens");
  aggregateTest.register(t, "openRouterModels");
  return t;
}

type Backend = ReturnType<typeof setup>;

async function seedUser(t: Backend): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", { clerkId: "clerk_a" }),
  );
}

async function insertLogs(
  t: Backend,
  userId: Id<"users">,
  rows: Array<{ createdAt: number; aggregatePending?: true }>,
) {
  await t.run(async (ctx) => {
    for (const row of rows) {
      await ctx.db.insert("openRouterLogs", {
        userId,
        feature: "enrichment",
        endpoint: "chat",
        model: "m-a",
        totalTokens: 10,
        costUsd: 0.01,
        ...row,
      });
    }
  });
}

async function remainingCreatedAt(t: Backend) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("openRouterLogs").collect())
      .map((row) => row.createdAt)
      .sort((a, b) => a - b),
  );
}

describe("openRouterLogs.purgeExpired", () => {
  it("deletes nothing while OPENROUTER_LOG_RETENTION_DAYS is unset", async () => {
    vi.stubEnv("OPENROUTER_LOG_RETENTION_DAYS", undefined);
    const t = setup();
    const userId = await seedUser(t);
    await insertLogs(t, userId, [{ createdAt: 1 }, { createdAt: 2 }]);

    expect(await t.mutation(internal.openRouterLogs.purgeExpired, {})).toBe(0);
    expect(await remainingCreatedAt(t)).toEqual([1, 2]);
  });

  it("deletes nothing when the value is not a whole positive number", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await insertLogs(t, userId, [{ createdAt: 1 }]);

    for (const value of ["", "0", "-3", "1.5", "forever"]) {
      vi.stubEnv("OPENROUTER_LOG_RETENTION_DAYS", value);
      expect(await t.mutation(internal.openRouterLogs.purgeExpired, {})).toBe(
        0,
      );
    }
    expect(await remainingCreatedAt(t)).toEqual([1]);
  });

  it("deletes only drained rows older than the retention window", async () => {
    vi.stubEnv("OPENROUTER_LOG_RETENTION_DAYS", "30");
    const t = setup();
    const userId = await seedUser(t);
    const now = Date.now();
    const old = now - 31 * DAY_MS;
    const fresh = now - 29 * DAY_MS;
    await insertLogs(t, userId, [
      { createdAt: old },
      // not folded into the aggregates yet, so it must wait for the drain
      { createdAt: old + 1, aggregatePending: true },
      { createdAt: fresh },
    ]);

    expect(await t.mutation(internal.openRouterLogs.purgeExpired, {})).toBe(1);
    expect(await remainingCreatedAt(t)).toEqual([old + 1, fresh]);
  });

  it("keeps the Usage aggregates when it deletes drained rows", async () => {
    vi.stubEnv("OPENROUTER_LOG_RETENTION_DAYS", "1");
    const t = setup();
    const userId = await seedUser(t);
    await insertLogs(t, userId, [
      { createdAt: Date.now() - 2 * DAY_MS, aggregatePending: true },
    ]);
    await t.mutation(internal.openRouterLogs.drainAggregatesInternal, {});

    expect(await t.mutation(internal.openRouterLogs.purgeExpired, {})).toBe(1);
    expect(await remainingCreatedAt(t)).toEqual([]);
    const totals = await t.run(async (ctx) => {
      const namespace = userLogNamespace(userId);
      return {
        calls: await openRouterCost.count(ctx, { namespace }),
        cost: await openRouterCost.sum(ctx, { namespace }),
      };
    });
    expect(totals).toEqual({ calls: 1, cost: 0.01 });
  });

  it("deletes 500 rows a batch and reschedules itself while more remain", async () => {
    vi.stubEnv("OPENROUTER_LOG_RETENTION_DAYS", "7");
    vi.useFakeTimers();
    const t = setup();
    const userId = await seedUser(t);
    const old = Date.now() - 8 * DAY_MS;
    const fresh = Date.now() - DAY_MS;
    await insertLogs(t, userId, [
      ...Array.from({ length: 501 }, (_, i) => ({ createdAt: old + i })),
      { createdAt: fresh },
    ]);

    expect(await t.mutation(internal.openRouterLogs.purgeExpired, {})).toBe(
      500,
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await remainingCreatedAt(t)).toEqual([fresh]);
  });
});
