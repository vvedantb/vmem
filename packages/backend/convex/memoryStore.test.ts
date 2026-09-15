/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER_A = "clerk_user_a";
const USER_B = "clerk_user_b";
const PERSONAL_PROFILE = "profile_personal_a";
const TEAM_PROFILE = "profile_team";

function createArgs(
  overrides: {
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
    expect(teamList.memories.map((memory) => memory.title).sort()).toEqual([
      "Team note A",
      "Team note B",
    ]);

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
});
