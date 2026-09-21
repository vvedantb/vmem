/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_user_a";
const PROFILE = "profile_personal_a";

async function seedNearDup(t: ReturnType<typeof convexTest>) {
  await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
    memoryId: "dup_a",
    userId: USER,
    profileId: PROFILE,
    title: "Use pnpm for vmem",
    content: "Use pnpm for vmem",
    type: "knowledge",
    source: "api",
    tags: ["tooling"],
    confidence: 0.9,
  });
  await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
    memoryId: "dup_b",
    userId: USER,
    profileId: PROFILE,
    title: "Use pnpm for vmem",
    content: "Use pnpm for vmem",
    type: "knowledge",
    source: "api",
    tags: ["tooling"],
    confidence: 0.9,
  });
}

describe("proposed updates and dream merge", () => {
  it("dream clustering creates a merge proposal that supersedes sources on approve", async () => {
    const t = convexTest(schema, modules);
    await seedNearDup(t);

    const pass = await t.mutation(internal.dreamMode.runDreamPassInternal, {
      clerkId: USER,
      profileId: PROFILE,
      kind: "personal",
      autoAccept: false,
    });
    expect(pass.reason).toBe("ok");
    expect(pass.clustersScanned).toBeGreaterThanOrEqual(1);
    expect(pass.proposalsCreated).toBeGreaterThanOrEqual(1);
    expect(pass.failOpen).toBeGreaterThanOrEqual(1);
    expect(pass.jevApproved).toBe(0);
    expect(pass.jevRejected).toBe(0);

    const pending = await t.query(
      internal.proposedUpdateApi.listPendingInternal,
      { userId: USER, profileId: PROFILE },
    );
    expect(pending.length).toBeGreaterThanOrEqual(1);
    const merge = pending.find((proposal) => proposal.kind === "merge");
    expect(merge).toBeDefined();
    if (merge === undefined) return;

    const resolved = await t.mutation(
      internal.proposedUpdateApi.resolveInternal,
      {
        clerkId: USER,
        proposalId: merge.id,
        action: "approve",
      },
    );
    expect(resolved?.status).toBe("approved");
    expect(resolved?.materializedMemoryId).toBeTruthy();

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      { userId: USER, profileId: PROFILE, limit: 20, offset: 0 },
    );
    const ids = listed.memories.map((memory) => memory.id);
    expect(ids).toContain(resolved?.materializedMemoryId);
    expect(ids).not.toContain("dup_a");
    expect(ids).not.toContain("dup_b");
  });

  it("auto-accept materializes the merge and leaves no pending proposal", async () => {
    const t = convexTest(schema, modules);
    await seedNearDup(t);

    const pass = await t.mutation(internal.dreamMode.runDreamPassInternal, {
      clerkId: USER,
      profileId: PROFILE,
      kind: "personal",
      autoAccept: true,
    });
    expect(pass.memoriesMaterialized).toBeGreaterThanOrEqual(1);
    expect(pass.proposalsCreated).toBe(0);

    const pending = await t.query(
      internal.proposedUpdateApi.listPendingInternal,
      { userId: USER, profileId: PROFILE },
    );
    expect(pending).toEqual([]);

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      { userId: USER, profileId: PROFILE, limit: 20, offset: 0 },
    );
    expect(
      listed.memories.some((memory) => memory.source === "dream-merge"),
    ).toBe(true);
    expect(listed.memories.some((memory) => memory.id === "dup_a")).toBe(false);
  });

  it("rejects a pending proposal without changing memories", async () => {
    const t = convexTest(schema, modules);
    await seedNearDup(t);
    await t.mutation(internal.dreamMode.runDreamPassInternal, {
      clerkId: USER,
      profileId: PROFILE,
      kind: "personal",
      autoAccept: false,
    });
    const pending = await t.query(
      internal.proposedUpdateApi.listPendingInternal,
      { userId: USER, profileId: PROFILE },
    );
    const proposal = pending[0];
    expect(proposal).toBeDefined();
    if (proposal === undefined) return;

    const rejected = await t.mutation(
      internal.proposedUpdateApi.resolveInternal,
      {
        clerkId: USER,
        proposalId: proposal.id,
        action: "reject",
      },
    );
    expect(rejected).toEqual({ status: "rejected" });

    const listed = await t.query(
      internal.memoryStore.functions.listMemoriesInternal,
      { userId: USER, profileId: PROFILE, limit: 20, offset: 0 },
    );
    expect(listed.memories.map((memory) => memory.id).sort()).toEqual([
      "dup_a",
      "dup_b",
    ]);
  });

  it("skips creating a proposal when Jev rejects the cluster", async () => {
    const t = convexTest(schema, modules);
    await seedNearDup(t);

    const pass = await t.mutation(internal.dreamMode.runDreamPassInternal, {
      clerkId: USER,
      profileId: PROFILE,
      kind: "personal",
      autoAccept: false,
      clusterGates: [
        {
          sourceMemoryIds: ["dup_a", "dup_b"],
          outcome: "reject",
          keeperId: "dup_a",
          safeToAutoAccept: false,
          mergeNoul: 0.12,
        },
      ],
    });
    expect(pass.clustersScanned).toBeGreaterThanOrEqual(1);
    expect(pass.proposalsCreated).toBe(0);
    expect(pass.memoriesMaterialized).toBe(0);
    expect(pass.jevRejected).toBeGreaterThanOrEqual(1);
    expect(pass.failOpen).toBe(0);

    const pending = await t.query(
      internal.proposedUpdateApi.listPendingInternal,
      { userId: USER, profileId: PROFILE },
    );
    expect(pending).toEqual([]);
  });

  it("uses Jev's keeper when the gate approves an override", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      memoryId: "dup_a",
      userId: USER,
      profileId: PROFILE,
      title: "Use pnpm for vmem",
      content: "Use pnpm",
      type: "knowledge",
      source: "api",
      tags: ["tooling"],
      confidence: 0.9,
    });
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      memoryId: "dup_b",
      userId: USER,
      profileId: PROFILE,
      title: "Use pnpm for vmem",
      content: "Use pnpm for vmem",
      type: "knowledge",
      source: "api",
      tags: ["tooling"],
      confidence: 0.9,
    });

    const pass = await t.mutation(internal.dreamMode.runDreamPassInternal, {
      clerkId: USER,
      profileId: PROFILE,
      kind: "personal",
      autoAccept: false,
      clusterGates: [
        {
          sourceMemoryIds: ["dup_b", "dup_a"],
          outcome: "approve",
          keeperId: "dup_a",
          safeToAutoAccept: false,
          mergeNoul: 0.9,
          keeperConfidence: 0.8,
        },
      ],
    });
    expect(pass.jevApproved).toBeGreaterThanOrEqual(1);
    expect(pass.failOpen).toBe(0);

    const pending = await t.query(
      internal.proposedUpdateApi.listPendingInternal,
      { userId: USER, profileId: PROFILE },
    );
    const merge = pending.find((proposal) => proposal.kind === "merge");
    expect(merge?.memoryId).toBe("dup_a");
    expect(merge?.proposedContent).toBe("Use pnpm");
  });

  it("leaves an approved merge in the inbox when Jev says it is not safe to auto-accept", async () => {
    const t = convexTest(schema, modules);
    await seedNearDup(t);

    const pass = await t.mutation(internal.dreamMode.runDreamPassInternal, {
      clerkId: USER,
      profileId: PROFILE,
      kind: "personal",
      autoAccept: true,
      clusterGates: [
        {
          sourceMemoryIds: ["dup_a", "dup_b"],
          outcome: "approve",
          keeperId: "dup_a",
          safeToAutoAccept: false,
          mergeNoul: 0.88,
          autoAcceptNoul: 0.2,
        },
      ],
    });
    expect(pass.proposalsCreated).toBeGreaterThanOrEqual(1);
    expect(pass.memoriesMaterialized).toBe(0);
    expect(pass.jevApproved).toBeGreaterThanOrEqual(1);

    const pending = await t.query(
      internal.proposedUpdateApi.listPendingInternal,
      { userId: USER, profileId: PROFILE },
    );
    expect(pending.some((proposal) => proposal.kind === "merge")).toBe(true);
  });
});
