import { describe, expect, it } from "vitest";
import { z } from "zod";
import { internal } from "../../convex/_generated/api";
import {
  createConvexBackend,
  mcpCaller,
  signUp,
  type ConvexTestBackend,
} from "./convexHarness";

const ALICE = "clerk_recall_prelude";
const idSchema = z.object({ id: z.string() });

async function seedAlice(t: ConvexTestBackend): Promise<void> {
  await signUp(t, ALICE, "prelude@example.com");
  await mcpCaller(t, ALICE).call("skills_create", {
    name: "deploy-check",
    description: "Use when shipping a deploy",
    instructions: "Run the full CI before a deploy",
  });
}

describe("recallPrelude.getInternal", () => {
  it("returns the scope profile, skill index, prompt cache and embedding row in one read", async () => {
    const t = createConvexBackend();
    await seedAlice(t);
    const userId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", ALICE))
        .unique();
      if (user === null) throw new Error("no user");
      // sign-up may have made a placeholder row already
      const prompt = {
        content: "# Profile\n\nLikes tea.",
        generatedAt: 1,
        memoryCountAtGeneration: 0,
        pendingRegeneration: false,
      };
      const existing = await ctx.db
        .query("contextPromptCache")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();
      if (existing === null) {
        await ctx.db.insert("contextPromptCache", {
          userId: user._id,
          ...prompt,
        });
      } else {
        await ctx.db.patch(existing._id, prompt);
      }
      await ctx.db.insert("queryEmbeddingCache", {
        key: "k1",
        embedding: [0.5],
        expiresAt: 42,
      });
      return user._id;
    });

    const prelude = await t.query(internal.mcp.recallPrelude.getInternal, {
      clerkId: ALICE,
      scope: "personal",
      embeddingKey: "k1",
    });
    expect(prelude.profileId).toBe(
      await t.query(internal.profiles.resolveProfileIdForMcpScopeInternal, {
        clerkId: ALICE,
        scope: "personal",
      }),
    );
    expect(prelude.skills.map((skill) => skill.name)).toContain("deploy-check");
    // index slices only: skill instructions are not sent back
    expect(prelude.skills.every((skill) => !("instructions" in skill))).toBe(
      true,
    );
    expect(prelude.profile).toBe("# Profile\n\nLikes tea.");
    expect(prelude.embeddingHit).toEqual({ embedding: [0.5], expiresAt: 42 });
    expect(prelude.userId).toBe(userId);

    const noKey = await t.query(internal.mcp.recallPrelude.getInternal, {
      clerkId: ALICE,
      scope: "personal",
    });
    expect(noKey.embeddingHit).toBeNull();
  });

  it("leaves the profile out when the prompt was never generated", async () => {
    const t = createConvexBackend();
    await seedAlice(t);
    const prelude = await t.query(internal.mcp.recallPrelude.getInternal, {
      clerkId: ALICE,
      scope: "personal",
    });
    expect(prelude.profile).toBeNull();
  });

  it("fails like the scope read for a profile the user cannot use", async () => {
    const t = createConvexBackend();
    await seedAlice(t);
    const args: { clerkId: string; scope: "personal"; profileId: string } = {
      clerkId: ALICE,
      scope: "personal",
      profileId: "not-a-profile",
    };
    const scopeError = await t
      .query(internal.profiles.resolveProfileIdForMcpScopeInternal, args)
      .catch((err: unknown) => err);
    if (!(scopeError instanceof Error)) throw new Error("scope read passed");
    await expect(
      t.query(internal.mcp.recallPrelude.getInternal, args),
    ).rejects.toThrow(scopeError.message);
  });
});

describe("listMemoryGraphAroundInternal", () => {
  it("returns the links and the capped neighbours outside the seeds", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "prelude@example.com");
    const alice = mcpCaller(t, ALICE);
    const ids: string[] = [];
    for (const title of ["Seed", "One hop", "Two hops"]) {
      const created = await alice.call("memory_add", {
        title,
        content: `${title} memory`,
        type: "knowledge",
        source: "mcp",
      });
      ids.push(idSchema.parse(created).id);
    }
    const [seed, oneHop, twoHops] = ids;
    if (seed === undefined || oneHop === undefined || twoHops === undefined) {
      throw new Error("fixture memories missing");
    }
    const links: Array<[string, string]> = [
      [seed, oneHop],
      [oneHop, twoHops],
    ];
    for (const [a, b] of links) {
      await t.mutation(internal.memoryStore.functions.linkMemoriesInternal, {
        userId: ALICE,
        memoryIdA: a,
        memoryIdB: b,
        reason: "fixture",
      });
    }
    const graph = (neighborCap: number) =>
      t.query(internal.memoryStore.functions.listMemoryGraphAroundInternal, {
        userId: ALICE,
        seedIds: [seed],
        hops: 3,
        neighborLimit: 40,
        neighborMaxHops: 2,
        neighborCap,
      });

    const all = await graph(5);
    expect(all.links).toHaveLength(2);
    expect(all.neighbors.map((memory) => memory.id)).toEqual([oneHop, twoHops]);
    expect((await graph(1)).neighbors.map((memory) => memory.id)).toEqual([
      oneHop,
    ]);
    const none = await graph(0);
    expect(none.links).toEqual(all.links);
    expect(none.neighbors).toEqual([]);
  });
});
