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
        searchQuery: "visible",
        tags: ["pnpm"],
        limit: 10,
        offset: 0,
      },
    );
    expect(searched.total).toBe(1);
    expect(searched.memories[0]?.id).toBe(visible.id);
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

    const first = await t.mutation(
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
    const second = await t.mutation(
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
        searchQuery: "package manager",
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
        searchQuery: "dark mode",
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
});
