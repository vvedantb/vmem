/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { paginateMemorySummaries } from "./memoryStore/helpers";
import { MEMORY_PREVIEW_CHARS } from "./memoryStore/mappers";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_user_a";
const OTHER = "clerk_user_b";
const BASE = Date.parse("2026-10-05T12:00:00.000Z");
const SCOPE = {
  kind: "personal",
  userId: USER,
  profileId: "p1",
} as const;

type Harness = ReturnType<typeof convexTest>;

async function seed(t: Harness, count: number) {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i += 1) {
      await ctx.db.insert("memories", {
        memoryId: `m${String(i)}`,
        userId: i % 10 === 9 ? OTHER : USER,
        profileId: "p1",
        title: `Title ${String(i)}`,
        content:
          i === 0 ? `${"long ".repeat(200)}needle` : "short   body\nhere",
        type: i % 2 === 0 ? "knowledge" : "episodic",
        source: "api",
        confidence: 0.9,
        status: i === 5 ? "suppressed" : "active",
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

async function walk(
  t: Harness,
  numItems: number,
  filter: { tags?: string[]; type?: string; searchQuery?: string } = {},
) {
  const rows = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 100; guard += 1) {
    const page = await t.run((ctx) =>
      paginateMemorySummaries(ctx, SCOPE, { numItems, cursor }, filter),
    );
    rows.push(...page.page);
    if (page.isDone) return rows;
    cursor = page.continueCursor;
  }
  throw new Error("pagination did not finish");
}

describe("paginateMemorySummaries", () => {
  it("pages newest-first without content and covers each row exactly once", async () => {
    const t = convexTest(schema, modules);
    await seed(t, 40);
    const rows = await walk(t, 7);
    // 40 rows - 4 other-user - 1 suppressed
    expect(rows).toHaveLength(35);
    expect(new Set(rows.map((r) => r.id)).size).toBe(35);
    expect(rows[0]?.id).toBe("m38");
    expect(rows.every((r) => !("content" in r))).toBe(true);
    expect(rows.some((r) => r.id === "m5")).toBe(false);
  });

  it("collapses whitespace and caps the preview", async () => {
    const t = convexTest(schema, modules);
    await seed(t, 3);
    const rows = await walk(t, 10);
    const long = rows.find((r) => r.id === "m0");
    expect(long?.preview.length).toBeLessThanOrEqual(MEMORY_PREVIEW_CHARS);
    expect(long?.preview).not.toContain("needle");
    expect(rows.find((r) => r.id === "m1")?.preview).toBe("short body here");
  });

  it("filters by tag, type and search text across pages", async () => {
    const t = convexTest(schema, modules);
    await seed(t, 40);
    const tagged = await walk(t, 6, { tags: ["alpha"] });
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged.every((r) => r.tags.includes("alpha"))).toBe(true);
    const episodic = await walk(t, 6, { type: "episodic" });
    expect(episodic.every((r) => r.type === "episodic")).toBe(true);
    // search matches full content, not only the preview
    const hit = await walk(t, 6, { searchQuery: "needle" });
    expect(hit.map((r) => r.id)).toEqual(["m0"]);
  });
});

describe("paginateScopedMemorySummariesInternal", () => {
  it("returns the same slim rows through the internal query", async () => {
    const t = convexTest(schema, modules);
    await seed(t, 12);
    const page = await t.query(
      internal.memoryStore.functions.paginateScopedMemorySummariesInternal,
      {
        kind: "personal",
        userId: USER,
        profileId: "p1",
        cursor: null,
        numItems: 50,
        type: "knowledge",
      },
    );
    expect(page.isDone).toBe(true);
    expect(page.rows.every((r) => r.type === "knowledge")).toBe(true);
    expect(page.rows.every((r) => !("content" in r))).toBe(true);
  });
});
