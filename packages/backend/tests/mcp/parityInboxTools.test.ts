import { describe, expect, it } from "vitest";
import { z } from "zod";
import { api, internal } from "../../convex/_generated/api";
import { inboxToolSpecs } from "../../convex/mcp/toolsInbox";
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
const dreamResultSchema = z.object({ reason: z.string() });

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
    });
  }
  await t.mutation(internal.dreamMode.runDreamPassInternal, {
    clerkId,
    profileId,
    kind: "personal",
    autoAccept: false,
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

  it("dream_run uses the rate-limited manual path", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    const aliceMcp = mcpCaller(t, ALICE);

    const first = dreamResultSchema.parse(await aliceMcp.call("dream_run"));
    expect(first.reason).not.toBe("rate-limited");
    const second = dreamResultSchema.parse(await aliceMcp.call("dream_run"));
    expect(second.reason).toBe("rate-limited");
    await expect(mcpCaller(t, ALICE, "team").call("dream_run")).rejects.toThrow(
      /not available on team/,
    );
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
