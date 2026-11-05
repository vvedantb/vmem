import type * as Ai from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  createConvexBackend,
  mcpCaller,
  signUp,
  type ConvexTestBackend,
} from "./convexHarness";

// no network: any AI call fails the test
const evaluate = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const embedMany = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  experimental_evaluate: evaluate,
  generateText,
  embedMany,
}));

const ALICE = "clerk_conflict_alice";
const BOB = "clerk_conflict_bob";

const conflictSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(),
});
const addSchema = z.object({
  id: z.string(),
  source: z.string(),
  deduped: z.boolean().optional(),
  conflicts: z.array(conflictSchema).optional(),
  superseded: z.number().optional(),
});
const batchSchema = z.object({
  created: z.array(
    z.object({
      id: z.string(),
      conflicts: z.array(conflictSchema).optional(),
      superseded: z.number().optional(),
    }),
  ),
});
const historySchema = z.object({
  priorVersions: z.array(z.object({ id: z.string() })),
});
const searchSchema = z.object({
  memories: z.array(z.object({ id: z.string() })),
});
const recallSchema = z.object({
  text: z.string(),
  memoryIds: z.array(z.string()),
  hiddenDuplicates: z
    .array(z.object({ id: z.string(), keptId: z.string() }))
    .optional(),
});

const fact = (content: string) => ({
  title: "Deploy target",
  content,
  type: "knowledge",
  source: "claude",
});

async function setup() {
  const t = createConvexBackend();
  await signUp(t, ALICE, "alice@example.com");
  await signUp(t, BOB, "bob@example.com");
  return { t, alice: mcpCaller(t, ALICE), bob: mcpCaller(t, BOB) };
}

async function docId(
  t: ConvexTestBackend,
  memoryId: string,
): Promise<Id<"memories">> {
  const doc = await t.run((ctx) =>
    ctx.db
      .query("memories")
      .withIndex("by_memory_id", (q) => q.eq("memoryId", memoryId))
      .first(),
  );
  if (doc === null) throw new Error(`no memory ${memoryId}`);
  return doc._id;
}

async function openPair(
  t: ConvexTestBackend,
  newer: string,
  older: string,
  kind: "near_dup" | "maybe_conflict",
): Promise<void> {
  const memoryId = await docId(t, newer);
  const neighborId = await docId(t, older);
  await t.run((ctx) =>
    ctx.db.insert("dreamCandidates", {
      userId: ALICE,
      memoryId,
      neighborId,
      pairKey: `${memoryId}|${neighborId}`,
      score: kind === "near_dup" ? 0.98 : 0.9,
      kind,
      status: "open",
      createdAt: Date.now(),
    }),
  );
}

