import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TRANSCRIPT_MAX_BYTES } from "../../engine/memory/dream/transcriptDistill";
import {
  createConvexBackend,
  mcpCaller,
  signUp,
  type ConvexTestBackend,
} from "./convexHarness";

const ALICE = "clerk_transcript_alice";
const BOB = "clerk_transcript_bob";

const receiptSchema = z.object({
  id: z.string(),
  status: z.literal("pending"),
  source: z.string(),
  byteLength: z.number(),
  createdAt: z.string(),
});

async function setup() {
  const t = createConvexBackend();
  const alice = await signUp(t, ALICE, "alice@example.com");
  const bob = await signUp(t, BOB, "bob@example.com");
  return { t, alice, bob };
}

async function transcriptRows(t: ConvexTestBackend) {
  return await t.run((ctx) => ctx.db.query("sessionTranscripts").collect());
}

describe("transcript_submit (convex-test backend)", () => {
  it("stores the text and a pending row with the connected app as source", async () => {
    const { t, alice } = await setup();
    const caller = mcpCaller(t, ALICE, "personal", undefined, {
      clientName: "claude-code",
      connectionKeys: [],
    });
    const text = '{"role":"user","content":"I deploy with pnpm — café"}\n';

    const receipt = receiptSchema.parse(
      await caller.call("transcript_submit", {
        transcript: text,
        title: "  Deploy session  ",
      }),
    );

    const bytes = new TextEncoder().encode(text).byteLength;
    expect(receipt).toMatchObject({
      status: "pending",
      source: "claude-code",
      byteLength: bytes,
    });
    expect(Number.isFinite(Date.parse(receipt.createdAt))).toBe(true);
    const [row] = await transcriptRows(t);
    expect(row).toMatchObject({
      _id: receipt.id,
      userId: ALICE,
      profileId: alice.profileId,
      source: "claude-code",
      title: "Deploy session",
      status: "pending",
      byteLength: bytes,
      attempts: 0,
    });
    const storageId = row?.storageId;
    if (storageId === undefined) throw new Error("no stored text");
    const stored = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(storageId);
      return blob === null ? null : await blob.text();
    });
    expect(stored).toBe(text);
  });

  it('falls back to source "mcp" when the app is unknown', async () => {
    const { t } = await setup();
    const receipt = receiptSchema.parse(
      await mcpCaller(t, ALICE).call("transcript_submit", {
        transcript: "user: hi",
      }),
    );
    expect(receipt.source).toBe("mcp");
    const [row] = await transcriptRows(t);
    expect(row?.title).toBeUndefined();
  });

  it("refuses a transcript over 1.5 MB or an empty one, and stores nothing", async () => {
    const { t } = await setup();
    const caller = mcpCaller(t, ALICE);
    await expect(
      caller.call("transcript_submit", {
        transcript: "a".repeat(TRANSCRIPT_MAX_BYTES + 1),
      }),
    ).rejects.toThrow(/limit is 1,572,864 bytes/);
    await expect(
      caller.call("transcript_submit", { transcript: "   " }),
    ).rejects.toThrow(/empty/);
    await expect(caller.call("transcript_submit", {})).rejects.toThrow();
    expect(await transcriptRows(t)).toEqual([]);
  });

  it("accepts exactly 1.5 MB", async () => {
    const { t } = await setup();
    const receipt = receiptSchema.parse(
      await mcpCaller(t, ALICE).call("transcript_submit", {
        transcript: "a".repeat(TRANSCRIPT_MAX_BYTES),
      }),
    );
    expect(receipt.byteLength).toBe(TRANSCRIPT_MAX_BYTES);
  });

  it("refuses another user's profile", async () => {
    const { t, bob } = await setup();
    await expect(
      mcpCaller(t, ALICE).call("transcript_submit", {
        transcript: "user: hi",
        profileId: bob.profileId,
      }),
    ).rejects.toThrow();
    expect(await transcriptRows(t)).toEqual([]);
  });
});
