/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedWiki(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: "clerk_wiki_cleanup",
    });
    const now = Date.now();
    const folderId = await ctx.db.insert("wikiNodes", {
      userId,
      kind: "folder",
      title: "Folder",
      order: 0,
      createdAt: now,
      updatedAt: now,
    });
    const docId = await ctx.db.insert("wikiNodes", {
      userId,
      parentId: folderId,
      kind: "document",
      title: "Doc",
      content: "hello",
      contentText: "hello",
      order: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("wikiNodeVersions", {
      nodeId: docId,
      title: "Doc",
      content: "hello",
      contentText: "hello",
      authorUserId: userId,
      source: "web",
      createdAt: now,
    });
  });
}

async function counts(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const wikiNodes = await ctx.db.query("wikiNodes").collect();
    const wikiNodeVersions = await ctx.db.query("wikiNodeVersions").collect();
    return {
      wikiNodes: wikiNodes.length,
      wikiNodeVersions: wikiNodeVersions.length,
    };
  });
}

describe("internal.wikiCleanup:deleteAllWikiRows", () => {
  it("reports empty tables as done without writes", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.wikiCleanup.deleteAllWikiRows, {});
    expect(result).toEqual({
      dryRun: false,
      wikiNodesDeleted: 0,
      wikiNodeVersionsDeleted: 0,
      wikiNodesRemaining: 0,
      wikiNodeVersionsRemaining: 0,
      done: true,
    });
  });

  it("dry-run counts rows and leaves them", async () => {
    const t = convexTest(schema, modules);
    await seedWiki(t);

    const result = await t.mutation(internal.wikiCleanup.deleteAllWikiRows, {
      dryRun: true,
    });
    expect(result).toEqual({
      dryRun: true,
      wikiNodesDeleted: 0,
      wikiNodeVersionsDeleted: 0,
      wikiNodesRemaining: 2,
      wikiNodeVersionsRemaining: 1,
      done: false,
    });
    expect(await counts(t)).toEqual({ wikiNodes: 2, wikiNodeVersions: 1 });
  });

  it("deletes all rows and is a no-op on the next run", async () => {
    const t = convexTest(schema, modules);
    await seedWiki(t);

    const first = await t.mutation(internal.wikiCleanup.deleteAllWikiRows, {});
    expect(first).toEqual({
      dryRun: false,
      wikiNodesDeleted: 2,
      wikiNodeVersionsDeleted: 1,
      wikiNodesRemaining: 0,
      wikiNodeVersionsRemaining: 0,
      done: true,
    });
    expect(await counts(t)).toEqual({ wikiNodes: 0, wikiNodeVersions: 0 });

    const second = await t.mutation(internal.wikiCleanup.deleteAllWikiRows, {});
    expect(second.done).toBe(true);
    expect(second.wikiNodesDeleted).toBe(0);
    expect(second.wikiNodeVersionsDeleted).toBe(0);
  });
});