beforeEach(() => {
  embedMany.mockRejectedValue(new Error("no network in tests"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("memory_add conflicts and supersedes (convex-test backend)", () => {
  // convex-test full-text search matches one case-sensitive word prefix, not
  // any term like Convex, so these fixtures use one lowercase word (the
  // Jaccard rule is unit-tested on real sentences in memoryLineHelpers.test.ts)
  it("stores the new memory and lists near matches as conflicts", async () => {
    const { alice } = await setup();
    const first = addSchema.parse(
      await alice.call("memory_add", { ...fact("vercel!"), title: "vercel" }),
    );
    expect(first.conflicts).toBeUndefined();
    await alice.call("memory_add", { ...fact("Oat latte"), title: "Coffee" });

    const second = addSchema.parse(
      await alice.call("memory_add", { ...fact("vercel"), title: "vercel" }),
    );
    expect(second.id).not.toBe(first.id);
    expect(second.deduped).toBeUndefined();
    expect(second.superseded).toBeUndefined();
    expect(second.conflicts).toEqual([
      { id: first.id, content: "vercel!", createdAt: expect.any(String) },
    ]);
    expect(
      Number.isFinite(Date.parse(second.conflicts?.[0]?.createdAt ?? "")),
    ).toBe(true);
    // both rows stay visible: a conflict is a hint, not a supersede
    const listed = searchSchema.parse(await alice.call("memory_search", {}));
    expect(listed.memories).toHaveLength(3);
    expect(evaluate).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("supersedes retires the given ids as prior versions, own scope only", async () => {
    const { alice, bob } = await setup();
    const old = addSchema.parse(
      await alice.call(
        "memory_add",
        fact("Production deploys go to Heroku from main"),
      ),
    );
    const bobs = addSchema.parse(
      await bob.call("memory_add", fact("Bob deploys to Render")),
    );

    const next = addSchema.parse(
      await alice.call("memory_add", {
        ...fact("Production deploys go to Vercel from main"),
        supersedes: [old.id, bobs.id],
      }),
    );
    expect(next.superseded).toBe(1);
    // the retired row is not reported as a conflict
    expect(next.conflicts).toBeUndefined();

    const history = historySchema.parse(
      await alice.call("memory_history", { memoryId: next.id }),
    );
    expect(history.priorVersions.map((row) => row.id)).toEqual([old.id]);
    const listed = searchSchema.parse(await alice.call("memory_search", {}));
    expect(listed.memories.map((row) => row.id)).toEqual([next.id]);
    // bob's memory is untouched
    const bobListed = searchSchema.parse(await bob.call("memory_search", {}));
    expect(bobListed.memories.map((row) => row.id)).toEqual([bobs.id]);
  });

  it("memory_add_batch returns conflicts and superseded per item", async () => {
    const { alice } = await setup();
    const old = addSchema.parse(
      await alice.call("memory_add", { ...fact("vercel!"), title: "vercel" }),
    );
    const batch = batchSchema.parse(
      await alice.call("memory_add_batch", {
        items: [
          { ...fact("vercel"), title: "vercel" },
          { ...fact("Fly from develop"), supersedes: [old.id] },
        ],
      }),
    );
    expect(batch.created[0]?.conflicts?.map((row) => row.id)).toEqual([old.id]);
    expect(batch.created[1]?.superseded).toBe(1);
  });
});

describe("MCP write source (convex-test backend)", () => {
  it("records the stored client name over the agent's source", async () => {
    const { t, alice } = await setup();
    const before = addSchema.parse(
      await alice.call("memory_add", fact("Deploys go to Heroku")),
    );
    expect(before.source).toBe("claude");

    await t.mutation(internal.mcp.clientInfo.recordClientNameInternal, {
      clerkId: ALICE,
      name: "Cursor",
    });
    const after = addSchema.parse(
      await alice.call("memory_add", {
        ...fact("Coffee is an oat latte"),
        title: "Coffee",
      }),
    );
    expect(after.source).toBe("cursor");
  });
});

describe("open dream pairs in recall_context (convex-test backend)", () => {
  it("shows only the newer row of a near-dup pair, with date and source", async () => {
    const { t, alice } = await setup();
    const old = addSchema.parse(
      await alice.call("memory_add", fact("Deploys go to Heroku")),
    );
    const current = addSchema.parse(
      await alice.call("memory_add", {
        ...fact("Deploys go to Vercel now"),
        title: "Deploy target update",
      }),
    );
    await openPair(t, current.id, old.id, "near_dup");

    const recall = recallSchema.parse(
      await alice.call("recall_context", { message: "deploy target" }),
    );
    expect(recall.memoryIds).toEqual([current.id]);
    expect(recall.hiddenDuplicates).toEqual([
      { id: old.id, keptId: current.id },
    ]);
    expect(recall.text).not.toContain("Heroku");
    expect(recall.text).toMatch(
      /Deploys go to Vercel now \(saved \d{4}-\d{2}-\d{2}, via claude\)/u,
    );
  });

  it("marks both rows of a maybe-conflict pair", async () => {
    const { t, alice } = await setup();
    const old = addSchema.parse(
      await alice.call("memory_add", fact("Deploys go to Heroku")),
    );
    const current = addSchema.parse(
      await alice.call("memory_add", {
        ...fact("Deploys go to Vercel now"),
        title: "Deploy target update",
      }),
    );
    await openPair(t, current.id, old.id, "maybe_conflict");

    const recall = recallSchema.parse(
      await alice.call("recall_context", { message: "deploy target" }),
    );
    expect([...recall.memoryIds].sort()).toEqual([old.id, current.id].sort());
    expect(recall.hiddenDuplicates).toBeUndefined();
    expect(recall.text).toContain(`may conflict with ${old.id}`);
    expect(recall.text).toContain(`may conflict with ${current.id}`);
  });
});
