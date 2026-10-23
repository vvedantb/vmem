/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeGraphSnapshot,
  encodeGraphSnapshot,
  type GraphSnapshotGraph,
} from "@vmem/shared";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  buildRetryAfterMs,
  GRAPH_SNAPSHOT_REFRESH_INTERVAL_MS,
  GRAPH_TOMBSTONE_RETENTION_MS,
} from "./graphSnapshots";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const CLERK_ID = "clerk_snapshot_user";
const MEMORY_COUNT = 40;
const ENTITY_COUNT = 30;
const LINK_COUNT = 1_100;

function testConvex() {
  const t = convexTest(schema, modules);
  registerAuditLog(t);
  return t;
}

type TestConvex = ReturnType<typeof testConvex>;

async function seedUser(
  t: TestConvex,
): Promise<{ userId: Id<"users">; profileId: Id<"profiles"> }> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Personal",
      color: "#3B82F6",
      icon: "user",
      isDefault: true,
      createdAt: 0,
      updatedAt: 0,
    });
    return { userId, profileId };
  });
}

async function createMemory(t: TestConvex, i: number) {
  await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
    memoryId: `mem-${String(i)}`,
    userId: CLERK_ID,
    title: `note ${String(i)}`,
    content: `note body ${String(i)}`,
    type: "knowledge",
    source: "api",
    tags: i % 2 === 0 ? ["even", "shared"] : ["shared"],
    confidence: 0.9,
    contentHash: `hash-${String(i)}`,
    skipHashDedupe: true,
  });
}

// MEMORY_COUNT memories, every one mentioning every entity (1,200 mentions)
// and LINK_COUNT links: more than one 1,000-row page of each
async function seedGraph(t: TestConvex, userId: Id<"users">) {
  for (let i = 0; i < MEMORY_COUNT; i += 1) await createMemory(t, i);
  await t.run(async (ctx) => {
    const extracted = [
      ...(await ctx.db.query("memoryLinks").collect()),
      ...(await ctx.db.query("memoryEntities").collect()),
      ...(await ctx.db.query("memoryEntityMentions").collect()),
    ];
    for (const row of extracted) await ctx.db.delete(row._id);
    for (let e = 0; e < ENTITY_COUNT; e += 1) {
      const normalizedName = `ent-${String(e)}`;
      const entityId = await ctx.db.insert("memoryEntities", {
        userId: CLERK_ID,
        name: normalizedName.toUpperCase(),
        normalizedName,
        type: "project",
        createdAt: e,
      });
      for (let m = 0; m < MEMORY_COUNT; m += 1) {
        await ctx.db.insert("memoryEntityMentions", {
          userId: CLERK_ID,
          memoryId: `mem-${String(m)}`,
          entityId,
          normalizedName,
          createdAt: m,
        });
      }
    }
    let links = 0;
    for (let s = 0; s < MEMORY_COUNT && links < LINK_COUNT; s += 1) {
      for (let d = 0; d < MEMORY_COUNT && links < LINK_COUNT; d += 1) {
        if (s === d) continue;
        await ctx.db.insert("memoryLinks", {
          userId: CLERK_ID,
          sourceId: `mem-${String(s)}`,
          targetId: `mem-${String(d)}`,
          reason: links % 2 === 0 ? "similar" : "follows",
          createdAt: links,
        });
        links += 1;
      }
    }
    await ctx.db.insert("skills", {
      userId,
      name: "Write tests",
      description: "How to write tests",
      instructions: "Use vitest",
      createdAt: 0,
      updatedAt: 0,
    });
  });
}

async function readStoredSnapshot(t: TestConvex, profileId: string) {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query("graphSnapshots")
      .withIndex("by_user_profile", (q) =>
        q.eq("userId", CLERK_ID).eq("profileId", profileId),
      )
      .unique();
    const snapshot = row?.snapshot;
    if (snapshot === undefined) throw new Error("no snapshot");
    const blob = await ctx.storage.get(snapshot.storageId);
    if (blob === null) throw new Error("no snapshot file");
    const files = await ctx.db.system.query("_storage").collect();
    return {
      snapshot,
      graph: decodeGraphSnapshot(await blob.text()),
      fileCount: files.length,
    };
  });
}

