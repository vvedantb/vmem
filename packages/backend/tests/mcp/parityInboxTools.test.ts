import { describe, expect, it } from "vitest";
import { z } from "zod";
import { api, internal } from "../../convex/_generated/api";
import { inboxToolSpecs } from "../../convex/mcp/toolsInbox";
import { insertProposedUpdate } from "../../convex/proposedUpdateStore";
import {
  asUser,
  createConvexBackend,
  mcpCaller,
  signUp,
  type ConvexTestBackend,
} from "./convexHarness";

const ALICE = "clerk_inbox_alice";
const BOB = "clerk_inbox_bob";

const proposalListSchema = z.array(
  z.object({ id: z.string(), kind: z.string(), status: z.string() }),
);
const notificationListSchema = z.object({
  unreadCount: z.number(),
  notifications: z.array(
    z.object({ id: z.string(), title: z.string(), read: z.boolean() }),
  ),
});
const dreamResultSchema = z.object({
  reason: z.string(),
  runIds: z.array(z.string()),
  counts: z.object({ exactMerged: z.number() }),
});

const dreamHistorySchema = z.array(
  z.object({
    runId: z.string(),
    trigger: z.string(),
    dryRun: z.boolean(),
    status: z.string(),
    counts: z.object({ exactMerged: z.number() }),
  }),
);

async function seedNearDuplicates(
  t: ConvexTestBackend,
  clerkId: string,
  profileId: string,
): Promise<void> {
  for (const memoryId of ["dup_a", "dup_b"]) {
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      memoryId: `${clerkId}_${memoryId}`,
      userId: clerkId,
      profileId,
      title: "Use pnpm for vmem",
      content: "Use pnpm for vmem",
      type: "knowledge",
      source: "api",
      tags: ["tooling"],
      confidence: 0.9,
      // dream fixtures seed exact duplicates on purpose
      skipHashDedupe: true,
    });
  }
  const ids = ["dup_a", "dup_b"].map((id) => `${clerkId}_${id}`);
  await t.run(async (ctx) => {
    await insertProposedUpdate(ctx, {
      userId: clerkId,
      profileId,
      memoryId: `${clerkId}_dup_a`,
      proposedTitle: "Use pnpm for vmem",
      proposedContent: "Use pnpm for vmem",
      reason: "Near-duplicate records of the same information",
      kind: "merge",
      sourceMemoryIds: ids,
      source: "dream-mode",
      sourceMemorySnapshots: ids.map((id) => ({
        id,
        title: "Use pnpm for vmem",
        content: "Use pnpm for vmem",
      })),
    });
  });
}

