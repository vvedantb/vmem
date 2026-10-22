/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { toMemoryCandidate } from "../engine/memory/retrieve";

const modules = import.meta.glob("./**/*.ts");

const USER_A = "clerk_user_a";
const USER_B = "clerk_user_b";
const PERSONAL_PROFILE = "profile_personal_a";
const TEAM_PROFILE = "profile_team";

function createArgs(
  overrides: {
    memoryId?: string;
    userId?: string;
    profileId?: string;
    title?: string;
    content?: string;
    type?: "profile" | "episodic" | "knowledge";
    source?: string;
    tags?: string[];
  } = {},
) {
  const title = overrides.title ?? "Prefers pnpm";
  const content = overrides.content ?? "Use pnpm for vmem";
  return {
    memoryId: overrides.memoryId,
    userId: overrides.userId ?? USER_A,
    profileId: overrides.profileId ?? PERSONAL_PROFILE,
    title,
    content,
    type: overrides.type ?? ("knowledge" as const),
    source: overrides.source ?? "api",
    tags: overrides.tags ?? ["Tooling"],
    confidence: 0.9,
    contentHash: "test-hash",
    // fixtures share one hash on purpose; hash dedupe has its own tests
    skipHashDedupe: true,
  };
}

describe("convex memoryStore", () => {
  it("creates, lists, updates, and deletes a personal memory", async () => {
    const t = convexTest(schema, modules);

    const created = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs(),
    );

    expect(created.userId).toBe(USER_A);
    expect(created.profileId).toBe(PERSONAL_PROFILE);
    expect(created.status).toBe("active");
    expect(created.tags).toEqual(["tooling"]);
    expect(created.sourceType).toBeNull();
    expect(created.expiresAt).toBeNull();

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        limit: 10,
        offset: 0,
      },
    );
    expect(listed.total).toBe(1);
    expect(listed.memories[0]?.id).toBe(created.id);

    await t.run(async (ctx) => {
      const doc = await ctx.db
        .query("memories")
        .withIndex("by_memory_id", (q) => q.eq("memoryId", created.id))
        .first();
      expect(doc?.searchableText).toContain("Prefers pnpm");
      expect(doc?.searchableText).toContain("tooling");
    });

    const fetched = await t.query(
      internal.memoryStore.functions.getMemoryInternal,
      { userId: USER_A, memoryId: created.id },
    );
    expect(fetched?.title).toBe("Prefers pnpm");

    const updated = await t.mutation(
      internal.memoryStore.functions.updateMemoryInternal,
      {
        userId: USER_A,
        memoryId: created.id,
        title: "Prefers pnpm workspaces",
        tags: ["Tooling", "Monorepo"],
      },
    );
    expect(updated?.title).toBe("Prefers pnpm workspaces");
    expect(updated?.tags).toEqual(["tooling", "monorepo"]);

    const deleted = await t.mutation(
      internal.memoryStore.functions.deleteMemoryInternal,
      { userId: USER_A, memoryId: created.id },
    );
    expect(deleted).toBe(true);

    const missing = await t.query(
      internal.memoryStore.functions.getMemoryInternal,
      { userId: USER_A, memoryId: created.id },
    );
    expect(missing).toBeNull();
  });

  it("keeps personal memories isolated by clerk userId", async () => {
    const t = convexTest(schema, modules);

    const created = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({ title: "A only" }),
    );

    const otherList = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      { userId: USER_B, limit: 10, offset: 0 },
    );
    expect(otherList.total).toBe(0);

    const otherGet = await t.query(
      internal.memoryStore.functions.getMemoryInternal,
      { userId: USER_B, memoryId: created.id },
    );
    expect(otherGet).toBeNull();

    const otherUpdate = await t.mutation(
      internal.memoryStore.functions.updateMemoryInternal,
      { userId: USER_B, memoryId: created.id, title: "Hijacked" },
    );
    expect(otherUpdate).toBeNull();

    const otherDelete = await t.mutation(
      internal.memoryStore.functions.deleteMemoryInternal,
      { userId: USER_B, memoryId: created.id },
    );
    expect(otherDelete).toBe(false);
  });

  it("lists team memories by profileId across member userIds", async () => {
    const t = convexTest(schema, modules);

    const fromA = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        userId: USER_A,
        profileId: TEAM_PROFILE,
        title: "Team note A",
      }),
    );
    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        userId: USER_B,
        profileId: TEAM_PROFILE,
        title: "Team note B",
        content: "Second member write",
      }),
    );
    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        title: "Personal note",
      }),
    );

    const teamList = await t.query(
      internal.memoryStore.functions.listMemoriesForTeamInternal,
      { profileId: TEAM_PROFILE, limit: 10, offset: 0 },
    );
    expect(teamList.total).toBe(2);
    expect(
      teamList.memories
        .map((memory) => memory.title)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["Team note A", "Team note B"]);

    const teamGet = await t.query(
      internal.memoryStore.functions.getMemoryForTeamInternal,
      { profileId: TEAM_PROFILE, memoryId: fromA.id },
    );
    expect(teamGet?.title).toBe("Team note A");

    const personalGet = await t.query(
      internal.memoryStore.functions.getMemoryForTeamInternal,
      { profileId: PERSONAL_PROFILE, memoryId: fromA.id },
    );
    expect(personalGet).toBeNull();

    const deleted = await t.mutation(
      internal.memoryStore.functions.deleteTeamMemoryAsOwnerInternal,
      { profileId: TEAM_PROFILE, memoryId: fromA.id },
    );
    expect(deleted).toBe(true);

    const remaining = await t.query(
      internal.memoryStore.functions.listMemoriesForTeamInternal,
      { profileId: TEAM_PROFILE, limit: 10, offset: 0 },
    );
    expect(remaining.total).toBe(1);
    expect(remaining.memories[0]?.title).toBe("Team note B");
  });

  it("hides suppressed memories from default list and honors search/type filters", async () => {
    const t = convexTest(schema, modules);

    const visible = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({ title: "Visible pnpm", tags: ["pnpm"] }),
    );
    const hidden = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        title: "Hidden pnpm",
        content: "suppressed row",
        tags: ["pnpm"],
      }),
    );
    await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
      userId: USER_A,
      memoryId: hidden.id,
      status: "suppressed",
    });

    const defaultList = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      { userId: USER_A, limit: 10, offset: 0 },
    );
    expect(defaultList.total).toBe(1);
    expect(defaultList.memories[0]?.id).toBe(visible.id);

    const suppressedList = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      { userId: USER_A, status: "suppressed", limit: 10, offset: 0 },
    );
    expect(suppressedList.total).toBe(1);
    expect(suppressedList.memories[0]?.id).toBe(hidden.id);

    const searched = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        // convex-test search matches one lowercase word prefix
        searchQuery: "pnpm",
        tags: ["pnpm"],
        limit: 10,
        offset: 0,
      },
    );
    expect(searched.total).toBe(1);
    expect(searched.memories[0]?.id).toBe(visible.id);
  });

  it("list type and tag filters drop other types and untagged rows", async () => {
    const t = convexTest(schema, modules);

    const profile = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "profile-london",
        title: "Lives in London",
        content: "Based in London",
        type: "profile",
        tags: ["city"],
      }),
    );
    const knowledge = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "knowledge-pnpm",
        title: "Prefers pnpm",
        content: "Use pnpm for vmem",
        type: "knowledge",
        tags: ["PNPM"],
      }),
    );
    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "episodic-alice",
        title: "Met Alice",
        content: "Coffee with Alice",
        type: "episodic",
        tags: ["people"],
      }),
    );

    const byType = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        type: "profile",
        limit: 10,
        offset: 0,
      },
    );
    expect(byType.memories.map((memory) => memory.id)).toEqual([profile.id]);

    const byTag = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        tags: ["pnpm"],
        limit: 10,
        offset: 0,
      },
    );
    expect(byTag.memories.map((memory) => memory.id)).toEqual([knowledge.id]);
  });

  it("includes legacy personal memories that have no profileId", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("memories", {
        memoryId: "legacy-mem",
        userId: USER_A,
        title: "Legacy note",
        content: "written before profiles",
        type: "knowledge",
        source: "api",
        confidence: 1,
        status: "active",
        tags: [],
        createdAt: now,
        updatedAt: now,
        contentHash: "legacy-hash",
        visitCount: 1,
        firstVisitAt: now,
        lastVisitAt: now,
      });
    });

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        limit: 10,
        offset: 0,
      },
    );
    expect(listed.total).toBe(1);
    expect(listed.memories[0]?.id).toBe("legacy-mem");
    expect(listed.memories[0]?.profileId).toBeNull();
  });

  it("keeps a caller-supplied memoryId and is idempotent on create", async () => {
    const t = convexTest(schema, modules);
    const memoryId = "stable-memory-id";

    const created = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({ memoryId, title: "First write" }),
    );
    expect(created.id).toBe(memoryId);

    const again = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({ memoryId, title: "Second write" }),
    );
    expect(again.id).toBe(memoryId);
    expect(again.title).toBe("First write");

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      { userId: USER_A, limit: 10, offset: 0 },
    );
    expect(listed.total).toBe(1);
  });

  it("deletes every memory for one clerk userId", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({ title: "A1" }),
    );
    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        userId: USER_A,
        profileId: TEAM_PROFILE,
        title: "A team",
      }),
    );
    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({ userId: USER_B, title: "B stays" }),
    );

    const deleted = await t.mutation(
      internal.memoryStore.functions.deleteMemoriesForUserInternal,
      { userId: USER_A },
    );
    expect(deleted).toBe(2);

    const remainingA = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      { userId: USER_A, limit: 10, offset: 0 },
    );
    const remainingB = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      { userId: USER_B, limit: 10, offset: 0 },
    );
    expect(remainingA.total).toBe(0);
    expect(remainingB.total).toBe(1);
    expect(remainingB.memories[0]?.title).toBe("B stays");
  });

  it("searches, upserts by source, and deletes by profile", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        title: "Prefers pnpm",
        content: "Use pnpm for vmem installs",
        tags: ["tooling"],
      }),
    );
    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "other-note",
        title: "Coffee order",
        content: "Oat latte",
        tags: ["food"],
      }),
    );

    const searched = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        searchQuery: "pnpm",
        limit: 10,
        offset: 0,
      },
    );
    expect(searched.total).toBe(1);
    expect(searched.memories[0]?.title).toBe("Prefers pnpm");

    const { memory: first } = await t.mutation(
      internal.memoryStore.functions.upsertMemoryFromSourceInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        title: "Drive doc",
        content: "first body",
        sourceType: "google_drive",
        sourceId: "doc-1",
        sourceUrl: "https://drive.google.com/file/d/doc-1",
      },
    );
    const { memory: second } = await t.mutation(
      internal.memoryStore.functions.upsertMemoryFromSourceInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        title: "Drive doc updated",
        content: "second body",
        sourceType: "google_drive",
        sourceId: "doc-1",
        sourceUrl: "https://drive.google.com/file/d/doc-1",
      },
    );
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("Drive doc updated");
    expect(second.content).toBe("second body");

    const teamMemory = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "team-row",
        userId: USER_B,
        profileId: TEAM_PROFILE,
        title: "Team copied",
        content: "team graph row",
      }),
    );
    expect(teamMemory.userId).toBe(USER_B);

    const deleted = await t.mutation(
      internal.memoryStore.functions.deleteMemoriesByProfileInternal,
      { profileId: TEAM_PROFILE },
    );
    expect(deleted).toBe(1);

    const teamGet = await t.query(
      internal.memoryStore.functions.getMemoryForTeamInternal,
      { profileId: TEAM_PROFILE, memoryId: "team-row" },
    );
    expect(teamGet).toBeNull();
  });

  it("maps search hits through hybrid retrieve ranking", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        title: "Prefers pnpm",
        content: "Use pnpm for vmem installs",
      }),
    );
    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "coffee",
        title: "Coffee order",
        content: "Oat latte",
      }),
    );

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        searchQuery: "pnpm",
        limit: 10,
        offset: 0,
      },
    );
    expect(listed.total).toBe(1);

    const hits = listed.memories.map((memory) =>
      toMemoryCandidate(memory, "package manager"),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.trace.score).toBeGreaterThan(0);
    expect(hits[0]?.trace.scoreBreakdown.fulltext).toBeGreaterThan(0);
    expect(hits[0]?.trace.reason).not.toContain("substring");
  });

  it("verification matrix: personal create/get/list/update/search/delete", async () => {
    const t = convexTest(schema, modules);

    const created = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        title: "Prefers pnpm",
        content: "Use pnpm for vmem installs",
        tags: ["tooling"],
      }),
    );

    const fetched = await t.query(
      internal.memoryStore.functions.getMemoryInternal,
      { userId: USER_A, memoryId: created.id },
    );
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.content).toBe("Use pnpm for vmem installs");

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        limit: 10,
        offset: 0,
      },
    );
    expect(listed.total).toBe(1);
    expect(listed.memories[0]?.id).toBe(created.id);

    const updated = await t.mutation(
      internal.memoryStore.functions.updateMemoryInternal,
      {
        userId: USER_A,
        memoryId: created.id,
        title: "Prefers pnpm workspaces",
        content: "Use pnpm workspaces for vmem",
      },
    );
    expect(updated?.title).toBe("Prefers pnpm workspaces");

    const searched = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        searchQuery: "workspaces",
        limit: 10,
        offset: 0,
      },
    );
    expect(searched.total).toBe(1);
    expect(searched.memories[0]?.id).toBe(created.id);

    const retrieveHits = searched.memories.map((memory) =>
      toMemoryCandidate(memory, "workspaces"),
    );
    expect(retrieveHits[0]?.trace.score).toBeGreaterThan(0);

    const deleted = await t.mutation(
      internal.memoryStore.functions.deleteMemoryInternal,
      { userId: USER_A, memoryId: created.id },
    );
    expect(deleted).toBe(true);

    const missing = await t.query(
      internal.memoryStore.functions.getMemoryInternal,
      { userId: USER_A, memoryId: created.id },
    );
    expect(missing).toBeNull();
  });

  it("verification matrix: team create/get/list/update/search/delete", async () => {
    const t = convexTest(schema, modules);

    const created = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        userId: USER_A,
        profileId: TEAM_PROFILE,
        title: "Team pnpm",
        content: "shared pnpm note",
      }),
    );

    const fetched = await t.query(
      internal.memoryStore.functions.getMemoryForTeamInternal,
      { profileId: TEAM_PROFILE, memoryId: created.id },
    );
    expect(fetched?.title).toBe("Team pnpm");
    expect(fetched?.userId).toBe(USER_A);

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesForTeamInternal,
      { profileId: TEAM_PROFILE, limit: 10, offset: 0 },
    );
    expect(listed.total).toBe(1);

    const updated = await t.mutation(
      internal.memoryStore.functions.updateMemoryInternal,
      {
        userId: USER_A,
        memoryId: created.id,
        title: "Team pnpm updated",
        content: "shared pnpm note v2",
      },
    );
    expect(updated?.title).toBe("Team pnpm updated");

    const searched = await t.query(
      internal.memoryStore.functions.listMemoriesForTeamInternal,
      {
        profileId: TEAM_PROFILE,
        searchQuery: "pnpm",
        limit: 10,
        offset: 0,
      },
    );
    expect(searched.total).toBe(1);
    expect(
      searched.memories.map((memory) => toMemoryCandidate(memory, "pnpm"))[0]
        ?.trace.score,
    ).toBeGreaterThan(0);

    const miss = await t.query(
      internal.memoryStore.functions.listMemoriesForTeamInternal,
      {
        profileId: TEAM_PROFILE,
        searchQuery: "webpack",
        limit: 10,
        offset: 0,
      },
    );
    expect(miss.total).toBe(0);

    const personal = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        limit: 10,
        offset: 0,
      },
    );
    expect(personal.memories.some((memory) => memory.id === created.id)).toBe(
      false,
    );

    const deleted = await t.mutation(
      internal.memoryStore.functions.deleteTeamMemoryAsOwnerInternal,
      { profileId: TEAM_PROFILE, memoryId: created.id },
    );
    expect(deleted).toBe(true);
  });

  it("instruction-style rows store without an LLM and FTS can find them", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "from-instruction",
        title: "Remember dark mode",
        content: "User prefers dark mode and uses pnpm for vmem",
        source: "instruction",
        tags: ["instruction"],
      }),
    );
    expect(created.source).toBe("instruction");
    expect(created.tags).toEqual(["instruction"]);

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        searchQuery: "dark",
        limit: 10,
        offset: 0,
      },
    );
    expect(listed.memories.some((memory) => memory.id === created.id)).toBe(
      true,
    );

    const fts = await t.query(
      internal.memoryStore.functions.searchMemoriesTextInternal,
      {
        kind: "personal",
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        query: "dark mode pnpm",
      },
    );
    expect(Array.isArray(fts)).toBe(true);
  });

  it("FTS search returns more than the old 32-hit cap", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 40; i += 1) {
      await t.mutation(
        internal.memoryStore.functions.createMemoryInternal,
        createArgs({
          memoryId: `fts-${String(i)}`,
          title: `Sharedterm note ${String(i)}`,
          content: `sharedterm padding ${String(i)}`,
          tags: ["fts"],
        }),
      );
    }
    const fts = await t.query(
      internal.memoryStore.functions.searchMemoriesTextInternal,
      {
        kind: "personal",
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        query: "sharedterm",
      },
    );
    expect(fts.length).toBeGreaterThan(32);
  });

  it("keeps team FTS hits off the personal profile", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        userId: USER_A,
        profileId: TEAM_PROFILE,
        title: "Team secret",
        content: "shared pnpm note",
      }),
    );

    const teamList = await t.query(
      internal.memoryStore.functions.listMemoriesForTeamInternal,
      {
        profileId: TEAM_PROFILE,
        searchQuery: "pnpm",
        limit: 10,
        offset: 0,
      },
    );
    expect(
      teamList.memories.some((memory) => memory.title === "Team secret"),
    ).toBe(true);

    const personalFts = await t.query(
      internal.memoryStore.functions.searchMemoriesTextInternal,
      {
        kind: "personal",
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        query: "pnpm",
      },
    );
    expect(
      personalFts.every((hit) => hit.memory.profileId !== TEAM_PROFILE),
    ).toBe(true);

    const teamFts = await t.query(
      internal.memoryStore.functions.searchMemoriesTextInternal,
      {
        kind: "team",
        profileId: TEAM_PROFILE,
        query: "pnpm",
      },
    );
    expect(Array.isArray(teamFts)).toBe(true);
  });

  it("persists undirected memory links and drops them with the memory", async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({ memoryId: "mem_a", title: "Helios overview" }),
    );
    const b = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "mem_b",
        title: "Dana leads platform",
        content: "Dana leads the platform team.",
      }),
    );

    const linked = await t.mutation(
      internal.memoryStore.functions.linkMemoriesInternal,
      {
        userId: USER_A,
        memoryIdA: a.id,
        memoryIdB: b.id,
        reason: "platform owns Helios",
      },
    );
    expect(linked).toBe(true);

    const again = await t.mutation(
      internal.memoryStore.functions.linkMemoriesInternal,
      {
        userId: USER_A,
        memoryIdA: b.id,
        memoryIdB: a.id,
        reason: "duplicate",
      },
    );
    expect(again).toBe(true);

    const listed = await t.query(
      internal.memoryStore.functions.listMemoryLinksForUserInternal,
      { userId: USER_A },
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]?.reason).toBe("platform owns Helios");

    const crossUser = await t.mutation(
      internal.memoryStore.functions.linkMemoriesInternal,
      {
        userId: USER_B,
        memoryIdA: a.id,
        memoryIdB: b.id,
        reason: "stolen",
      },
    );
    expect(crossUser).toBe(false);

    await t.mutation(internal.memoryStore.functions.deleteMemoryInternal, {
      userId: USER_A,
      memoryId: a.id,
    });
    const afterDelete = await t.query(
      internal.memoryStore.functions.listMemoryLinksForUserInternal,
      { userId: USER_A },
    );
    expect(afterDelete).toHaveLength(0);
  });

  it("supersedes prior rows so default list and retrieve hide them", async () => {
    const t = convexTest(schema, modules);
    const stale = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "mem_stale",
        title: "Editor was Vim",
        content: "Historically the editor was Vim.",
      }),
    );
    const current = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "mem_current",
        title: "Editor is now Helix",
        content: "As of recently, the editor is Helix; Vim is deprecated.",
      }),
    );

    const superseded = await t.mutation(
      internal.memoryStore.functions.supersedeMemoriesInternal,
      {
        kind: "personal",
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        predecessorIds: [stale.id],
        successorId: current.id,
        reason: "updates",
      },
    );
    expect(superseded).toBe(1);

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        limit: 10,
        offset: 0,
      },
    );
    expect(listed.memories.map((memory) => memory.id)).toEqual([current.id]);

    const hidden = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      {
        userId: USER_A,
        profileId: PERSONAL_PROFILE,
        status: "suppressed",
        limit: 10,
        offset: 0,
      },
    );
    expect(hidden.memories.map((memory) => memory.id)).toEqual([stale.id]);

    const links = await t.query(
      internal.memoryStore.functions.listMemoryLinksForUserInternal,
      { userId: USER_A },
    );
    expect(links.some((link) => link.reason === "updates")).toBe(true);

    const ranked = listed.memories.map((memory) =>
      toMemoryCandidate(memory, "what editor currently"),
    );
    expect(ranked.some((hit) => hit.id === stale.id)).toBe(false);
  });

  it("auto-extracts entities and links memories that share them", async () => {
    const t = convexTest(schema, modules);
    const aliceDark = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "mem_alice_dark",
        title: "Alice prefers dark mode",
        content: "Alice uses dark mode in every editor.",
      }),
    );
    const aliceLondon = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      createArgs({
        memoryId: "mem_alice_london",
        title: "Alice lives in London",
        content: "Alice is based in London.",
      }),
    );

    const listed = await t.query(
      internal.memoryStore.functions.listMemoryLinksForUserInternal,
      { userId: USER_A },
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]?.reason.toLowerCase()).toContain("alice");
    const ids = new Set([listed[0]?.sourceId, listed[0]?.targetId]);
    expect(ids.has(aliceDark.id)).toBe(true);
    expect(ids.has(aliceLondon.id)).toBe(true);

    const graph = await t.query(
      internal.memoryStore.functions.listEntitiesForGraphInternal,
      { userId: USER_A },
    );
    expect(graph.nodes.some((node) => node.normalizedName === "alice")).toBe(
      true,
    );
    expect(graph.mentions.length).toBeGreaterThanOrEqual(2);
  });

  it("paginates scoped memories and stats without collecting the full set", async () => {
    const t = convexTest(schema, modules);
    const titles = ["one", "two", "three", "four", "five"];
    for (const title of titles) {
      await t.mutation(
        internal.memoryStore.functions.createMemoryInternal,
        createArgs({
          memoryId: `mem-${title}`,
          title,
          content: `${title} body`,
          tags: [title],
        }),
      );
    }

    const memories: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    const personalScope = {
      kind: "personal" as const,
      userId: USER_A,
      profileId: PERSONAL_PROFILE,
      numItems: 2,
    };
    for (;;) {
      const page: {
        memories: Array<{ title: string }>;
        isDone: boolean;
        continueCursor: string;
      } = await t.query(
        internal.memoryStore.functions.paginateScopedMemoriesInternal,
        { ...personalScope, cursor },
      );
      pages += 1;
      for (const memory of page.memories) memories.push(memory.title);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(pages).toBeGreaterThan(1);
    expect(memories.sort()).toEqual([...titles].sort());

    const tags = new Set<string>();
    let statsCursor: string | null = null;
    let rowCount = 0;
    for (;;) {
      const page: {
        rows: Array<{ tags: string[] }>;
        isDone: boolean;
        continueCursor: string;
      } = await t.query(
        internal.memoryStore.functions.paginateScopedMemoryStatsInternal,
        { ...personalScope, cursor: statsCursor },
      );
      rowCount += page.rows.length;
      for (const row of page.rows) {
        for (const tag of row.tags) tags.add(tag);
      }
      if (page.isDone) break;
      statsCursor = page.continueCursor;
    }
    expect(rowCount).toBe(5);
    expect(tags).toEqual(new Set(titles));
  });

  describe("embedding split", () => {
    const vec = (seed: number) =>
      Array.from({ length: 1536 }, (_, i) => (i === seed ? 1 : 0));

    async function embeddingRows(t: ReturnType<typeof convexTest>) {
      return await t.run(async (ctx) =>
        ctx.db.query("memoryEmbeddings").collect(),
      );
    }

    it("stores vectors in memoryEmbeddings, not on the memory row", async () => {
      const t = convexTest(schema, modules);
      const created = await t.mutation(
        internal.memoryStore.functions.createMemoryInternal,
        createArgs(),
      );
      const ok = await t.mutation(
        internal.memoryStore.functions.patchMemoryEmbeddingInternal,
        { memoryId: created.id, embedding: vec(1) },
      );
      expect(ok).toBe(true);
      const rows = await embeddingRows(t);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.userId).toBe(USER_A);
      expect(rows[0]?.profileId).toBe(PERSONAL_PROFILE);
      const memoryDocs = await t.run(async (ctx) =>
        ctx.db.query("memories").collect(),
      );
      expect(memoryDocs[0]).not.toHaveProperty("embedding");

      // re-embedding updates in place instead of adding a second row
      await t.mutation(
        internal.memoryStore.functions.patchMemoryEmbeddingInternal,
        { memoryId: created.id, embedding: vec(2) },
      );
      const again = await embeddingRows(t);
      expect(again).toHaveLength(1);
      expect(again[0]?.embedding[2]).toBe(1);

      const joined = await t.query(
        internal.memoryStore.functions.getMemoriesByEmbeddingIdsInternal,
        { ids: again.map((r) => r._id) },
      );
      expect(joined[0]?.id).toBe(created.id);
    });

    it("deletes the embedding row with the memory and follows profile moves", async () => {
      const t = convexTest(schema, modules);
      const a = await t.mutation(
        internal.memoryStore.functions.createMemoryInternal,
        createArgs({ memoryId: "mem-a" }),
      );
      const b = await t.mutation(
        internal.memoryStore.functions.createMemoryInternal,
        createArgs({ memoryId: "mem-b", title: "Other", content: "Other" }),
      );
      for (const m of [a, b]) {
        await t.mutation(
          internal.memoryStore.functions.patchMemoryEmbeddingInternal,
          { memoryId: m.id, embedding: vec(3) },
        );
      }
      await t.mutation(
        internal.memoryStore.functions.reassignMemoriesProfileInternal,
        { fromProfileId: PERSONAL_PROFILE, toProfileId: "profile_moved" },
      );
      const moved = await embeddingRows(t);
      expect(moved.map((r) => r.profileId)).toEqual([
        "profile_moved",
        "profile_moved",
      ]);

      await t.mutation(internal.memoryStore.functions.deleteMemoryInternal, {
        userId: USER_A,
        memoryId: a.id,
      });
      expect(await embeddingRows(t)).toHaveLength(1);

      await t.mutation(
        internal.memoryStore.functions.deleteMemoriesByProfileInternal,
        { profileId: "profile_moved" },
      );
      expect(await embeddingRows(t)).toHaveLength(0);
    });

    async function refRows(t: ReturnType<typeof convexTest>) {
      return await t.run(async (ctx) =>
        ctx.db.query("embeddingRefs").collect(),
      );
    }

    async function embedMemory(
      t: ReturnType<typeof convexTest>,
      memoryId: string,
      seed: number,
    ) {
      await t.mutation(
        internal.memoryStore.functions.patchMemoryEmbeddingInternal,
        { memoryId, embedding: vec(seed) },
      );
    }

    it("writes one embeddingRefs row per embedding and removes it on delete", async () => {
      const t = convexTest(schema, modules);
      const a = await t.mutation(
        internal.memoryStore.functions.createMemoryInternal,
        createArgs({ memoryId: "mem-a" }),
      );
      const b = await t.mutation(
        internal.memoryStore.functions.createMemoryInternal,
        createArgs({ memoryId: "mem-b", title: "Other", content: "Other" }),
      );
      await embedMemory(t, a.id, 1);
      await embedMemory(t, b.id, 2);
      // re-embedding keeps the same embedding row, so no second ref
      await embedMemory(t, a.id, 3);
      const rows = await embeddingRows(t);
      const refs = await refRows(t);
      expect(refs).toHaveLength(2);
      expect(
        new Map(refs.map((ref) => [ref.embeddingId, ref.memoryDocId])),
      ).toEqual(new Map(rows.map((row) => [row._id, row.memoryDocId])));

      await t.mutation(internal.memoryStore.functions.deleteMemoryInternal, {
        userId: USER_A,
        memoryId: a.id,
      });
      const left = await refRows(t);
      expect(left).toHaveLength(1);
      expect(left[0]?.embeddingId).toBe((await embeddingRows(t))[0]?._id);

      await t.mutation(
        internal.memoryStore.functions.deleteMemoriesByProfileInternal,
        { profileId: PERSONAL_PROFILE },
      );
      expect(await refRows(t)).toHaveLength(0);
    });

    it("hydrates vector hits the same with or without refs", async () => {
      const t = convexTest(schema, modules);
      const ids: string[] = [];
      for (const [i, key] of ["a", "b", "c"].entries()) {
        const created = await t.mutation(
          internal.memoryStore.functions.createMemoryInternal,
          createArgs({ memoryId: `mem-${key}`, title: key, content: key }),
        );
        await embedMemory(t, created.id, i);
        ids.push(created.id);
      }
      const embeddingIds = (await embeddingRows(t)).map((row) => row._id);
      const hydrate = () =>
        t.query(
          internal.memoryStore.functions.getMemoriesByEmbeddingIdsInternal,
          { ids: embeddingIds },
        );
      const withRefs = await hydrate();
      expect(withRefs.map((m) => m?.id)).toEqual(ids);

      // a pre-backfill embedding: drop one ref, the full row is the fallback
      const [first] = await refRows(t);
      if (first === undefined) throw new Error("no ref");
      await t.run(async (ctx) => ctx.db.delete(first._id));
      expect(await hydrate()).toEqual(withRefs);

      await t.run(async (ctx) => {
        for (const ref of await ctx.db.query("embeddingRefs").collect()) {
          await ctx.db.delete(ref._id);
        }
      });
      expect(await hydrate()).toEqual(withRefs);
    });

    it("backfills missing refs idempotently, page by page", async () => {
      const t = convexTest(schema, modules);
      for (const [i, key] of ["a", "b", "c"].entries()) {
        const created = await t.mutation(
          internal.memoryStore.functions.createMemoryInternal,
          createArgs({ memoryId: `mem-${key}`, title: key, content: key }),
        );
        await embedMemory(t, created.id, i);
      }
      const [kept] = await refRows(t);
      await t.run(async (ctx) => {
        for (const ref of await ctx.db.query("embeddingRefs").collect()) {
          if (ref._id !== kept?._id) await ctx.db.delete(ref._id);
        }
      });

      const run = async () => {
        let cursor: string | null = null;
        let scanned = 0;
        let created = 0;
        for (;;) {
          const page: {
            scanned: number;
            created: number;
            isDone: boolean;
            continueCursor: string;
          } = await t.mutation(
            internal.memoryStore.functions.backfillEmbeddingRefs,
            { cursor, numItems: 2 },
          );
          scanned += page.scanned;
          created += page.created;
          if (page.isDone) break;
          cursor = page.continueCursor;
        }
        return { scanned, created };
      };
      expect(await run()).toEqual({ scanned: 3, created: 2 });
      expect(await run()).toEqual({ scanned: 3, created: 0 });
      const rows = await embeddingRows(t);
      const refs = await refRows(t);
      expect(new Set(refs.map((ref) => ref.embeddingId))).toEqual(
        new Set(rows.map((row) => row._id)),
      );
      expect(refs).toHaveLength(rows.length);
    });
  });

  describe("source upsert by externalId", () => {
    const BROWSE = {
      userId: USER_A,
      profileId: PERSONAL_PROFILE,
      title: "vhub",
      content: "vhub hub page",
      type: "knowledge" as const,
      source: "browser-extension",
      tags: [],
      confidence: 0.5,
      sourceType: "browsing-history",
      sourceId: "vhub.projectv.uk|vhub",
      url: "https://vhub.projectv.uk/",
      visibleOnly: true,
    };

    async function memoryDocs(t: ReturnType<typeof convexTest>) {
      const docs = await t.run(async (ctx) =>
        ctx.db.query("memories").collect(),
      );
      return docs.filter((doc) => doc.sourceId === BROWSE.sourceId);
    }

    it("bumps visits and keeps updatedAt and hash on identical content", async () => {
      const t = convexTest(schema, modules);
      const first = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        BROWSE,
      );
      expect(first.created).toBe(true);
      const [before] = await memoryDocs(t);
      if (!before) throw new Error("missing row");

      const second = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        { ...BROWSE, url: "https://vhub.projectv.uk/connectors" },
      );
      expect(second.created).toBe(false);
      expect(second.contentChanged).toBe(false);
      expect(second.memory.id).toBe(first.memory.id);
      expect(second.memory.updatedAt).toBe(first.memory.updatedAt);

      const docs = await memoryDocs(t);
      expect(docs).toHaveLength(1);
      const [after] = docs;
      expect(after?.visitCount).toBe(2);
      expect(after?.firstVisitAt).toBe(before.firstVisitAt);
      expect(after?.lastVisitAt).toBeGreaterThanOrEqual(before.lastVisitAt);
      expect(after?.updatedAt).toBe(before.updatedAt);
      expect(after?.contentHash).toBe(before.contentHash);
      expect(after?.url).toBe("https://vhub.projectv.uk/connectors");
    });

    it("patches title and content when they change", async () => {
      const t = convexTest(schema, modules);
      const first = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        BROWSE,
      );
      const [before] = await memoryDocs(t);
      const second = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        { ...BROWSE, title: "vhub — connectors" },
      );
      expect(second.created).toBe(false);
      expect(second.contentChanged).toBe(true);
      expect(second.memory.id).toBe(first.memory.id);
      expect(second.memory.title).toBe("vhub — connectors");
      const [doc] = await memoryDocs(t);
      expect(doc?.visitCount).toBe(2);
      expect(doc?.contentHash).not.toBe(before?.contentHash);
    });

    it("keeps rows separate per profile", async () => {
      const t = convexTest(schema, modules);
      const personal = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        BROWSE,
      );
      const other = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        { ...BROWSE, profileId: "profile_work_a" },
      );
      expect(other.created).toBe(true);
      expect(other.memory.id).not.toBe(personal.memory.id);
      expect(await memoryDocs(t)).toHaveLength(2);
    });

    it("inserts a new row when the only match is hidden", async () => {
      const t = convexTest(schema, modules);
      const first = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        BROWSE,
      );
      await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
        userId: USER_A,
        memoryId: first.memory.id,
        status: "suppressed",
      });
      const second = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        BROWSE,
      );
      expect(second.created).toBe(true);
      expect(second.memory.id).not.toBe(first.memory.id);

      // expired by date counts as hidden too
      await t.run(async (ctx) => {
        const doc = await ctx.db
          .query("memories")
          .withIndex("by_memory_id", (q) => q.eq("memoryId", second.memory.id))
          .first();
        if (!doc) throw new Error("missing row");
        await ctx.db.patch(doc._id, { expiresAt: Date.now() - 1_000 });
      });
      const third = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        BROWSE,
      );
      expect(third.created).toBe(true);
      expect(await memoryDocs(t)).toHaveLength(3);
    });

    it("connector upserts still match a suppressed row", async () => {
      const t = convexTest(schema, modules);
      const { visibleOnly: _visibleOnly, ...connector } = BROWSE;
      const first = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        connector,
      );
      await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
        userId: USER_A,
        memoryId: first.memory.id,
        status: "suppressed",
      });
      const second = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        connector,
      );
      expect(second.created).toBe(false);
      expect(second.memory.id).toBe(first.memory.id);
      expect(second.memory.status).toBe("suppressed");
    });
  });

  describe("bounded reads", () => {
    it("upserts by source id per user and source type without collisions", async () => {
      const t = convexTest(schema, modules);
      const base = {
        profileId: PERSONAL_PROFILE,
        title: "Doc",
        content: "body",
        sourceId: "same-id",
        sourceUrl: "https://example.com/x",
      };
      const { memory: drive } = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        { ...base, userId: USER_A, sourceType: "google_drive" },
      );
      const { memory: notion } = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        { ...base, userId: USER_A, sourceType: "notion" },
      );
      const { memory: otherUser } = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        { ...base, userId: USER_B, sourceType: "google_drive" },
      );
      expect(new Set([drive.id, notion.id, otherUser.id]).size).toBe(3);
      const { memory: again } = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        { ...base, userId: USER_A, sourceType: "notion", title: "Doc v2" },
      );
      expect(again.id).toBe(notion.id);
      expect(again.title).toBe("Doc v2");
    });

    it("caps memory link reads below the return array-length limit", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        for (let i = 0; i < 8_050; i += 1) {
          await ctx.db.insert("memoryLinks", {
            userId: USER_A,
            sourceId: `s-${String(i)}`,
            targetId: `t-${String(i)}`,
            reason: "r",
            createdAt: i,
          });
        }
      });
      const listed = await t.query(
        internal.memoryStore.functions.listMemoryLinksForUserInternal,
        { userId: USER_A },
      );
      expect(listed).toHaveLength(8_000);
      expect(listed[0]?.sourceId).toBe("s-0");
    });
  });
});