// scheduled follow-ups (extraction, nightly builds) run inside each test
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function drain(t: TestConvex): Promise<void> {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("graph snapshot codec", () => {
  const graph: GraphSnapshotGraph = {
    nodes: [
      {
        id: "mem-a",
        title: "A",
        tags: ["x", "y"],
        createdAt: "2026-01-02T03:04:05.000Z",
        kind: "memory",
        source: "api",
        sourceType: "notion",
        type: "knowledge",
      },
      {
        id: "mem-b",
        title: "B",
        tags: ["y"],
        createdAt: "2026-01-02T03:04:06.000Z",
        kind: "memory",
        source: "api",
        sourceType: null,
        type: "episodic",
      },
      {
        id: "entity:1",
        title: "Convex",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        kind: "entity",
        sourceType: null,
        entityType: "technology",
      },
      {
        id: "skill:1",
        title: "Skill",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        kind: "skill",
        sourceType: null,
        content: "does things",
      },
    ],
    relatesToEdges: [{ source: "mem-a", target: "mem-b", reason: "similar" }],
    mentionsEdges: [
      { source: "mem-a", target: "entity:1" },
      { source: "mem-b", target: "entity:1" },
    ],
  };

  it("round-trips nodes and edges", () => {
    expect(decodeGraphSnapshot(encodeGraphSnapshot(graph))).toEqual(graph);
  });

  it("stores ids once and repeated strings in the dictionary", () => {
    const json = encodeGraphSnapshot(graph);
    expect(json.split('"mem-a"')).toHaveLength(2);
    expect(json.split('"y"')).toHaveLength(2);
  });

  it("keeps createdAt to the second and drops edges to unknown nodes", () => {
    const decoded = decodeGraphSnapshot(
      encodeGraphSnapshot({
        nodes: [
          {
            id: "mem-a",
            title: "A",
            tags: [],
            createdAt: "2026-01-02T03:04:05.987Z",
            kind: "memory",
            sourceType: null,
          },
        ],
        relatesToEdges: [{ source: "mem-a", target: "gone", reason: "x" }],
        mentionsEdges: [{ source: "gone", target: "mem-a" }],
      }),
    );
    expect(decoded.nodes[0]?.createdAt).toBe("2026-01-02T03:04:05.000Z");
    expect(decoded.relatesToEdges).toEqual([]);
    expect(decoded.mentionsEdges).toEqual([]);
  });

  it("rejects other versions and out-of-range references", () => {
    expect(() =>
      decodeGraphSnapshot(
        JSON.stringify({ v: 99, d: [], n: [], r: [], m: [] }),
      ),
    ).toThrow();
    expect(() =>
      decodeGraphSnapshot(
        JSON.stringify({ v: 1, d: ["x"], n: [], r: [0, 1, 0], m: [] }),
      ),
    ).toThrow(/bad node index/);
  });
});

describe("graph snapshot rate limit", () => {
  it("allows a build once the interval has passed", () => {
    expect(buildRetryAfterMs(undefined, 1_000, 300)).toBe(0);
    expect(buildRetryAfterMs(1_000, 1_100, 300)).toBe(200);
    expect(buildRetryAfterMs(1_000, 1_300, 300)).toBe(0);
  });

  it("refuses a second on-demand build within five minutes", async () => {
    const t = testConvex();
    const { profileId } = await seedUser(t);
    await createMemory(t, 0);
    const viewer = t.withIdentity({ subject: CLERK_ID });

    const first = await viewer.action(api.graphSnapshots.refreshGraphSnapshot, {
      profileId,
    });
    expect(first.status).toBe("built");
    const second = await viewer.action(
      api.graphSnapshots.refreshGraphSnapshot,
      { profileId },
    );
    expect(second).toEqual({
      status: "rate_limited",
      retryAfterMs: GRAPH_SNAPSHOT_REFRESH_INTERVAL_MS,
    });
    await drain(t);
  });

  it("refuses a profile the caller cannot read", async () => {
    const t = testConvex();
    const { profileId } = await seedUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "clerk_other" });
    });
    await expect(
      t
        .withIdentity({ subject: "clerk_other" })
        .action(api.graphSnapshots.refreshGraphSnapshot, { profileId }),
    ).rejects.toThrow(/Profile not accessible/);
  });
});

