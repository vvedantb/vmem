/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_user_a";
const OTHER_USER = "clerk_user_b";

type Harness = ReturnType<typeof convexTest>;

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
