/// <reference types="vite/client" />
import aggregateTest from "@convex-dev/aggregate/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  openRouterCost,
  openRouterModels,
  openRouterTokens,
  userLogNamespace,
} from "./openRouterAggregates";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_user_a";
const PROFILE = "profile_personal_a";

function setup() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "openRouterLogCost");
  aggregateTest.register(t, "openRouterLogTokens");
  aggregateTest.register(t, "openRouterModels");
  return t;
}

async function seedUser(t: ReturnType<typeof setup>): Promise<Id<"users">> {
  return await t.run(async (ctx) => ctx.db.insert("users", { clerkId: USER }));
}

function logArgs(userId: Id<"users">, model: string, tokens: number) {
  return {
    userId,
    feature: "enrichment" as const,
    endpoint: "chat" as const,
    model,
    totalTokens: tokens,
    costUsd: tokens / 1000,
  };
}

async function aggregateTotals(
  t: ReturnType<typeof setup>,
  userId: Id<"users">,
) {
  return await t.run(async (ctx) => {
    const namespace = userLogNamespace(userId);
    const models: string[] = [];
    for await (const item of openRouterModels.iter(ctx, { namespace })) {
      models.push(item.key);
    }
    return {
      calls: await openRouterCost.count(ctx, { namespace }),
      tokens: await openRouterTokens.sum(ctx, { namespace }),
      models: models.sort(),
    };
  });
}

describe("openRouter log aggregates drain", () => {
  it("records log rows without touching the aggregates until drained", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await t.mutation(
      internal.openRouterLogs.recordInternal,
      logArgs(userId, "m-a", 100),
    );
    await t.mutation(
      internal.openRouterLogs.recordInternal,
      logArgs(userId, "m-b", 50),
    );

    expect(await aggregateTotals(t, userId)).toEqual({
      calls: 0,
      tokens: 0,
      models: [],
    });
    const rows = await t.run(async (ctx) =>
      ctx.db.query("openRouterLogs").collect(),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.aggregatePending === true)).toBe(true);

    const drained = await t.mutation(
      internal.openRouterLogs.drainAggregatesInternal,
      {},
    );
    expect(drained).toBe(2);
    expect(await aggregateTotals(t, userId)).toEqual({
      calls: 2,
      tokens: 150,
      models: ["m-a", "m-b"],
    });
    const after = await t.run(async (ctx) =>
      ctx.db.query("openRouterLogs").collect(),
    );
    expect(after.every((row) => row.aggregatePending === undefined)).toBe(true);
  });

  it("is idempotent and leaves legacy rows (no pending flag) alone", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("openRouterLogs", {
        ...logArgs(userId, "legacy", 10),
        createdAt: 1,
      });
    });
    await t.mutation(
      internal.openRouterLogs.recordInternal,
      logArgs(userId, "m-a", 100),
    );
    await t.mutation(internal.openRouterLogs.drainAggregatesInternal, {});
    const again = await t.mutation(
      internal.openRouterLogs.drainAggregatesInternal,
      {},
    );
    expect(again).toBe(0);
    expect(await aggregateTotals(t, userId)).toEqual({
      calls: 1,
      tokens: 100,
      models: ["m-a"],
    });
  });

  it("works through a backlog larger than one batch by rescheduling itself", async () => {
    const t = setup();
    const userId = await seedUser(t);
    for (let i = 0; i < 60; i += 1) {
      await t.mutation(
        internal.openRouterLogs.recordInternal,
        logArgs(userId, `m-${String(i % 3)}`, 10),
      );
    }
    vi.useFakeTimers();
    try {
      await t.mutation(internal.openRouterLogs.drainAggregatesInternal, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    expect(await aggregateTotals(t, userId)).toEqual({
      calls: 60,
      tokens: 600,
      models: ["m-0", "m-1", "m-2"],
    });
  });
});

describe("LLM entity extraction snapshot", () => {
  async function seed(t: ReturnType<typeof setup>) {
    for (const [memoryId, title] of [
      ["target", "pnpm workspace layout"],
      ["neighbour", "zebra habitat notes"],
    ] as const) {
      await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
        memoryId,
        userId: USER,
        profileId: PROFILE,
        title,
        content: title,
        type: "knowledge",
        source: "api",
        tags: [],
        confidence: 0.9,
      });
    }
  }

  async function extractLinks(t: ReturnType<typeof setup>) {
    return await t.run(async (ctx) =>
      (await ctx.db.query("memoryLinks").collect()).filter(
        (row) => row.origin === "extract",
      ),
    );
  }

  it("links LLM-related ids that appear in the supplied candidate snapshot", async () => {
    const t = setup();
    await seed(t);
    await t.mutation(
      internal.memoryStore.functions.applyLlmEntityExtractionInternal,
      {
        userId: USER,
        memoryId: "target",
        entities: [],
        relatedMemoryIds: ["neighbour"],
        candidates: [
          { id: "neighbour", title: "zebra habitat notes", tags: [] },
        ],
        knownEntities: [],
      },
    );
    const links = await extractLinks(t);
    expect(links).toHaveLength(1);
  });

  it("uses the snapshot instead of re-reading recent memories", async () => {
    const t = setup();
    await seed(t);
    await t.mutation(
      internal.memoryStore.functions.applyLlmEntityExtractionInternal,
      {
        userId: USER,
        memoryId: "target",
        entities: [],
        relatedMemoryIds: ["neighbour"],
        candidates: [],
        knownEntities: [],
      },
    );
    expect(await extractLinks(t)).toHaveLength(0);
  });

  it("still reads recent memories itself when no snapshot is passed", async () => {
    const t = setup();
    await seed(t);
    await t.mutation(
      internal.memoryStore.functions.applyLlmEntityExtractionInternal,
      {
        userId: USER,
        memoryId: "target",
        entities: [],
        relatedMemoryIds: ["neighbour"],
      },
    );
    expect(await extractLinks(t)).toHaveLength(1);
  });
});