describe("graph snapshot build", () => {
  it("pages the whole graph into one stored file and keeps only the latest", async () => {
    const t = testConvex();
    const { userId, profileId } = await seedUser(t);
    await seedGraph(t, userId);

    const result = await t.action(
      internal.graphSnapshots.buildForUserInternal,
      { userId: CLERK_ID },
    );
    expect(result.counts).toEqual({
      memoryCount: MEMORY_COUNT,
      entityCount: ENTITY_COUNT,
      skillCount: 1,
      relatesCount: LINK_COUNT,
      mentionsCount: MEMORY_COUNT * ENTITY_COUNT,
    });
    expect(result.truncated).toBe(false);

    const stored = await readStoredSnapshot(t, profileId);
    expect(stored.snapshot.byteSize).toBe(result.byteSize);
    expect(stored.graph.nodes).toHaveLength(MEMORY_COUNT + ENTITY_COUNT + 1);
    expect(stored.graph.relatesToEdges).toHaveLength(LINK_COUNT);
    expect(stored.graph.mentionsEdges).toHaveLength(
      MEMORY_COUNT * ENTITY_COUNT,
    );
    expect(stored.graph.nodes.find((n) => n.id === "mem-0")).toMatchObject({
      title: "note 0",
      kind: "memory",
      type: "knowledge",
      source: "api",
      tags: ["even", "shared"],
    });
    expect(
      stored.graph.nodes.some((n) => "content" in n && n.kind === "memory"),
    ).toBe(false);

    // the live read sees the same graph
    const live = await t
      .withIdentity({ subject: CLERK_ID })
      .action(api.graphApi.getGraphData, { profileId, mode: "global" });
    expect(new Set(stored.graph.nodes.map((n) => n.id))).toEqual(
      new Set(live.nodes.map((n) => n.id)),
    );

    await t.action(internal.graphSnapshots.buildForUserInternal, {
      userId: CLERK_ID,
    });
    const rebuilt = await readStoredSnapshot(t, profileId);
    expect(rebuilt.snapshot.storageId).not.toBe(stored.snapshot.storageId);
    expect(rebuilt.fileCount).toBe(1);
    await drain(t);
  });

  it("nightly schedules builds only for users with memories", async () => {
    const t = testConvex();
    await seedUser(t);
    await createMemory(t, 0);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "clerk_empty" });
    });
    await t.mutation(internal.graphSnapshots.kickNightlyInternal, {});
    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const builds = scheduled.filter((job) =>
      job.name.includes("rebuildUserInternal"),
    );
    expect(builds).toHaveLength(1);
    await drain(t);
  });
});

describe("graph snapshot delta", () => {
  it("returns changed and deleted memories and new links since the build", async () => {
    const t = testConvex();
    const { profileId } = await seedUser(t);
    await createMemory(t, 0);
    await createMemory(t, 1);
    const viewer = t.withIdentity({ subject: CLERK_ID });
    await viewer.action(api.graphSnapshots.refreshGraphSnapshot, {
      profileId,
    });
    const meta = await viewer.query(api.graphSnapshots.getGraphSnapshot, {
      profileId,
    });
    const builtAt = meta?.snapshot?.builtAt;
    if (builtAt === undefined) throw new Error("no snapshot");
    expect(meta?.snapshot?.url).toBeTruthy();

    vi.setSystemTime(builtAt + 1_000);
    await createMemory(t, 2);
    await t.mutation(internal.memoryStore.functions.deleteMemoryInternal, {
      userId: CLERK_ID,
      memoryId: "mem-0",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("memoryLinks", {
        userId: CLERK_ID,
        sourceId: "mem-1",
        targetId: "mem-2",
        reason: "new",
        createdAt: Date.now(),
      });
    });

    const delta = await viewer.query(api.graphSnapshots.getGraphDelta, {
      profileId,
      since: builtAt,
    });
    expect(delta.needsRefresh).toBe(false);
    expect(delta.memories.map((node) => node.id)).toContain("mem-2");
    expect(delta.memories.map((node) => node.id)).not.toContain("mem-1");
    expect(delta.deletedMemoryIds).toEqual(["mem-0"]);
    expect(delta.links).toContainEqual({
      source: "mem-1",
      target: "mem-2",
      reason: "new",
    });
    await drain(t);
  });

  it("asks for a refresh when the snapshot is older than the tombstones", async () => {
    const t = testConvex();
    const { profileId } = await seedUser(t);
    const delta = await t
      .withIdentity({ subject: CLERK_ID })
      .query(api.graphSnapshots.getGraphDelta, {
        profileId,
        since: Date.now() - GRAPH_TOMBSTONE_RETENTION_MS - 1,
      });
    expect(delta).toMatchObject({ needsRefresh: true, memories: [] });
  });
});
