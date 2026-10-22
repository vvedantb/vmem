import type * as Ai from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { internal } from "../../convex/_generated/api";
import {
  approxTokens,
  buildRecallContext,
  clampRecallTokens,
  profileFacts,
  skillUseWhen,
} from "../../engine/memory/recallContext";
import {
  createConvexBackend,
  mcpCaller,
  signUp,
  type ConvexTestBackend,
  type McpCaller,
} from "./convexHarness";

// no network: any Jev (evaluate) or Qwen (generateText) call fails the test
const evaluate = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const embedMany = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  experimental_evaluate: evaluate,
  generateText,
  embedMany,
}));

const ALICE = "clerk_recall_alice";

const idSchema = z.object({ id: z.string() });
const recallSchema = z.object({
  text: z.string(),
  memoryIds: z.array(z.string()),
  skillNames: z.array(z.string()),
  counts: z.object({
    memories: z.number(),
    skills: z.number(),
    facts: z.number(),
    approxTokens: z.number(),
  }),
  truncated: z.boolean(),
});
const historySchema = z.object({
  events: z.array(z.object({ memoryId: z.string() })),
  priorVersions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
      createdAt: z.string(),
      supersededAt: z.string().nullable(),
    }),
  ),
});
const searchSchema = z.object({
  memories: z.array(z.object({ id: z.string() })),
});
const statsSchema = z.object({ totalMemories: z.number() });

async function add(
  caller: McpCaller,
  title: string,
  content: string,
): Promise<string> {
  const created = await caller.call("memory_add", {
    title,
    content,
    type: "knowledge",
    source: "mcp",
  });
  return idSchema.parse(created).id;
}

// what an UPDATE (instruction write) or an approved contradiction does
async function supersede(
  t: ConvexTestBackend,
  olderId: string,
  newerId: string,
): Promise<void> {
  await t.mutation(internal.memoryStore.functions.supersedeMemoriesInternal, {
    kind: "personal",
    userId: ALICE,
    predecessorIds: [olderId],
    successorId: newerId,
    asVersion: true,
  });
}

async function setup(): Promise<{ t: ConvexTestBackend; alice: McpCaller }> {
  const t = createConvexBackend();
  await signUp(t, ALICE, "alice@example.com");
  return { t, alice: mcpCaller(t, ALICE) };
}