describe("MCP inbox parity tools (convex-test backend)", () => {
  it("proposals_list / proposals_resolve stay inside the caller's profiles", async () => {
    const t = createConvexBackend();
    const alice = await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    await seedNearDuplicates(t, ALICE, alice.profileId);
    const aliceMcp = mcpCaller(t, ALICE);
    const bobMcp = mcpCaller(t, BOB);

    const pending = proposalListSchema.parse(
      await aliceMcp.call("proposals_list"),
    );
    const merge = pending.find((proposal) => proposal.kind === "merge");
    expect(merge).toBeDefined();
    if (merge === undefined) return;

    expect(await bobMcp.call("proposals_list")).toEqual([]);
    await expect(
      bobMcp.call("proposals_list", { profileId: alice.profileId }),
    ).rejects.toThrow(/Profile not found/);
    await expect(
      bobMcp.call("proposals_resolve", {
        proposalId: merge.id,
        action: "approve",
      }),
    ).rejects.toThrow(/Proposal not found/);

    expect(
      inboxToolSpecs.proposals_resolve.schema.safeParse({
        proposalId: merge.id,
        action: "maybe",
      }).success,
    ).toBe(false);
    await expect(
      aliceMcp.call("proposals_resolve", {
        proposalId: merge.id,
        action: "approve",
        winnerMemoryId: "not_a_source",
      }),
    ).rejects.toThrow(/winnerMemoryId/);

    expect(
      await aliceMcp.call("proposals_resolve", {
        proposalId: merge.id,
        action: "reject",
      }),
    ).toEqual({ status: "rejected" });
    expect(
      proposalListSchema
        .parse(await aliceMcp.call("proposals_list"))
        .some((proposal) => proposal.id === merge.id),
    ).toBe(false);
  });

  it("web resolveProposal refuses a proposal in another user's profile", async () => {
    const t = createConvexBackend();
    const alice = await signUp(t, ALICE, "alice@example.com");
    const bob = await signUp(t, BOB, "bob@example.com");
    await seedNearDuplicates(t, ALICE, alice.profileId);
    const merge = proposalListSchema
      .parse(await mcpCaller(t, ALICE).call("proposals_list"))
      .find((proposal) => proposal.kind === "merge");
    if (merge === undefined) throw new Error("expected a merge proposal");

    const bobWeb = asUser(t, BOB, "bob@example.com");
    // before the fix any existing profile id passed: bob approved alice's merge
    for (const profileId of [undefined, bob.profileId]) {
      expect(
        await bobWeb.action(api.proposedUpdateApi.resolveProposal, {
          proposalId: merge.id,
          action: "approve",
          profileId,
        }),
      ).toBeNull();
    }
    await expect(
      bobWeb.action(api.proposedUpdateApi.resolveProposal, {
        proposalId: merge.id,
        action: "approve",
        profileId: alice.profileId,
      }),
    ).rejects.toThrow(/not accessible/);
    expect(
      proposalListSchema
        .parse(await mcpCaller(t, ALICE).call("proposals_list"))
        .some((proposal) => proposal.id === merge.id),
    ).toBe(true);

    const aliceWeb = asUser(t, ALICE, "alice@example.com");
    expect(
      await aliceWeb.action(api.proposedUpdateApi.resolveProposal, {
        proposalId: merge.id,
        action: "reject",
        profileId: alice.profileId,
      }),
    ).toEqual({ status: "rejected" });
  });

  it("dream_run runs the nightly pass, returns the run id and is rate limited", async () => {
    const t = createConvexBackend();
    const alice = await signUp(t, ALICE, "alice@example.com");
    await seedNearDuplicates(t, ALICE, alice.profileId);
    const aliceMcp = mcpCaller(t, ALICE);

    const first = dreamResultSchema.parse(await aliceMcp.call("dream_run"));
    expect(first.reason).toBe("ok");
    expect(first.runIds).toHaveLength(1);
    expect(first.counts.exactMerged).toBe(1);
    const runs = await t.run(async (ctx) =>
      ctx.db.query("dreamRuns").collect(),
    );
    expect(runs).toEqual([
      expect.objectContaining({
        _id: first.runIds[0],
        userId: alice.userId,
        trigger: "manual",
        status: "ok",
      }),
    ]);
    const second = dreamResultSchema.parse(await aliceMcp.call("dream_run"));
    expect(second.reason).toBe("rate-limited");
    expect(second.runIds).toEqual([]);
    await expect(mcpCaller(t, ALICE, "team").call("dream_run")).rejects.toThrow(
      /not available on team/,
    );
  });

  it("dream_history lists the caller's recent runs with counts only", async () => {
    const t = createConvexBackend();
    const alice = await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    await seedNearDuplicates(t, ALICE, alice.profileId);
    const aliceMcp = mcpCaller(t, ALICE);
    const run = dreamResultSchema.parse(await aliceMcp.call("dream_run"));

    const history = dreamHistorySchema.parse(
      await aliceMcp.call("dream_history"),
    );
    expect(history).toEqual([
      expect.objectContaining({
        runId: run.runIds[0],
        trigger: "manual",
        dryRun: false,
        status: "ok",
        counts: expect.objectContaining({ exactMerged: 1 }),
      }),
    ]);
    expect(JSON.stringify(history)).not.toContain("Use pnpm for vmem");
    expect(
      dreamHistorySchema.parse(await mcpCaller(t, BOB).call("dream_history")),
    ).toEqual([]);
    await expect(
      mcpCaller(t, ALICE, "team").call("dream_history"),
    ).rejects.toThrow(/not available on team/);
  });

  it("notifications tools only touch the caller's notifications", async () => {
    const t = createConvexBackend();
    const alice = await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    for (const title of ["First", "Second"]) {
      await t.mutation(internal.notifications.pushInternal, {
        userId: alice.userId,
        title,
        description: `${title} body`,
        type: "info",
      });
    }
    const aliceMcp = mcpCaller(t, ALICE);
    const bobMcp = mcpCaller(t, BOB);

    const listed = notificationListSchema.parse(
      await aliceMcp.call("notifications_list"),
    );
    expect(listed.unreadCount).toBe(2);
    const [newest, oldest] = listed.notifications;
    if (newest === undefined || oldest === undefined) {
      throw new Error("expected two notifications");
    }

    expect(
      notificationListSchema.parse(await bobMcp.call("notifications_list")),
    ).toEqual({ unreadCount: 0, notifications: [] });
    await expect(
      bobMcp.call("notifications_mark", { id: newest.id, read: true }),
    ).rejects.toThrow(/Notification not found/);
    await expect(
      bobMcp.call("notifications_delete", { id: newest.id }),
    ).rejects.toThrow(/Notification not found/);
    await expect(
      aliceMcp.call("notifications_delete", { id: "not-an-id" }),
    ).rejects.toThrow(/Notification not found/);
    await bobMcp.call("notifications_mark_all_read");
    expect(
      notificationListSchema.parse(await aliceMcp.call("notifications_list"))
        .unreadCount,
    ).toBe(2);

    await aliceMcp.call("notifications_mark", { id: newest.id, read: true });
    const unread = notificationListSchema.parse(
      await aliceMcp.call("notifications_list", { unreadOnly: true }),
    );
    expect(unread.notifications.map((row) => row.id)).toEqual([oldest.id]);

    await aliceMcp.call("notifications_mark_all_read");
    await aliceMcp.call("notifications_delete", { id: oldest.id });
    expect(
      notificationListSchema.parse(await aliceMcp.call("notifications_list")),
    ).toMatchObject({ unreadCount: 0, notifications: [{ id: newest.id }] });
  });
});
