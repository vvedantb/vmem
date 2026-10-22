/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import { insertProposedUpdate } from "./proposedUpdateStore";
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
    skipHashDedupe: true,
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
    skipHashDedupe: true,
  });
}

// a pending dream merge proposal over dup_a + dup_b, as the cleanup apply
// writes one for an AI-flagged group
async function seedMergeProposal(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await insertProposedUpdate(ctx, {
      userId: USER,
      profileId: PROFILE,
      memoryId: "dup_a",
      proposedTitle: "Use pnpm for vmem",
      proposedContent: "Use pnpm for vmem",
      reason: "Near-duplicate records of the same information",
      kind: "merge",
      sourceMemoryIds: ["dup_a", "dup_b"],
      confidence: 1,
      source: "dream-mode",
      memorySnapshot: {
        title: "Use pnpm for vmem",
        content: "Use pnpm for vmem",
      },
      sourceMemorySnapshots: ["dup_a", "dup_b"].map((id) => ({
        id,
        title: "Use pnpm for vmem",
        content: "Use pnpm for vmem",
      })),
    });
  });
}

describe("proposed updates: dream merge proposals", () => {
  it("approving a merge proposal supersedes its sources", async () => {
    const t = convexTest(schema, modules);
    await seedNearDup(t);
    await seedMergeProposal(t);

    const pending = await t.query(
      internal.proposedUpdateApi.listPendingInternal,
      { userId: USER, profileId: PROFILE },
    );
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

  it("rejects a pending proposal without changing memories", async () => {
    const t = convexTest(schema, modules);
    await seedNearDup(t);
    await seedMergeProposal(t);
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
});
