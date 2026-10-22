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
      groups: 3,
      merged: 2,
      deleted: 3,
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
      merged: 2,
      deleted: 3,
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
    expect(rerun).toMatchObject({ merged: 0, deleted: 0, lowValueDeleted: 1 });
    expect(await rows(t)).toHaveLength(4);
  });

  it("merges dupes split across pages through the keyed keeper", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    let cursor: string | null = null;
    let deleted = 0;
    for (let call = 0; call < 20; call += 1) {
      const page: { deleted: number; isDone: boolean; continueCursor: string } =
        await t.mutation(internal.browseCleanup.mergeBrowseDuplicates, {
          userId: USER,
          dryRun: false,
          cursor,
          numItems: 2,
        });
      deleted += page.deleted;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(deleted).toBe(3);
    const instagram = (await rows(t)).filter(
      (row) => row.title === "Instagram" && row.source === "browsing-history",
    );
    expect(instagram).toHaveLength(1);
    expect(instagram[0]?.visitCount).toBe(3);
  });
});
