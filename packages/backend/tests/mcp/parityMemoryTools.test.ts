import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { api, internal } from "../../convex/_generated/api";
import { memoryToolSpecs } from "../../convex/mcp/toolsMemory";
import { memoryManageToolSpecs } from "../../convex/mcp/toolsMemoryManage";
import {
  asUser,
  createConvexBackend,
  mcpCaller,
  signUp,
  type ConvexTestBackend,
  type McpCaller,
} from "./convexHarness";

const ALICE = "clerk_parity_alice";
const BOB = "clerk_parity_bob";

const idSchema = z.object({ id: z.string() });
const memoryRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  source: z.string(),
  tags: z.array(z.string()),
});
const listSchema = z.object({ memories: z.array(memoryRowSchema) });
const graphSchema = z.object({
  nodes: z.array(z.object({ id: z.string(), kind: z.literal("memory") })),
  relatesToEdges: z.array(z.object({ source: z.string(), target: z.string() })),
  tagEdges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      weight: z.number(),
      sharedTags: z.array(z.string()),
    }),
  ),
  truncated: z.boolean(),
  nextCursor: z.string().nullable(),
  stats: z.object({ totalNodesBeforeCap: z.number() }),
});
const facetsSchema = z.object({
  totalMemories: z.number(),
  tags: z.array(z.object({ tag: z.string(), count: z.number() })),
  sources: z.array(z.object({ source: z.string(), count: z.number() })),
});
const historySchema = z.object({
  events: z.array(z.object({ memoryId: z.string(), action: z.string() })),
  priorVersions: z.array(z.object({ id: z.string() })),
});
const trailSchema = z.array(
  z.object({ memoryTitle: z.string(), connectionType: z.string() }),
);
const batchSchema = z.object({
  created: z.array(z.object({ id: z.string() })),
  failed: z.array(z.unknown()),
});
const statsSchema = z.object({ totalMemories: z.number() });
const portraitListSchema = z.array(
  z.object({
    dreamPortrait: z.string().nullable(),
    dreamPortraitUpdatedAt: z.string().nullable(),
  }),
);

async function add(
  caller: McpCaller,
  fields: {
    title: string;
    tags?: string[];
    type?: "profile" | "episodic" | "knowledge";
    source?: string;
    profileId?: string;
  },
): Promise<string> {
  const created = await caller.call("memory_add", {
    content: `${fields.title} body`,
    type: fields.type ?? "knowledge",
    source: "mcp",
    ...fields,
  });
  return idSchema.parse(created).id;
}

// writes bypass the tag normaliser, so a test can seed pre-normaliser tags
async function setRawTags(
  t: ConvexTestBackend,
  memoryId: string,
  tags: string[],
): Promise<void> {
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("memories").collect();
    for (const row of rows) {
      if (row.memoryId === memoryId) await ctx.db.patch(row._id, { tags });
    }
  });
}

function ids(result: unknown): string[] {
  return listSchema
    .parse(result)
    .memories.map((memory) => memory.id)
    .sort();
}

async function twoUsers(): Promise<{
  t: ConvexTestBackend;
  alice: McpCaller;
  bob: McpCaller;
}> {
  const t = createConvexBackend();
  await signUp(t, ALICE, "alice@example.com");
  await signUp(t, BOB, "bob@example.com");
  return { t, alice: mcpCaller(t, ALICE), bob: mcpCaller(t, BOB) };
}

