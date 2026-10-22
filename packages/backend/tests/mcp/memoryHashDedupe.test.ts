import { describe, expect, it } from "vitest";
import { z } from "zod";
import { internal } from "../../convex/_generated/api";
import { createConvexBackend, mcpCaller, signUp } from "./convexHarness";

const ALICE = "clerk_hash_dedupe_alice";

const addSchema = z.object({
  id: z.string(),
  deduped: z.boolean().optional(),
});
const batchSchema = z.object({
  created: z.array(
    z.object({ id: z.string(), deduped: z.boolean().optional() }),
  ),
  failed: z.array(z.object({ index: z.number(), error: z.string() })),
});

const item = {
  title: "Prefers pnpm",
  content: "Use pnpm for vmem",
  type: "knowledge",
  source: "mcp",
};

async function setup() {
  const t = createConvexBackend();
  const { profileId } = await signUp(t, ALICE, "alice@example.com");
  const rowCount = async () => {
    const rows = await t.run((ctx) => ctx.db.query("memories").collect());
    return rows.filter((row) => row.profileId === profileId).length;
  };
  return { t, alice: mcpCaller(t, ALICE), profileId, rowCount };
}

describe("MCP exact-hash dedupe (convex-test backend)", () => {
  it("memory_add returns deduped: true on an exact repeat", async () => {
    const { t, alice, profileId, rowCount } = await setup();
    const first = addSchema.parse(await alice.call("memory_add", item));
    const repeat = addSchema.parse(
      await alice.call("memory_add", { ...item, source: "claude" }),
    );

    expect(first.deduped).toBeUndefined();
    expect(repeat).toEqual(expect.objectContaining({ id: first.id }));
    expect(repeat.deduped).toBe(true);
    expect(await rowCount()).toBe(1);

    const row = await t.query(
      internal.memoryStore.functions.getMemoryInternal,
      {
        userId: ALICE,
        memoryId: first.id,
      },
    );
    expect(row?.profileId).toBe(profileId);
  });

  it("memory_add_batch stores two identical items as one row", async () => {
    const { alice, rowCount } = await setup();
    const result = batchSchema.parse(
      await alice.call("memory_add_batch", { items: [item, item] }),
    );

    expect(result.failed).toEqual([]);
    const [first, repeat] = result.created;
    expect(result.created).toHaveLength(2);
    expect(repeat?.id).toBe(first?.id);
    expect(first?.deduped).toBeUndefined();
    expect(repeat?.deduped).toBe(true);
    expect(await rowCount()).toBe(1);
  });
});
