import type * as Ai from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { internal } from "../../convex/_generated/api";
import type { ActionCtx } from "../../convex/_generated/server";
import { QUERY_EMBEDDING_CACHE_TTL_MS } from "../../convex/queryEmbeddingCache";
import { MEMORY_EMBEDDING_DIMENSIONS } from "../../engine/memory/searchableText";
import {
  createConvexBackend,
  mcpCaller,
  signUp,
  type ConvexTestBackend,
} from "./convexHarness";

// Pins recall_context output for a fixture that uses every retrieve leg:
// full-text hits, vector hits (hydrated from memoryEmbeddings) and graph
// neighbours from memoryLinks. The expected ids were recorded before the
// latency work, so a change in them is a relevance change.

const evaluate = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const embedMany = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  experimental_evaluate: evaluate,
  generateText,
  embedMany,
}));

const ALICE = "clerk_recall_parity";
const idSchema = z.object({ id: z.string() });
const recallSchema = z.object({
  text: z.string(),
  memoryIds: z.array(z.string()),
  skillNames: z.array(z.string()),
});

const FIXTURE: Array<{ key: string; title: string; content: string }> = [
  {
    key: "deploy",
    title: "Deploy pipeline",
    content: "We deploy the web app to Vercel from main after CI passes.",
  },
  {
    key: "rollback",
    title: "Rollback steps",
    content: "To roll back a release, promote the previous Vercel build.",
  },
  {
    key: "ci",
    title: "CI checks",
    content: "CI runs typecheck, lint and vitest before any deploy.",
  },
  {
    key: "convex",
    title: "Convex prod",
    content: "The Convex prod deployment lives in eu-west-1.",
  },
  {
    key: "oncall",
    title: "On-call rota",
    content: "Alex covers on-call on Mondays and Tuesdays.",
  },
  {
    key: "coffee",
    title: "Coffee order",
    content: "Prefers a flat white with oat milk.",
  },
  {
    key: "editor",
    title: "Editor",
    content: "Uses Neovim with a tokyonight theme.",
  },
  {
    key: "release",
    title: "Release notes",
    content: "Release notes go in the changelog folder each month.",
  },
  {
    key: "staging",
    title: "Staging host",
    content: "Staging runs at vmem-staging and mirrors prod config.",
  },
  {
    key: "secrets",
    title: "Secrets",
    content: "Secrets live in the Convex dashboard, not in the repo.",
  },
  {
    key: "pager",
    title: "Pager",
    content: "PagerDuty pages the on-call engineer for prod incidents.",
  },
  {
    key: "gym",
    title: "Gym",
    content: "Goes to the gym on Thursday evenings.",
  },
];

// vector "similarity" per memory; memories without an entry get no vector hit
const VECTOR_SCORES: Record<string, number> = {
  rollback: 0.81,
  staging: 0.77,
  convex: 0.74,
  deploy: 0.7,
  secrets: 0.52,
  editor: 0.31,
};

const LINKS: Array<[string, string]> = [
  ["rollback", "pager"],
  ["pager", "oncall"],
  ["deploy", "release"],
];

function fakeVector(seed: number): number[] {
  return Array.from({ length: MEMORY_EMBEDDING_DIMENSIONS }, (_, i) =>
    i === seed ? 1 : 0,
  );
}

