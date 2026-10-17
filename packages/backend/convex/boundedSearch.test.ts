/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { listMemoriesForClerk } from "./memoryRuntime";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_user_a";
const PROFILE = "p1";
const BASE = Date.parse("2026-10-05T12:00:00.000Z");
const COUNT = 120;

type Harness = ReturnType<typeof convexTest>;

async function seed(t: Harness) {
  await t.run(async (ctx) => {
    for (let i = 0; i < COUNT; i += 1) {
      const title = `Title ${String(i)}`;
      const content = "alpha body";
      await ctx.db.insert("memories", {
        memoryId: `m${String(i)}`,
        userId: USER,
        profileId: PROFILE,
        title,
        content,
        searchableText: `${title}\n${content}`,
        type: "knowledge",
        source: "api",
        confidence: 0.9,
        status: "active",
        tags: [],
        createdAt: BASE + i * 1000,
        updatedAt: BASE + i * 1000,
        contentHash: `h${String(i)}`,
        visitCount: 1,
        firstVisitAt: BASE,
        lastVisitAt: BASE,
      });
    }
  });
}

// Records the name of every query the runtime helper sends to the backend.
function recordingCtx(t: Harness) {
  const queries: string[] = [];
  const ctx: Pick<ActionCtx, "runQuery" | "runMutation"> = {
    runQuery: async (ref, ...args) => {
      queries.push(getFunctionName(ref));
      return await t.query(ref, ...args);
    },
    runMutation: async (ref, ...args) => await t.mutation(ref, ...args),
  };
  return { ctx, queries };
}

describe("bounded memory search and list", () => {
  it("text search runs one index query and never pages the profile", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const { ctx, queries } = recordingCtx(t);

    const result = await listMemoriesForClerk(ctx, {
      clerkId: USER,
      profileId: PROFILE,
      searchQuery: "alpha",
      limit: 5,
      offset: 0,
    });

    expect(result.memories).toHaveLength(5);
    expect(queries).toEqual(["memoryStore/functions:listMemoriesInternal"]);
    expect(
      queries.filter((name) => name.includes("paginateScoped")),
    ).toHaveLength(0);
  });

  it("empty query stops after offset + limit + 1 matches", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const { ctx, queries } = recordingCtx(t);

    const result = await listMemoriesForClerk(ctx, {
      clerkId: USER,
      profileId: PROFILE,
      limit: 5,
      offset: 10,
    });

    expect(result.memories.map((m) => m.id)).toEqual([
      `m${String(COUNT - 11)}`,
      `m${String(COUNT - 12)}`,
      `m${String(COUNT - 13)}`,
      `m${String(COUNT - 14)}`,
      `m${String(COUNT - 15)}`,
    ]);
    // lower bound: one match past the page proves another page exists
    expect(result.total).toBe(16);
    expect(queries).toHaveLength(1);
  });

  it("total is exact when fewer matches than the page budget exist", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const { ctx } = recordingCtx(t);

    const result = await listMemoriesForClerk(ctx, {
      clerkId: USER,
      profileId: PROFILE,
      searchQuery: "nomatch",
      limit: 5,
      offset: 0,
    });

    expect(result).toEqual({ memories: [], total: 0 });
  });
});

describe("usefulness hits", () => {
  async function seedWithUsage(t: Harness) {
    const created = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      {
        userId: USER,
        profileId: PROFILE,
        title: "Prefers pnpm",
        content: "alpha pnpm notes",
        type: "knowledge",
        source: "api",
        tags: [],
        confidence: 0.9,
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("memoryUsage", {
        memoryId: created.id,
        retrieveHits: 3,
        searchHits: 4,
        contextPackHits: 5,
        lastAccessedAt: BASE,
      });
    });
    return created;
  }

  it("single get reads hits from memoryUsage", async () => {
    const t = convexTest(schema, modules);
    const created = await seedWithUsage(t);

    const fetched = await t.query(
      internal.memoryStore.functions.getMemoryInternal,
      { userId: USER, memoryId: created.id },
    );

    expect(fetched?.usefulness?.retrieveHits).toBe(3);
    expect(fetched?.usefulness?.searchHits).toBe(4);
    expect(fetched?.usefulness?.contextPackHits).toBe(5);
  });

  it("single get falls back to legacy row counters", async () => {
    const t = convexTest(schema, modules);
    const created = await seedWithUsage(t);
    await t.run(async (ctx) => {
      const usage = await ctx.db.query("memoryUsage").first();
      if (usage) await ctx.db.delete(usage._id);
      const row = await ctx.db.query("memories").first();
      if (row) await ctx.db.patch(row._id, { usefulnessSearchHits: 7 });
    });

    const fetched = await t.query(
      internal.memoryStore.functions.getMemoryInternal,
      { userId: USER, memoryId: created.id },
    );

    expect(fetched?.usefulness?.searchHits).toBe(7);
  });

  it("list and search rows omit hit counts", async () => {
    const t = convexTest(schema, modules);
    await seedWithUsage(t);
    const { ctx } = recordingCtx(t);

    const listed = await listMemoriesForClerk(ctx, {
      clerkId: USER,
      profileId: PROFILE,
      limit: 10,
      offset: 0,
    });
    const searched = await listMemoriesForClerk(ctx, {
      clerkId: USER,
      profileId: PROFILE,
      searchQuery: "alpha",
      limit: 10,
      offset: 0,
    });

    for (const row of [...listed.memories, ...searched.memories]) {
      expect(row.usefulness?.retrieveHits).toBeUndefined();
      expect(row.usefulness?.searchHits).toBeUndefined();
      expect(row.usefulness?.contextPackHits).toBeUndefined();
    }
    expect(searched.memories).toHaveLength(1);
  });
});