beforeEach(() => {
  // a key is set, so a Jev gate would run if recall_context asked for it
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  embedMany.mockRejectedValue(new Error("no network in tests"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("buildRecallContext", () => {
  const memory = (id: string, content: string) => ({
    id,
    title: `Title ${id}`,
    content,
  });

  it("clamps the token budget", () => {
    expect(clampRecallTokens(undefined)).toBe(1500);
    expect(clampRecallTokens(10)).toBe(200);
    expect(clampRecallTokens(99_999)).toBe(6000);
  });

  it("keeps the text inside the budget, memories before skills and facts", () => {
    const recall = buildRecallContext({
      message: "deploy",
      memories: Array.from({ length: 8 }, (_, index) =>
        memory(`m${String(index)}`, "word ".repeat(80)),
      ),
      skills: [{ name: "ship", description: "Use when a task asks to ship" }],
      facts: ["Likes tea"],
      maxTokens: 200,
    });
    expect(recall.text.length).toBeLessThanOrEqual(800);
    expect(recall.counts.approxTokens).toBe(approxTokens(recall.text));
    expect(recall.counts.approxTokens).toBeLessThanOrEqual(200);
    expect(recall.counts.memories).toBeGreaterThan(0);
    expect(recall.counts.memories).toBeLessThan(8);
    // leftover room may still take a short skill line, after the memories
    expect(recall.text.indexOf("## Memories")).toBeLessThan(
      recall.text.indexOf("## Skills") === -1
        ? Infinity
        : recall.text.indexOf("## Skills"),
    );
    expect(recall.truncated).toBe(true);
    expect(recall.text.startsWith("# vmem recall\nFor: deploy")).toBe(true);
  });

  it("reads 'Use when' lines and profile facts", () => {
    expect(skillUseWhen("Deploys the app. Use when a task names Vercel.")).toBe(
      "Use when a task names Vercel.",
    );
    expect(skillUseWhen("Deploys the app")).toBe("Deploys the app");
    expect(
      profileFacts(
        "# vmem User Profile\n\n## About\nLikes tea\n\n## Preferences\n_(not provided)_\n\n## Available Skills\n- deploy",
      ),
    ).toEqual(["Likes tea"]);
    expect(profileFacts(null)).toEqual([]);
  });
});

describe("version history over MCP (convex-test backend)", () => {
  it("memory_history lists prior versions newest first; superseded rows leave search and stats", async () => {
    const { t, alice } = await setup();
    const v1 = await add(alice, "Deploy target", "Deploys go to Heroku");
    const v2 = await add(alice, "Deploy target", "Deploys go to Fly");
    const v3 = await add(alice, "Deploy target", "Deploys go to Vercel");
    await supersede(t, v1, v2);
    await supersede(t, v2, v3);

    const history = historySchema.parse(
      await alice.call("memory_history", { memoryId: v3 }),
    );
    expect(history.events.map((event) => event.memoryId)).toEqual([v3]);
    expect(history.priorVersions.map((version) => version.id)).toEqual([
      v2,
      v1,
    ]);
    expect(history.priorVersions[0]).toMatchObject({
      content: "Deploys go to Fly",
      supersededAt: expect.any(String),
    });

    const listed = searchSchema.parse(await alice.call("memory_search", {}));
    expect(listed.memories.map((row) => row.id)).toEqual([v3]);
    const stats = statsSchema.parse(await alice.call("memory_stats", {}));
    expect(stats.totalMemories).toBe(1);
  });

  it("a merge of duplicates is not a version", async () => {
    const { t, alice } = await setup();
    const a = await add(alice, "Tea", "Likes green tea");
    const b = await add(alice, "Tea again", "Likes green tea a lot");
    await t.mutation(internal.memoryStore.functions.supersedeMemoriesInternal, {
      kind: "personal",
      userId: ALICE,
      predecessorIds: [a],
      successorId: b,
    });
    const history = historySchema.parse(
      await alice.call("memory_history", { memoryId: b }),
    );
    expect(history.priorVersions).toEqual([]);
  });

  it("deleting the current version deletes its prior versions", async () => {
    const { t, alice } = await setup();
    const v1 = await add(alice, "Editor", "Uses Vim");
    const v2 = await add(alice, "Editor", "Uses Zed");
    await supersede(t, v1, v2);
    await alice.call("memory_delete", { id: v2 });
    const left = await t.run(async (ctx) => ctx.db.query("memories").collect());
    expect(left).toEqual([]);
  });
});

describe("recall_context (convex-test backend)", () => {
  it("returns relevant memories and skill 'Use when' lines, without superseded rows or LLM calls", async () => {
    const { t, alice } = await setup();
    const old = await add(alice, "Deploy target", "Deploys go to Heroku");
    const current = await add(alice, "Deploy target", "Deploys go to Vercel");
    await supersede(t, old, current);
    await add(alice, "Coffee", "Oat latte every morning");
    await alice.call("skills_create", {
      name: "deploy-app",
      description: "Ships a release. Use when a task asks to deploy the app",
      instructions: "Run the deploy script",
    });

    const recall = recallSchema.parse(
      await alice.call("recall_context", { message: "how do I deploy" }),
    );
    expect(recall.memoryIds).toContain(current);
    expect(recall.memoryIds).not.toContain(old);
    expect(recall.text).not.toContain("Heroku");
    expect(recall.text).toContain("Vercel");
    expect(recall.skillNames[0]).toBe("deploy-app");
    expect(recall.text).toContain(
      "- deploy-app: Use when a task asks to deploy the app",
    );
    expect(recall.counts).toMatchObject({
      memories: recall.memoryIds.length,
      skills: recall.skillNames.length,
      approxTokens: approxTokens(recall.text),
    });
    expect(recall.counts.approxTokens).toBeLessThanOrEqual(1500);
    expect(evaluate).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("respects a small maxTokens and rejects an empty message", async () => {
    const { alice } = await setup();
    for (let index = 0; index < 8; index += 1) {
      await add(alice, `Deploy note ${String(index)}`, "deploy ".repeat(60));
    }
    const recall = recallSchema.parse(
      await alice.call("recall_context", { message: "deploy", maxTokens: 1 }),
    );
    expect(recall.text.length).toBeLessThanOrEqual(200 * 4);
    expect(recall.truncated).toBe(true);
    await expect(
      alice.call("recall_context", { message: "  " }),
    ).rejects.toThrow();
  });
});
