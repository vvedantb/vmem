import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  loadGraphEntities,
  loadGraphLinks,
  newestGraphMemories,
} from "./graphApi";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER_A = "clerk_user_a";
const USER_B = "clerk_user_b";
const MEMORY_COUNT = 40;
const ENTITY_COUNT = 30;

// `count` memories for USER_A, with what auto-extraction wrote removed so
// each test's fixture is the whole entity and link set
async function createMemories(t: ReturnType<typeof convexTest>, count: number) {
  for (let i = 0; i < count; i += 1) {
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      memoryId: `mem-${String(i)}`,
      userId: USER_A,
      title: `note ${String(i)}`,
      content: `note body ${String(i)}`,
      type: "knowledge",
      source: "api",
      tags: [],
      confidence: 0.9,
      contentHash: "test-hash",
      skipHashDedupe: true,
    });
  }
  await t.run(async (ctx) => {
    const extracted = [
      ...(await ctx.db.query("memoryLinks").collect()),
      ...(await ctx.db.query("memoryEntities").collect()),
      ...(await ctx.db.query("memoryEntityMentions").collect()),
    ];
    for (const row of extracted) await ctx.db.delete(row._id);
  });
  const memories = (
    await t.query(
      internal.memoryStore.functions.paginateScopedMemoriesInternal,
      { kind: "personal", userId: USER_A, cursor: null, numItems: 100 },
    )
  ).memories;
  expect(memories).toHaveLength(count);
  return memories;
}

