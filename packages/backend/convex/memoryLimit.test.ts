/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FREE_MEMORY_LIMIT, MEMORY_LIMIT_CODE } from "@vmem/shared";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_limit_user";
const AT = 1_700_000_000_000;

function newHarness() {
  return convexTest(schema, modules);
}

type Harness = ReturnType<typeof newHarness>;

async function seed(t: Harness, count: number, planSlugs: string[]) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { clerkId: USER, planSlugs });
    await ctx.db.insert("userMemoryCounts", { userId: USER, count });
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("memories", {
        memoryId: `seed_${String(i)}`,
        userId: USER,
        title: `Seed ${String(i)}`,
        content: `Seed content ${String(i)}`,
        type: "knowledge",
        source: "api",
        confidence: 1,
        status: "active",
        tags: [],
        createdAt: AT + i,
        updatedAt: AT + i,
        contentHash: `hash_${String(i)}`,
        visitCount: 1,
        firstVisitAt: AT + i,
        lastVisitAt: AT + i,
      });
    }
  });
}

function createArgs(memoryId: string) {
  return {
    memoryId,
    userId: USER,
    title: "New memory",
    content: "New content",
    type: "knowledge" as const,
    source: "api",
    tags: [],
    confidence: 0.9,
    contentHash: `new_${memoryId}`,
  };
}

async function readCount(t: Harness): Promise<number> {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query("userMemoryCounts")
      .withIndex("by_user", (q) => q.eq("userId", USER))
      .unique();
    return row?.count ?? 0;
  });
}

const create = internal.memoryStore.functions.createMemoryInternal;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("memory cap", () => {
  it("lets a Free user create under the cap", async () => {
    const t = newHarness();
    await seed(t, FREE_MEMORY_LIMIT - 1, []);
    const created = await t.mutation(create, createArgs("new_1"));
    expect(created.id).toBe("new_1");
  });

  it("blocks a Free user at the cap", async () => {
    const t = newHarness();
    await seed(t, FREE_MEMORY_LIMIT, []);
    await expect(t.mutation(create, createArgs("new_1"))).rejects.toThrow(
      MEMORY_LIMIT_CODE,
    );
  });

  it("does not block an existing-id return at the cap", async () => {
    const t = newHarness();
    await seed(t, FREE_MEMORY_LIMIT, []);
    const again = await t.mutation(create, createArgs("seed_0"));
    expect(again.id).toBe("seed_0");
  });

  it.each(["v_pro", "vibot_pro"])(
    "lets a %s user create at the cap",
    async (slug) => {
      const t = newHarness();
      await seed(t, FREE_MEMORY_LIMIT + 1, [slug]);
      const created = await t.mutation(create, createArgs("new_1"));
      expect(created.id).toBe("new_1");
    },
  );

  it("lets an allowlisted Free user create past the cap", async () => {
    vi.stubEnv("V_PRO_COMP_USER_IDS", `other_user, ${USER}`);
    const t = newHarness();
    await seed(t, FREE_MEMORY_LIMIT + 1, []);
    const created = await t.mutation(create, createArgs("new_1"));
    expect(created.id).toBe("new_1");
  });

  it("still blocks an unlisted Free user when the allowlist is set", async () => {
    vi.stubEnv("V_PRO_COMP_USER_IDS", "other_user");
    const t = newHarness();
    await seed(t, FREE_MEMORY_LIMIT, []);
    await expect(t.mutation(create, createArgs("new_1"))).rejects.toThrow(
      MEMORY_LIMIT_CODE,
    );
  });

  it("lets a Free user over the cap update and delete", async () => {
    const t = newHarness();
    await seed(t, FREE_MEMORY_LIMIT + 5, []);
    const updated = await t.mutation(
      internal.memoryStore.functions.updateMemoryInternal,
      { userId: USER, memoryId: "seed_0", title: "Edited" },
    );
    expect(updated?.title).toBe("Edited");
    const deleted = await t.mutation(
      internal.memoryStore.functions.deleteMemoryInternal,
      { userId: USER, memoryId: "seed_1" },
    );
    expect(deleted).toBe(true);
  });

  it("keeps the counter in step with create and delete", async () => {
    const t = newHarness();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: USER, planSlugs: [] });
    });
    expect(await readCount(t)).toBe(0);
    await t.mutation(create, createArgs("a"));
    expect(await readCount(t)).toBe(1);
    await t.mutation(create, createArgs("b"));
    expect(await readCount(t)).toBe(2);
    await t.mutation(create, createArgs("a"));
    expect(await readCount(t)).toBe(2);
    await t.mutation(internal.memoryStore.functions.deleteMemoryInternal, {
      userId: USER,
      memoryId: "a",
    });
    expect(await readCount(t)).toBe(1);
  });

  it("frees a slot at the cap after a delete", async () => {
    const t = newHarness();
    await seed(t, FREE_MEMORY_LIMIT, []);
    await t.mutation(internal.memoryStore.functions.deleteMemoryInternal, {
      userId: USER,
      memoryId: "seed_0",
    });
    expect(await readCount(t)).toBe(FREE_MEMORY_LIMIT - 1);
    await t.mutation(create, createArgs("new_1"));
    expect(await readCount(t)).toBe(FREE_MEMORY_LIMIT);
  });

  it("backfills counts from existing rows and is idempotent", async () => {
    vi.useFakeTimers();
    const t = newHarness();
    await seed(t, 3, []);
    await t.run(async (ctx) => {
      const row = await ctx.db.query("userMemoryCounts").first();
      if (row) await ctx.db.delete(row._id);
    });
    for (let run = 0; run < 2; run++) {
      await t.mutation(
        internal.userMemoryCounts.startUserMemoryCountBackfillInternal,
        {},
      );
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await readCount(t)).toBe(3);
    }
    vi.useRealTimers();
  });

  it("blocks at the cap when the counter row is missing (lazy recount)", async () => {
    const t = newHarness();
    await seed(t, FREE_MEMORY_LIMIT, []);
    await t.run(async (ctx) => {
      const row = await ctx.db.query("userMemoryCounts").first();
      if (row) await ctx.db.delete(row._id);
    });
    await expect(t.mutation(create, createArgs("new_1"))).rejects.toThrow(
      MEMORY_LIMIT_CODE,
    );
    // throw rolls back any in-tx counter write; backfill restores O(1) checks
    expect(await readCount(t)).toBe(0);
  });
});
