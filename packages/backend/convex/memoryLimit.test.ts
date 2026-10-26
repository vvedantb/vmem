/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { FREE_MEMORY_LIMIT, MEMORY_LIMIT_CODE } from "@vmem/shared";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_limit_user";
const AT = 1_700_000_000_000;

type Harness = ReturnType<typeof convexTest>;

async function seed(t: Harness, count: number, planSlugs: string[]) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { clerkId: USER, planSlugs });
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

const create = internal.memoryStore.functions.createMemoryInternal;

describe("memory cap", () => {
  it("lets a Free user create under the cap", async () => {
    const t = convexTest(schema, modules);
    await seed(t, FREE_MEMORY_LIMIT - 1, []);
    const created = await t.mutation(create, createArgs("new_1"));
    expect(created.id).toBe("new_1");
  });

  it("blocks a Free user at the cap", async () => {
    const t = convexTest(schema, modules);
    await seed(t, FREE_MEMORY_LIMIT, []);
    await expect(t.mutation(create, createArgs("new_1"))).rejects.toThrow(
      MEMORY_LIMIT_CODE,
    );
  });

  it("does not block an existing-id return at the cap", async () => {
    const t = convexTest(schema, modules);
    await seed(t, FREE_MEMORY_LIMIT, []);
    const again = await t.mutation(create, createArgs("seed_0"));
    expect(again.id).toBe("seed_0");
  });

  it.each(["v_pro", "vibot_pro"])(
    "lets a %s user create at the cap",
    async (slug) => {
      const t = convexTest(schema, modules);
      await seed(t, FREE_MEMORY_LIMIT + 1, [slug]);
      const created = await t.mutation(create, createArgs("new_1"));
      expect(created.id).toBe("new_1");
    },
  );

  it("lets a Free user over the cap update and delete", async () => {
    const t = convexTest(schema, modules);
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
});