async function seed(t: ConvexTestBackend): Promise<{
  ids: Map<string, string>;
  vectorSearch: ActionCtx["vectorSearch"];
}> {
  await signUp(t, ALICE, "parity@example.com");
  const alice = mcpCaller(t, ALICE);
  const ids = new Map<string, string>();
  for (const memory of FIXTURE) {
    const created = await alice.call("memory_add", {
      title: memory.title,
      content: memory.content,
      type: "knowledge",
      source: "mcp",
    });
    ids.set(memory.key, idSchema.parse(created).id);
  }
  const idOf = (key: string): string => {
    const id = ids.get(key);
    if (id === undefined) throw new Error(`no fixture memory ${key}`);
    return id;
  };
  for (const [index, key] of Object.keys(VECTOR_SCORES).entries()) {
    await t.mutation(
      internal.memoryStore.functions.patchMemoryEmbeddingInternal,
      { memoryId: idOf(key), embedding: fakeVector(index) },
    );
  }
  for (const [a, b] of LINKS) {
    await t.mutation(internal.memoryStore.functions.linkMemoriesInternal, {
      userId: ALICE,
      memoryIdA: idOf(a),
      memoryIdB: idOf(b),
      reason: "fixture",
    });
  }
  const hits = await t.run(async (ctx) => {
    const out: Array<{ id: string; score: number }> = [];
    for (const [key, score] of Object.entries(VECTOR_SCORES)) {
      const doc = await ctx.db
        .query("memories")
        .withIndex("by_memory_id", (q) => q.eq("memoryId", idOf(key)))
        .unique();
      if (doc === null) continue;
      const row = await ctx.db
        .query("memoryEmbeddings")
        .withIndex("by_memory_doc", (q) => q.eq("memoryDocId", doc._id))
        .unique();
      if (row !== null) out.push({ id: row._id, score });
    }
    return out;
  });
  // vector order as a real index would return it: best score first
  const vectorSearch: ActionCtx["vectorSearch"] = async (tableName) =>
    t.run(async (ctx) =>
      hits.flatMap((hit) => {
        const id = ctx.db.normalizeId(tableName, hit.id);
        return id === null ? [] : [{ _id: id, _score: hit.score }];
      }),
    );
  return { ids, vectorSearch };
}

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  embedMany.mockResolvedValue({
    embeddings: [fakeVector(0)],
    usage: { tokens: 3 },
    providerMetadata: undefined,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const CASES: Array<{ message: string; expected: string[] }> = [
  {
    message: "how do I roll back a bad deploy?",
    expected: [
      "rollback",
      "deploy",
      "release",
      "pager",
      "ci",
      "staging",
      "convex",
      "secrets",
    ],
  },
  {
    message: "who is on call for prod incidents",
    expected: [
      "convex",
      "pager",
      "staging",
      "oncall",
      "rollback",
      "deploy",
      "secrets",
      "editor",
    ],
  },
  {
    message: "where are the convex secrets",
    expected: ["secrets", "convex", "rollback", "staging", "deploy", "editor"],
  },
];

describe("recall_context parity fixture", () => {
  for (const { message, expected } of CASES) {
    it(`returns the recorded memories for "${message}"`, async () => {
      const t = createConvexBackend();
      const { ids, vectorSearch } = await seed(t);
      const keyById = new Map([...ids].map(([key, id]) => [id, key]));
      const recall = recallSchema.parse(
        await mcpCaller(t, ALICE, "personal", vectorSearch).call(
          "recall_context",
          { message },
        ),
      );
      expect(recall.memoryIds.map((id) => keyById.get(id))).toEqual(expected);
    });
  }
});

// hydration reads embeddingRefs and falls back to the vector row, so the
// recorded output must hold before the backfill as well
describe("recall_context parity without embeddingRefs", () => {
  for (const { message, expected } of CASES) {
    it(`returns the recorded memories for "${message}"`, async () => {
      const t = createConvexBackend();
      const { ids, vectorSearch } = await seed(t);
      await t.run(async (ctx) => {
        for (const ref of await ctx.db.query("embeddingRefs").collect()) {
          await ctx.db.delete(ref._id);
        }
      });
      const keyById = new Map([...ids].map(([key, id]) => [id, key]));
      const recall = recallSchema.parse(
        await mcpCaller(t, ALICE, "personal", vectorSearch).call(
          "recall_context",
          { message },
        ),
      );
      expect(recall.memoryIds.map((id) => keyById.get(id))).toEqual(expected);
    });
  }
});

describe("query embedding cache", () => {
  async function recall(
    t: ConvexTestBackend,
    vectorSearch: ActionCtx["vectorSearch"],
    message: string,
  ) {
    return recallSchema.parse(
      await mcpCaller(t, ALICE, "personal", vectorSearch).call(
        "recall_context",
        { message },
      ),
    );
  }

  it("embeds an identical message once and returns the same recall", async () => {
    const t = createConvexBackend();
    const { vectorSearch } = await seed(t);
    const first = await recall(t, vectorSearch, "where are the convex secrets");
    const second = await recall(
      t,
      vectorSearch,
      "where are the convex secrets",
    );
    expect(embedMany).toHaveBeenCalledTimes(1);
    expect(second.memoryIds).toEqual(first.memoryIds);
  });

  it("embeds a different message", async () => {
    const t = createConvexBackend();
    const { vectorSearch } = await seed(t);
    await recall(t, vectorSearch, "where are the convex secrets");
    await recall(t, vectorSearch, "how do I roll back a bad deploy?");
    expect(embedMany).toHaveBeenCalledTimes(2);
  });

  it("stores a hash key, not the message, and never caches a failure", async () => {
    const t = createConvexBackend();
    const { vectorSearch } = await seed(t);
    embedMany.mockRejectedValue(new Error("gateway down"));
    await recall(t, vectorSearch, "where are the convex secrets");
    await recall(t, vectorSearch, "where are the convex secrets");
    expect(embedMany).toHaveBeenCalledTimes(2);
    expect(
      await t.run((ctx) => ctx.db.query("queryEmbeddingCache").collect()),
    ).toHaveLength(0);

    embedMany.mockResolvedValue({
      embeddings: [fakeVector(0)],
      usage: { tokens: 3 },
      providerMetadata: undefined,
    });
    await recall(t, vectorSearch, "where are the convex secrets");
    const rows = await t.run((ctx) =>
      ctx.db.query("queryEmbeddingCache").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("keeps a query embedding for an hour", async () => {
    const t = createConvexBackend();
    const { vectorSearch } = await seed(t);
    const before = Date.now();
    await recall(t, vectorSearch, "where are the convex secrets");
    const rows = await t.run((ctx) =>
      ctx.db.query("queryEmbeddingCache").collect(),
    );
    expect(QUERY_EMBEDDING_CACHE_TTL_MS).toBe(60 * 60 * 1000);
    expect(rows[0]?.expiresAt).toBeGreaterThanOrEqual(
      before + QUERY_EMBEDDING_CACHE_TTL_MS,
    );
  });

  it("reuses a row until it expires, then embeds again", async () => {
    const t = createConvexBackend();
    const { vectorSearch } = await seed(t);
    const setExpiry = (expiresAt: number) =>
      t.run(async (ctx) => {
        for (const row of await ctx.db.query("queryEmbeddingCache").collect()) {
          await ctx.db.patch(row._id, { expiresAt });
        }
      });
    await recall(t, vectorSearch, "where are the convex secrets");
    // written 59 minutes ago: still a hit
    await setExpiry(Date.now() + 60_000);
    await recall(t, vectorSearch, "where are the convex secrets");
    expect(embedMany).toHaveBeenCalledTimes(1);
    await setExpiry(Date.now() - 1);
    await recall(t, vectorSearch, "where are the convex secrets");
    expect(embedMany).toHaveBeenCalledTimes(2);
  });

  it("purges expired rows only", async () => {
    const t = createConvexBackend();
    await t.run(async (ctx) => {
      await ctx.db.insert("queryEmbeddingCache", {
        key: "old",
        embedding: [0],
        expiresAt: Date.now() - 1,
      });
      await ctx.db.insert("queryEmbeddingCache", {
        key: "live",
        embedding: [0],
        expiresAt: Date.now() + 60_000,
      });
    });
    expect(
      await t.mutation(internal.queryEmbeddingCache.purgeExpired, {}),
    ).toBe(1);
    const rows = await t.run((ctx) =>
      ctx.db.query("queryEmbeddingCache").collect(),
    );
    expect(rows.map((row) => row.key)).toEqual(["live"]);
  });
});