describe("MCP memory parity tools (convex-test backend)", () => {
  it("memory_get returns the caller's memory and hides other users' ids", async () => {
    const { alice, bob } = await twoUsers();
    const id = await add(alice, { title: "Alice likes tea", tags: ["drinks"] });

    const fetched = memoryRowSchema.parse(
      await alice.call("memory_get", { id }),
    );
    expect(fetched).toMatchObject({ id, title: "Alice likes tea" });

    await expect(bob.call("memory_get", { id })).rejects.toThrow(
      /Memory not found/,
    );
  });

  it("memory_search filters by several types, sources, status and created window", async () => {
    const { t, alice } = await twoUsers();
    const profile = await t.mutation(
      internal.profiles.getOrCreateDefaultByClerkIdInternal,
      { clerkId: ALICE },
    );
    const seed = (memoryId: string, fields: Record<string, unknown>) =>
      t.mutation(internal.memoryStore.functions.createMemoryInternal, {
        memoryId,
        userId: ALICE,
        profileId: profile._id,
        title: memoryId,
        content: memoryId,
        type: "knowledge",
        source: "mcp",
        tags: [],
        confidence: 1,
        ...fields,
      });
    await seed("old_profile", {
      type: "profile",
      createdAt: Date.parse("2026-01-10T00:00:00Z"),
    });
    await seed("mid_episodic", {
      type: "episodic",
      source: "notion",
      createdAt: Date.parse("2026-05-10T00:00:00Z"),
    });
    await seed("new_knowledge", {
      source: "claude",
      createdAt: Date.parse("2026-09-10T00:00:00Z"),
    });
    await seed("hidden", {
      status: "suppressed",
      createdAt: Date.parse("2026-09-11T00:00:00Z"),
    });

    expect(
      ids(
        await alice.call("memory_search", { types: ["profile", "episodic"] }),
      ),
    ).toEqual(["mid_episodic", "old_profile"]);
    expect(
      ids(await alice.call("memory_search", { sources: ["notion", "claude"] })),
    ).toEqual(["mid_episodic", "new_knowledge"]);
    expect(
      ids(
        await alice.call("memory_search", {
          createdAfter: "2026-02-01",
          createdBefore: "2026-09-10T00:00:00Z",
        }),
      ),
    ).toEqual(["mid_episodic", "new_knowledge"]);
    expect(
      ids(await alice.call("memory_search", { status: "suppressed" })),
    ).toEqual(["hidden"]);
    expect(
      memoryToolSpecs.memory_search.schema.safeParse({ createdAfter: "soon" })
        .success,
    ).toBe(false);
  });

  it("memory_facets, tag rename and tag delete stay inside the caller's data", async () => {
    const { alice, bob } = await twoUsers();
    await add(alice, { title: "A1", tags: ["react", "web"], source: "claude" });
    await add(alice, { title: "A2", tags: ["react"], source: "notion" });
    const bobMemory = await add(bob, { title: "B1", tags: ["react"] });

    const facets = facetsSchema.parse(
      await alice.call("memory_facets", { tagSort: "most-used" }),
    );
    expect(facets.totalMemories).toBe(2);
    expect(facets.tags.map((tag) => [tag.tag, tag.count])).toEqual([
      ["react", 2],
      ["web", 1],
    ]);
    expect(facets.sources.map((source) => source.source).sort()).toEqual([
      "claude",
      "notion",
    ]);

    await expect(
      alice.call("memory_tag_rename", { tag: "react", newTag: "Web" }),
    ).rejects.toThrow(/already exists/);
    expect(
      await alice.call("memory_tag_rename", {
        tag: "react",
        newTag: " ReactJS ",
      }),
    ).toMatchObject({ newTag: "reactjs", updated: 2 });

    // Bob's memory keeps its own tag
    expect(
      memoryRowSchema.parse(await bob.call("memory_get", { id: bobMemory }))
        .tags,
    ).toEqual(["react"]);
    expect(
      await bob.call("memory_tag_rename", { tag: "reactjs", newTag: "x" }),
    ).toMatchObject({ updated: 0 });

    expect(
      memoryManageToolSpecs.memory_tag_delete.schema.safeParse({ tag: "web" })
        .success,
    ).toBe(false);
    expect(
      await alice.call("memory_tag_delete", { tag: "web", confirm: true }),
    ).toMatchObject({ updated: 1 });
    expect(ids(await alice.call("memory_search", { tags: ["web"] }))).toEqual(
      [],
    );
  });

  it("memory_add and memory_update store host-name tags as the brand", async () => {
    const { alice } = await twoUsers();
    const first = await add(alice, { title: "H1", tags: ["www.youtube.com"] });
    const second = await add(alice, { title: "H2", tags: ["wwwyoutubecom"] });
    for (const id of [first, second]) {
      expect(
        memoryRowSchema.parse(await alice.call("memory_get", { id })).tags,
      ).toEqual(["youtube"]);
    }
    await alice.call("memory_update", {
      id: first,
      tags: ["youtubecom", "x1"],
    });
    expect(
      memoryRowSchema.parse(await alice.call("memory_get", { id: first })).tags,
    ).toEqual(["youtube", "x1"]);
  });

  it("memory_tags_consolidate merges host-name tags in the caller's profile only and is idempotent", async () => {
    const { t, alice, bob } = await twoUsers();
    const y1 = await add(alice, { title: "Y1" });
    const y2 = await add(alice, { title: "Y2" });
    const y3 = await add(alice, { title: "Y3" });
    const bobMemory = await add(bob, { title: "B1" });
    await setRawTags(t, y1, ["wwwyoutubecom", "video"]);
    await setRawTags(t, y2, ["youtubecom"]);
    await setRawTags(t, y3, ["youtube", "wwwyoutubecom"]);
    await setRawTags(t, bobMemory, ["wwwyoutubecom"]);

    expect(await alice.call("memory_tags_consolidate", {})).toMatchObject({
      groupsMerged: 1,
      tagsRemoved: 2,
      memoriesRetagged: 3,
      truncated: false,
      merges: [{ keeper: "youtube", losers: ["wwwyoutubecom", "youtubecom"] }],
    });
    const facets = facetsSchema.parse(await alice.call("memory_facets", {}));
    expect(facets.tags.map((tag) => [tag.tag, tag.count])).toEqual([
      ["video", 1],
      ["youtube", 3],
    ]);
    expect(await alice.call("memory_tags_consolidate", {})).toMatchObject({
      groupsMerged: 0,
      memoriesRetagged: 0,
    });
    expect(
      memoryRowSchema.parse(await bob.call("memory_get", { id: bobMemory }))
        .tags,
    ).toEqual(["wwwyoutubecom"]);
  });

  it("memory_link / memory_unlink and memory_graph neighbours, tag edges, filters and cursor", async () => {
    const { alice, bob } = await twoUsers();
    const a = await add(alice, { title: "Apple pie", tags: ["x"] });
    const b = await add(alice, { title: "Bicycle repair", tags: ["x", "y"] });
    const c = await add(alice, {
      title: "Concert tickets",
      tags: ["z"],
      type: "profile",
    });
    const bobMemory = await add(bob, { title: "Bob", tags: ["x"] });

    expect(
      await alice.call("memory_link", { memoryIdA: a, memoryIdB: c }),
    ).toEqual({ linked: true });
    await expect(
      bob.call("memory_link", { memoryIdA: bobMemory, memoryIdB: a }),
    ).rejects.toThrow(/Memory not found/);
    await expect(
      bob.call("memory_unlink", { memoryIdA: a, memoryIdB: c }),
    ).rejects.toThrow(/Memory not found/);

    const focus = graphSchema.parse(
      await alice.call("memory_graph", { focus: a }),
    );
    expect(focus.nodes.map((node) => node.id)).toEqual([a, c]);
    expect(focus.relatesToEdges).toHaveLength(1);

    const all = graphSchema.parse(await alice.call("memory_graph", {}));
    expect(all.nodes).toHaveLength(3);
    expect(all.tagEdges).toEqual([
      {
        source: a < b ? a : b,
        target: a < b ? b : a,
        weight: 1,
        sharedTags: ["x"],
      },
    ]);

    const profilesOnly = graphSchema.parse(
      await alice.call("memory_graph", { types: ["profile"] }),
    );
    expect(profilesOnly.nodes.map((node) => node.id)).toEqual([c]);

    const firstPage = graphSchema.parse(
      await alice.call("memory_graph", { limit: 2 }),
    );
    expect(firstPage.truncated).toBe(true);
    const secondPage = graphSchema.parse(
      await alice.call("memory_graph", {
        limit: 2,
        cursor: firstPage.nextCursor,
      }),
    );
    expect(secondPage.nodes).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();

    await expect(bob.call("memory_graph", { focus: a })).rejects.toThrow(
      /Memory not found/,
    );

    expect(
      await alice.call("memory_unlink", { memoryIdA: c, memoryIdB: a }),
    ).toEqual({ unlinked: true });
    expect(
      graphSchema.parse(await alice.call("memory_graph", { focus: a })).nodes,
    ).toHaveLength(1);
  });

  it("memory_history and memory_topic_timeline", async () => {
    const { alice, bob } = await twoUsers();
    const id = await add(alice, { title: "Trail one", tags: ["trail"] });
    await add(alice, { title: "Trail two", tags: ["trail"] });

    const history = historySchema.parse(
      await alice.call("memory_history", { memoryId: id }),
    );
    expect(history.events).toEqual([
      expect.objectContaining({ memoryId: id, action: "created" }),
    ]);
    expect(history.priorVersions).toEqual([]);
    await expect(bob.call("memory_history", { memoryId: id })).rejects.toThrow(
      /Memory not found/,
    );

    const trail = trailSchema.parse(
      await alice.call("memory_topic_timeline", { tag: "trail" }),
    );
    expect(trail.map((event) => event.memoryTitle).sort()).toEqual([
      "Trail one",
      "Trail two",
    ]);
    expect(await bob.call("memory_topic_timeline", { tag: "trail" })).toEqual(
      [],
    );
  });

  it("memory_add_batch, memory_stats and memory_import_file", async () => {
    const { alice, bob } = await twoUsers();
    const batch = batchSchema.parse(
      await alice.call("memory_add_batch", {
        items: [
          {
            title: "One",
            content: "1",
            type: "episodic",
            source: "import:claude",
            tags: ["import"],
          },
          {
            title: "Two",
            content: "2",
            type: "episodic",
            source: "import:chatgpt",
          },
        ],
      }),
    );
    expect(batch.created).toHaveLength(2);
    expect(batch.failed).toEqual([]);
    expect(
      memoryToolSpecs.memory_add_batch.schema.safeParse({
        items: Array.from({ length: 51 }, (_, i) => ({
          title: `t${i}`,
          content: "c",
          type: "knowledge",
          source: "mcp",
        })),
      }).success,
    ).toBe(false);

    const imported = memoryRowSchema.parse(
      await alice.call("memory_import_file", {
        filename: "notes.md",
        mimeType: "text/markdown",
        contentBase64: Buffer.from("# Packing list\nTent and stove").toString(
          "base64",
        ),
      }),
    );
    expect(imported).toMatchObject({
      title: "Packing list",
      source: "file-upload",
      tags: ["text", "upload"],
    });

    const stats = statsSchema.parse(await alice.call("memory_stats", {}));
    expect(stats.totalMemories).toBe(3);
    expect(
      statsSchema.parse(await bob.call("memory_stats", {})).totalMemories,
    ).toBe(0);
    await expect(bob.call("memory_get", { id: imported.id })).rejects.toThrow(
      /Memory not found/,
    );
  });

  it("rejects another user's profileId on every new memory tool", async () => {
    const { t, bob } = await twoUsers();
    const aliceProfile = await t.mutation(
      internal.profiles.getOrCreateDefaultByClerkIdInternal,
      { clerkId: ALICE },
    );
    const profileId = aliceProfile._id;
    const calls: Array<[string, Record<string, unknown>]> = [
      ["memory_search", { profileId }],
      ["memory_facets", { profileId }],
      ["memory_stats", { profileId }],
      ["memory_topic_timeline", { profileId, tag: "x" }],
      ["memory_tag_delete", { profileId, tag: "x", confirm: true }],
      [
        "memory_add_batch",
        {
          profileId,
          items: [
            { title: "t", content: "c", type: "knowledge", source: "mcp" },
          ],
        },
      ],
      ["memory_graph", { profileId }],
    ];
    for (const [name, args] of calls) {
      await expect(bob.call(name, args)).rejects.toThrow(/Profile not found/);
    }
  });

  it("list_profiles returns the dream portrait fields", async () => {
    const { alice } = await twoUsers();
    const profiles = portraitListSchema.parse(
      await alice.call("list_profiles"),
    );
    expect(profiles[0]).toEqual({
      ...profiles[0],
      dreamPortrait: null,
      dreamPortraitUpdatedAt: null,
    });
  });

  it("harness keeps scheduled jobs queued so none outlive the test", async () => {
    const t = createConvexBackend();
    await t.run((ctx) =>
      ctx.scheduler.runAfter(
        0,
        internal.contextPromptActions.regenerateIfPendingInternal,
        { clerkId: ALICE },
      ),
    );
    // real timers would start the 0 ms job during this unfaked wait
    await sleep(20);
    const states = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map(
        (job) => job.state.kind,
      ),
    );
    expect(states).toEqual(["pending"]);
  });

  it("team scope: links made by one member show in another member's graph", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    const team = await asUser(t, ALICE, "alice@example.com").mutation(
      api.teams.create,
      { name: "Parity" },
    );
    await asUser(t, ALICE, "alice@example.com").mutation(api.teams.addMember, {
      teamId: team.teamId,
      email: "bob@example.com",
    });
    const aliceTeam = mcpCaller(t, ALICE, "team");
    const bobTeam = mcpCaller(t, BOB, "team");
    const outsider = mcpCaller(t, "clerk_parity_outsider", "team");
    await signUp(t, "clerk_parity_outsider", "out@example.com");

    const a = await add(aliceTeam, { title: "Team A" });
    const b = await add(bobTeam, { title: "Team B" });
    expect(
      await bobTeam.call("memory_link", { memoryIdA: a, memoryIdB: b }),
    ).toEqual({ linked: true });

    const graph = graphSchema.parse(
      await aliceTeam.call("memory_graph", { focus: a }),
    );
    expect(graph.nodes.map((node) => node.id)).toEqual([a, b]);
    expect(graph.relatesToEdges).toHaveLength(1);

    // any member may unlink inside the team profile
    expect(
      await aliceTeam.call("memory_unlink", { memoryIdA: a, memoryIdB: b }),
    ).toEqual({ unlinked: true });

    await expect(outsider.call("memory_get", { id: a })).rejects.toThrow(
      /No team profiles available/,
    );
  });
});
