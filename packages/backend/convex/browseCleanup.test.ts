/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_browse_cleanup_user";
const PROFILE = "profile_browse_cleanup";
const POST = "https://www.instagram.com/p/DeteNVUiIVE/";

type Harness = ReturnType<typeof convexTest>;

// rows as old extension builds stored them: no sourceId, raw content
async function seedOld(t: Harness, title: string, url: string) {
  vi.advanceTimersByTime(1000);
  return t.mutation(internal.memoryStore.functions.createMemoryInternal, {
    userId: USER,
    profileId: PROFILE,
    title,
    content: `${title}\n${url}\nVisited 1 times`,
    type: "episodic",
    source: "browsing-history",
    sourceType: "browsing-history",
    tags: [],
    confidence: 0.6,
    url,
  });
}

async function seed(t: Harness) {
  for (const index of [1, 2, 3]) {
    await seedOld(t, "Instagram", `${POST}?img_index=${index}`);
  }
  await seedOld(
    t,
    "red fish - Google Search",
    "https://google.com/search?q=red+fish&ei=1",
  );
  await seedOld(
    t,
    "red fish - Google Search",
    "https://google.com/search?q=red+fish&ei=2",
  );
  await seedOld(t, "Unique page", "https://example.com/unique");
  await seedOld(t, "Home / X", "https://x.com/home");
  // a non-browse row with the same text is read but never touched
  await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
    userId: USER,
    profileId: PROFILE,
    title: "Instagram",
    content: `Instagram\n${POST}`,
    type: "knowledge",
    source: "mcp",
    tags: [],
    confidence: 1,
    url: POST,
  });
}

async function rows(t: Harness) {
  return t.run((ctx) => ctx.db.query("memories").collect());
}

type CallResult = {
  groups: number;
  deleted: number;
  isDone: boolean;
  continueCursor: string | null;
};

// calls until isDone; returns the summed counts and the number of calls
async function runAll(t: Harness, numItems?: number) {
  let cursor: string | null = null;
  const total = { groups: 0, deleted: 0, calls: 0 };
  for (let call = 0; call < 50; call += 1) {
    const page: CallResult = await t.mutation(
      internal.browseCleanup.mergeBrowseDuplicates,
      { userId: USER, dryRun: false, cursor, numItems },
    );
    total.groups += page.groups;
    total.deleted += page.deleted;
    total.calls += 1;
    if (page.isDone) return total;
    cursor = page.continueCursor;
  }
  throw new Error("cleanup did not finish");
}

describe("browseCleanup.mergeBrowseDuplicates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dry run reports counts and changes nothing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const before = await rows(t);
    const result = await t.mutation(
      internal.browseCleanup.mergeBrowseDuplicates,
      { userId: USER, deleteLowValue: true },
    );
    expect(result).toMatchObject({
      scanned: 8,
      groups: 2,
      deleted: 3,
      lowValueCandidates: 1,
      lowValueDeleted: 1,
      isDone: true,
    });
    expect(await rows(t)).toEqual(before);
  });

  it("merges dupes into the newest row and is safe to rerun", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const newestInstagram = (await rows(t)).find(
      (row) => row.url === `${POST}?img_index=3`,
    );
    const result = await t.mutation(
      internal.browseCleanup.mergeBrowseDuplicates,
      { userId: USER, dryRun: false },
    );
    expect(result).toMatchObject({
      scanned: 8,
      groups: 2,
      deleted: 3,
      lowValueCandidates: 1,
      lowValueDeleted: 0,
    });

    const stored = await rows(t);
    // low-value row stays without deleteLowValue
    expect(stored).toHaveLength(5);
    const instagram = stored.find(
      (row) => row.title === "Instagram" && row.source === "browsing-history",
    );
    expect(instagram).toMatchObject({
      _id: newestInstagram?._id,
      visitCount: 3,
      sourceId: "url|https://instagram.com/p/DeteNVUiIVE",
      content: "Instagram\nhttps://instagram.com/p/DeteNVUiIVE",
    });
    expect(instagram?.firstVisitAt).toBeLessThan(instagram?.lastVisitAt ?? 0);
    const search = stored.find((row) => row.title.startsWith("red fish"));
    expect(search).toMatchObject({
      visitCount: 2,
      sourceId: "google.com|red fish - google search",
      content: "red fish - Google Search\ngoogle.com",
    });

    const rerun = await t.mutation(
      internal.browseCleanup.mergeBrowseDuplicates,
      { userId: USER, dryRun: false, deleteLowValue: true },
    );
    expect(rerun).toMatchObject({ groups: 0, deleted: 0, lowValueDeleted: 1 });
    expect(await rows(t)).toHaveLength(4);
  });

  it("patches the keeper directly without entity extraction", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    // start from no entity data, so any row the cleanup makes shows up
    await t.run(async (ctx) => {
      const rows = [
        ...(await ctx.db.query("memoryEntities").collect()),
        ...(await ctx.db.query("memoryEntityMentions").collect()),
        ...(await ctx.db.query("memoryLinks").collect()),
      ];
      for (const row of rows) await ctx.db.delete(row._id);
    });
    const scheduledBefore = await t.run(
      async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).length,
    );

    await t.mutation(internal.browseCleanup.mergeBrowseDuplicates, {
      userId: USER,
      dryRun: false,
    });

    const unique = (await rows(t)).find((row) => row.title === "Unique page");
    expect(unique).toMatchObject({
      visitCount: 1,
      sourceId: "example.com|unique page",
      content: "Unique page\nexample.com",
    });
    const instagram = (await rows(t)).find(
      (row) => row.title === "Instagram" && row.source === "browsing-history",
    );
    expect(instagram?.searchableText).toContain("instagram.com/p/DeteNVUiIVE");
    expect(instagram?.searchableText).not.toContain("Visited");
    await t.run(async (ctx) => {
      expect(await ctx.db.query("memoryEntities").collect()).toEqual([]);
      expect(await ctx.db.query("memoryEntityMentions").collect()).toEqual([]);
      expect(await ctx.db.query("memoryLinks").collect()).toEqual([]);
      expect(
        (await ctx.db.system.query("_scheduled_functions").collect()).length,
      ).toBe(scheduledBefore);
    });
  });

  it("finishes a large set over several budgeted calls", async () => {
    const t = convexTest(schema, modules);
    for (let index = 0; index < 35; index += 1) {
      await seedOld(t, "Instagram", `${POST}?img_index=${index}`);
      await seedOld(t, "Unique page", `https://example.com/unique?v=${index}`);
    }
    const total = await runAll(t);
    expect(total.calls).toBeGreaterThan(1);
    expect(total.deleted).toBe(68);
    const stored = await rows(t);
    expect(stored).toHaveLength(2);
    expect(stored.map((row) => row.visitCount)).toEqual([35, 35]);

    const rerun = await runAll(t);
    expect(rerun).toMatchObject({ groups: 0, deleted: 0, calls: 1 });
  });

  it("merges dupes split across pages through the keyed keeper", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const { deleted } = await runAll(t, 2);
    expect(deleted).toBe(3);
    const instagram = (await rows(t)).filter(
      (row) => row.title === "Instagram" && row.source === "browsing-history",
    );
    expect(instagram).toHaveLength(1);
    expect(instagram[0]?.visitCount).toBe(3);
  });
});