describe("graph reads", () => {
  it("pages links, entities and mentions into the same graph as one full read", async () => {
    const t = convexTest(schema, modules);
    const memories = await createMemories(t, MEMORY_COUNT);

    await t.run(async (ctx) => {
      // names sort opposite to creation order, so index order differs
      const entityIds: Array<{
        id: Id<"memoryEntities">;
        normalizedName: string;
      }> = [];
      for (let e = 0; e < ENTITY_COUNT; e += 1) {
        const normalizedName = `ent-${String(ENTITY_COUNT - e).padStart(2, "0")}`;
        entityIds.push({
          id: await ctx.db.insert("memoryEntities", {
            userId: USER_A,
            name: normalizedName.toUpperCase(),
            normalizedName,
            type: "project",
            createdAt: e,
          }),
          normalizedName,
        });
      }
      // 1,200 in-view mentions plus noise: more than one 1,000-row page
      for (let m = 0; m < MEMORY_COUNT; m += 1) {
        for (const entity of entityIds) {
          await ctx.db.insert("memoryEntityMentions", {
            userId: USER_A,
            memoryId: `mem-${String(m)}`,
            entityId: entity.id,
            normalizedName: entity.normalizedName,
            createdAt: m,
          });
        }
      }
      const unseen = await ctx.db.insert("memoryEntities", {
        userId: USER_A,
        name: "Unseen",
        normalizedName: "unseen",
        type: "person",
        createdAt: 99,
      });
      await ctx.db.insert("memoryEntityMentions", {
        userId: USER_A,
        memoryId: "mem-outside",
        entityId: unseen,
        normalizedName: "unseen",
        createdAt: 99,
      });
      const other = await ctx.db.insert("memoryEntities", {
        userId: USER_B,
        name: "Other",
        normalizedName: "other",
        type: "person",
        createdAt: 0,
      });
      await ctx.db.insert("memoryEntityMentions", {
        userId: USER_B,
        memoryId: "mem-0",
        entityId: other,
        normalizedName: "other",
        createdAt: 0,
      });

      // 1,100 in-view links plus links that leave the view
      let links = 0;
      for (let s = 0; s < MEMORY_COUNT && links < 1_100; s += 1) {
        for (let d = 0; d < MEMORY_COUNT && links < 1_100; d += 1) {
          if (s === d) continue;
          await ctx.db.insert("memoryLinks", {
            userId: USER_A,
            sourceId: `mem-${String(s)}`,
            targetId: `mem-${String(d)}`,
            reason: `r${String(links)}`,
            createdAt: links,
          });
          links += 1;
        }
      }
      for (let i = 0; i < 50; i += 1) {
        await ctx.db.insert("memoryLinks", {
          userId: USER_A,
          sourceId: `mem-${String(i % MEMORY_COUNT)}`,
          targetId: "mem-outside",
          reason: "outside",
          createdAt: 2_000 + i,
        });
      }
    });

    // reference: the old single-query read (all entities, mentions by entity)
    const expected = await t.run(async (ctx) => {
      const inView = new Set(memories.map((memory) => memory.id));
      const entities = await ctx.db
        .query("memoryEntities")
        .withIndex("by_user", (q) => q.eq("userId", USER_A))
        .collect();
      const edges: Array<{ source: string; target: string }> = [];
      const nodes: string[] = [];
      for (const entity of entities) {
        const id = `entity ${entity.normalizedName}`;
        const rows = await ctx.db
          .query("memoryEntityMentions")
          .withIndex("by_entity", (q) => q.eq("entityId", entity._id))
          .collect();
        const hits = rows.filter((row) => inView.has(row.memoryId));
        for (const row of hits)
          edges.push({ source: row.memoryId, target: id });
        if (hits.length > 0) nodes.push(id);
      }
      const links = (
        await ctx.db
          .query("memoryLinks")
          .withIndex("by_user", (q) => q.eq("userId", USER_A))
          .collect()
      )
        .filter((row) => inView.has(row.sourceId) && inView.has(row.targetId))
        .map((row) => ({
          source: row.sourceId,
          target: row.targetId,
          reason: row.reason,
        }));
      return { nodes, edges, links };
    });
    expect(expected.edges).toHaveLength(MEMORY_COUNT * ENTITY_COUNT);
    expect(expected.links).toHaveLength(1_100);

    const ctx = { runQuery: t.query };
    const [entities, links] = await Promise.all([
      loadGraphEntities(ctx, memories),
      loadGraphLinks(ctx, memories),
    ]);
    expect(entities.entityNodes.map((node) => node.id)).toEqual(expected.nodes);
    expect(entities.entityNodes[0]).toMatchObject({
      title: "ENT-30",
      kind: "entity",
      entityType: "project",
    });
    expect(entities.mentionsEdges).toEqual(expected.edges);
    expect(links).toEqual(expected.links);
    // a node budget the graph fits in changes nothing
    expect(await loadGraphEntities(ctx, memories, ENTITY_COUNT)).toEqual(
      entities,
    );
  });

  it("keeps the newest memories when they alone pass the node budget", async () => {
    const t = convexTest(schema, modules);
    const days = ["2026-01-03", "2026-01-01", "2026-01-04", "2026-01-02"];
    const memories = (await createMemories(t, days.length)).map(
      (memory, i) => ({ ...memory, createdAt: `${days[i] ?? ""}T00:00:00Z` }),
    );
    expect(newestGraphMemories(memories, 4)).toEqual(memories);
    expect(newestGraphMemories(memories, 2)).toEqual([
      memories[0],
      memories[2],
    ]);
    expect(newestGraphMemories(memories, 0)).toEqual([]);
  });

  it("keeps the most-mentioned entities when they pass the node budget", async () => {
    const t = convexTest(schema, modules);
    const memories = await createMemories(t, 3);
    // in-view mention counts by entity, in creation order
    const counts = [1, 3, 2, 3, 1];
    await t.run(async (ctx) => {
      for (const [e, count] of counts.entries()) {
        const normalizedName = `ent-${String(e)}`;
        const entityId = await ctx.db.insert("memoryEntities", {
          userId: USER_A,
          name: normalizedName,
          normalizedName,
          type: "project",
          createdAt: e,
        });
        for (let m = 0; m < count; m += 1) {
          await ctx.db.insert("memoryEntityMentions", {
            userId: USER_A,
            memoryId: `mem-${String(m)}`,
            entityId,
            normalizedName,
            createdAt: m,
          });
        }
        // out-of-view mentions do not count
        await ctx.db.insert("memoryEntityMentions", {
          userId: USER_A,
          memoryId: "mem-outside",
          entityId,
          normalizedName,
          createdAt: 9,
        });
      }
    });
    const ctx = { runQuery: t.query };

    const full = await loadGraphEntities(ctx, memories);
    expect(full.entityNodes.map((node) => node.id)).toEqual([
      "entity ent-0",
      "entity ent-1",
      "entity ent-2",
      "entity ent-3",
      "entity ent-4",
    ]);
    expect(full.mentionsEdges).toHaveLength(10);
    expect(await loadGraphEntities(ctx, memories, 5)).toEqual(full);

    // ties on count keep creation order; output keeps creation order
    const two = await loadGraphEntities(ctx, memories, 2);
    expect(two.entityNodes.map((node) => node.id)).toEqual([
      "entity ent-1",
      "entity ent-3",
    ]);
    expect(two.mentionsEdges).toEqual(
      full.mentionsEdges.filter(
        (edge) =>
          edge.target === "entity ent-1" || edge.target === "entity ent-3",
      ),
    );

    const three = await loadGraphEntities(ctx, memories, 3);
    expect(three.entityNodes.map((node) => node.id)).toEqual([
      "entity ent-1",
      "entity ent-2",
      "entity ent-3",
    ]);
    expect(three.mentionsEdges).toHaveLength(8);

    const none = await loadGraphEntities(ctx, memories, 0);
    expect(none).toEqual({ entityNodes: [], mentionsEdges: [] });
  });
});
