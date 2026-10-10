/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { listMemoriesBounded } from "./memoryStore/helpers";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_user_a";
const OTHER = "clerk_user_b";
const BASE = Date.parse("2026-10-05T12:00:00.000Z");

type Harness = ReturnType<typeof convexTest>;

async function seed(t: Harness, count: number) {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i += 1) {
      await ctx.db.insert("memories", {
        memoryId: `m${String(i)}`,
        userId: i % 10 === 9 ? OTHER : USER,
        profileId: "p1",
        title: `Title ${String(i)}`,
        content: i % 3 === 0 ? "alpha body" : "beta body",
        type: "knowledge",
        source: "api",
        confidence: 0.9,
        status: "active",
        tags: i % 3 === 0 ? ["alpha"] : [],
        createdAt: BASE + i * 1000,
        updatedAt: BASE + i * 1000,
        contentHash: "h",
        visitCount: 1,
        firstVisitAt: BASE,
        lastVisitAt: BASE,
      });
    }
  });
}

function list(
  t: Harness,
  params: { limit: number; offset: number; tags?: string[] },
) {
  return t.run((ctx) =>
    listMemoriesBounded(
      ctx,
      { kind: "personal", userId: USER, profileId: "p1" },
      params,
    ),
  );
}

describe("listMemoriesBounded", () => {
  it("returns the newest page first with an exact total when exhausted", async () => {
    const t = convexTest(schema, modules);
    await seed(t, 20);
    const res = await list(t, { limit: 100, offset: 0 });
    // 20 rows, 2 belong to the other user
    expect(res.total).toBe(18);
    expect(res.memories).toHaveLength(18);
    expect(res.memories[0]?.id).toBe("m18");
    expect(res.memories.every((m) => m.userId === USER)).toBe(true);
  });

  it("pages with offset and reports one extra row as a lower-bound total", async () => {
    const t = convexTest(schema, modules);
    await seed(t, 60);
    const first = await list(t, { limit: 10, offset: 0 });
    expect(first.memories).toHaveLength(10);
    expect(first.total).toBe(11);
    const second = await list(t, { limit: 10, offset: 10 });
    expect(second.memories).toHaveLength(10);
    expect(second.total).toBe(21);
    const ids = new Set(
      [...first.memories, ...second.memories].map((m) => m.id),
    );
    expect(ids.size).toBe(20);
    const last = await list(t, { limit: 10, offset: 50 });
    expect(last.memories).toHaveLength(4);
    expect(last.total).toBe(54);
  });

  it("applies filters while scanning and stops early", async () => {
    const t = convexTest(schema, modules);
    await seed(t, 60);
    const res = await list(t, { limit: 5, offset: 0, tags: ["alpha"] });
    expect(res.memories).toHaveLength(5);
    expect(res.memories.every((m) => m.tags.includes("alpha"))).toBe(true);
    expect(res.total).toBe(6);
  });

  it("matches the exact result of a full walk for a mid page", async () => {
    const t = convexTest(schema, modules);
    await seed(t, 45);
    const page = await list(t, { limit: 7, offset: 12 });
    const all = await list(t, { limit: 1000, offset: 0 });
    expect(page.memories.map((m) => m.id)).toEqual(
      all.memories.slice(12, 19).map((m) => m.id),
    );
  });
});
