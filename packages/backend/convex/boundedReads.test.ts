/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_user_a";
const OTHER_USER = "clerk_user_b";
const PROFILE = "profile_personal_a";

type Harness = ReturnType<typeof convexTest>;

async function seedMemory(
  t: Harness,
  memoryId: string,
  overrides: { userId?: string; title?: string; content?: string } = {},
) {
  const title = overrides.title ?? `Title ${memoryId}`;
  await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
    memoryId,
    userId: overrides.userId ?? USER,
    profileId: PROFILE,
    title,
    content: overrides.content ?? title,
    type: "knowledge",
    source: "api",
    tags: [],
    confidence: 0.9,
  });
}

async function seedLinks(t: Harness, pairs: Array<[string, string]>) {
  await t.run(async (ctx) => {
    for (const [sourceId, targetId] of pairs) {
      await ctx.db.insert("memoryLinks", {
        userId: USER,
        sourceId,
        targetId,
        reason: `${sourceId}-${targetId}`,
        createdAt: 1,
      });
    }
  });
}

describe("bounded link expansion", () => {
  it("returns only edges reachable from the seeds within the hop budget", async () => {
    const t = convexTest(schema, modules);
    await seedLinks(t, [
      ["a", "b"],
      ["b", "c"],
      ["c", "d"],
      ["x", "y"],
    ]);
    const oneHop = await t.query(
      internal.memoryStore.functions.listMemoryLinksAroundInternal,
      { userId: USER, seedIds: ["a"], hops: 1 },
    );
    expect(oneHop.map((edge) => `${edge.sourceId}-${edge.targetId}`)).toEqual([
      "a-b",
    ]);
    const twoHops = await t.query(
      internal.memoryStore.functions.listMemoryLinksAroundInternal,
      { userId: USER, seedIds: ["a"], hops: 2 },
    );
    expect(
      twoHops.map((edge) => `${edge.sourceId}-${edge.targetId}`).sort(),
    ).toEqual(["a-b", "b-c"]);
  });

  it("follows edges stored in either direction and ignores other users", async () => {
    const t = convexTest(schema, modules);
    await seedLinks(t, [["a", "z"]]);
    await t.run(async (ctx) => {
      await ctx.db.insert("memoryLinks", {
        userId: OTHER_USER,
        sourceId: "a",
        targetId: "secret",
        reason: "other user",
        createdAt: 1,
      });
    });
    const edges = await t.query(
      internal.memoryStore.functions.listMemoryLinksAroundInternal,
      { userId: USER, seedIds: ["z"], hops: 1 },
    );
    expect(edges).toEqual([{ sourceId: "a", targetId: "z", reason: "a-z" }]);
  });

  it("caps per-node fan-out and total edges", async () => {
    const t = convexTest(schema, modules);
    const hub: Array<[string, string]> = [];
    for (let i = 0; i < 60; i += 1) hub.push(["hub", `leaf-${String(i)}`]);
    await seedLinks(t, hub);
    const perNode = await t.query(
      internal.memoryStore.functions.listMemoryLinksAroundInternal,
      { userId: USER, seedIds: ["hub"], hops: 1, perNode: 5 },
    );
    expect(perNode).toHaveLength(5);
    const maxEdges = await t.query(
      internal.memoryStore.functions.listMemoryLinksAroundInternal,
      { userId: USER, seedIds: ["hub"], hops: 2, perNode: 50, maxEdges: 7 },
    );
    expect(maxEdges).toHaveLength(7);
  });

  it("returns nothing for no seeds or zero hops", async () => {
    const t = convexTest(schema, modules);
    await seedLinks(t, [["a", "b"]]);
    expect(
      await t.query(
        internal.memoryStore.functions.listMemoryLinksAroundInternal,
        { userId: USER, seedIds: [], hops: 2 },
      ),
    ).toEqual([]);
    expect(
      await t.query(
        internal.memoryStore.functions.listMemoryLinksAroundInternal,
        { userId: USER, seedIds: ["a"], hops: 0 },
      ),
    ).toEqual([]);
  });
});

describe("dream pass with planned clusters", () => {
  it("builds proposals from the planned clusters without re-clustering the scope", async () => {
    const t = convexTest(schema, modules);
    await seedMemory(t, "dup_a", { title: "Use pnpm", content: "Use pnpm" });
    await seedMemory(t, "dup_b", { title: "Use pnpm", content: "Use pnpm" });
    await seedMemory(t, "dup_c", { title: "Use pnpm", content: "Use pnpm" });
    const pass = await t.mutation(internal.dreamMode.runDreamPassInternal, {
      clerkId: USER,
      profileId: PROFILE,
      kind: "personal",
      autoAccept: false,
      clusters: [{ memoryIds: ["dup_a", "dup_b"], score: 1 }],
    });
    expect(pass.reason).toBe("ok");
    expect(pass.clustersScanned).toBe(1);
    expect(pass.proposalsCreated).toBe(1);
    const pending = await t.query(
      internal.proposedUpdateApi.listPendingInternal,
      { userId: USER, profileId: PROFILE },
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]?.sourceMemoryIds?.slice().sort()).toEqual([
      "dup_a",
      "dup_b",
    ]);
  });

  it("drops planned clusters whose members vanished, left scope, or were suppressed", async () => {
    const t = convexTest(schema, modules);
    await seedMemory(t, "keep_a", { title: "Same", content: "Same" });
    await seedMemory(t, "keep_b", { title: "Same", content: "Same" });
    await seedMemory(t, "gone_b", { title: "Gone", content: "Gone" });
    await seedMemory(t, "foreign", {
      userId: OTHER_USER,
      title: "Same",
      content: "Same",
    });
    await seedMemory(t, "old_b", { title: "Old", content: "Old" });
    await t.mutation(internal.memoryStore.functions.deleteMemoryInternal, {
      userId: USER,
      memoryId: "gone_b",
    });
    await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
      userId: USER,
      memoryId: "old_b",
      status: "suppressed",
    });
    const pass = await t.mutation(internal.dreamMode.runDreamPassInternal, {
      clerkId: USER,
      profileId: PROFILE,
      kind: "personal",
      autoAccept: false,
      clusters: [
        { memoryIds: ["keep_a", "gone_b"], score: 1 },
        { memoryIds: ["keep_a", "foreign"], score: 1 },
        { memoryIds: ["keep_a", "old_b"], score: 1 },
        { memoryIds: ["keep_a"], score: 1 },
        { memoryIds: ["keep_a", "keep_b"], score: 1 },
      ],
    });
    expect(pass.proposalsCreated).toBe(1);
  });
});
