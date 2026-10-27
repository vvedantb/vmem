/// <reference types="vite/client" />
import type * as Ai from "ai";
import { convexTest } from "convex-test";
import type { WithoutSystemFields } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CLUSTER_MERGE_JUDGE } from "../engine/memory/dream/clusterMerge";
import { MEMORY_EMBEDDING_DIMENSIONS } from "../engine/memory/searchableText";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// convex-test may JSON-encode ConvexError data; decode it back
function convexErrorData(err: unknown): unknown {
  if (!(err instanceof ConvexError)) return undefined;
  const data: unknown = err.data;
  if (typeof data !== "string") return data;
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed;
  } catch {
    return data;
  }
}

const NOW = Date.parse("2026-10-20T03:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const VHUB_TITLE = "vhub — your own hub for mcp connections and agent secrets";
const VHUB_PATHS = [
  "/",
  "/connectors",
  "/connectors?view=mine",
  "/connectors?category=Notes",
  "/connectors?category=Communication",
  "/connectors?category=Health",
  "/connectors?category=Productivity",
  "/connectors?category=Code",
];

type GenerateCall = {
  messages: { role: string; content: string }[];
  providerOptions: Record<string, Record<string, string | boolean>>;
};

// no network: the cleanup judge (generateText) and Jev (evaluate) are spies;
// the cleanup never calls Jev
const generateText = vi.hoisted(() =>
  vi.fn<(call: GenerateCall) => Promise<object>>(),
);
const evaluate = vi.hoisted(() => vi.fn<() => Promise<object>>());

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  experimental_evaluate: evaluate,
  generateText,
}));

const promptSchema = z.object({
  memories: z.array(
    z.object({ id: z.string(), title: z.string(), content: z.string() }),
  ),
});

// the memories one judge call saw, named m0, m1, ... as in the prompt
function promptMemories(call: GenerateCall) {
  const prompt = call.messages.find((m) => m.role === "user")?.content ?? "";
  return promptSchema.parse(
    JSON.parse(prompt.slice(prompt.indexOf('{\n  "memories"'))),
  ).memories;
}

type ReplyFields = Record<string, string | number | boolean | string[] | null>;

// one gateway text result with a JSON reply
function chatReply(fields: ReplyFields, cost: string | null = "0.0002") {
  return {
    text: JSON.stringify(fields),
    finishReason: "stop",
    response: { id: "gen_cleanup" },
    usage: {
      inputTokens: 300,
      outputTokens: 12,
      totalTokens: 312,
      inputTokenDetails: {},
      outputTokenDetails: {},
    },
    providerMetadata: cost === null ? {} : { gateway: { cost } },
  };
}

// the AI says "duplicates: keep m0, remove the rest" and joins the contents
function duplicateReply(call: GenerateCall) {
  const memories = promptMemories(call);
  return chatReply({
    duplicate: true,
    keepId: "m0",
    removeIds: memories.slice(1).map((m) => m.id),
    mergedTitle: memories[0]?.title ?? "",
    mergedContent: memories.map((m) => m.content).join("\n"),
    confidence: 0.95,
    reason: "Same fact.",
  });
}

function setupT() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setupT>;

async function addUser(t: T, clerkId: string) {
  const user = t.withIdentity({ subject: clerkId });
  const { userId } = await user.mutation(api.auth.ensureUserExists, {});
  const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
  if (!profile) throw new Error("profile missing");
  return { userId, profileId: profile._id, clerkId };
}

type Owner = Awaited<ReturnType<typeof addUser>>;

let seq = 0;

// a distinct memory row; later rows are newer
function memoryFields(
  owner: Owner,
  fields: Partial<Doc<"memories">> = {},
): WithoutSystemFields<Doc<"memories">> {
  seq += 1;
  const memoryId = `mem_${String(seq)}`;
  return {
    memoryId,
    userId: owner.clerkId,
    profileId: owner.profileId,
    title: `Title ${memoryId}`,
    content: `Content ${memoryId}`,
    type: "knowledge",
    source: "mcp",
    confidence: 1,
    status: "active",
    tags: [],
    createdAt: NOW - DAY_MS + seq,
    updatedAt: NOW - DAY_MS + seq,
    contentHash: `hash_${memoryId}`,
    visitCount: 1,
    firstVisitAt: NOW - DAY_MS,
    lastVisitAt: NOW - DAY_MS,
    ...fields,
  };
}

async function addMemory(
  t: T,
  owner: Owner,
  fields: Partial<Doc<"memories">> = {},
): Promise<Id<"memories">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("memories", memoryFields(owner, fields)),
  );
}

// unit vector on `axis`, tilted a little towards axis + 1
function vector(axis: number, tilt = 0): number[] {
  const out = Array.from({ length: MEMORY_EMBEDDING_DIMENSIONS }, () => 0);
  out[axis] = 1;
  out[axis + 1] = tilt;
  const norm = Math.hypot(1, tilt);
  return out.map((x) => x / norm);
}

// unit vector whose cosine with vector(axis) is `cosine`
function atCosine(axis: number, cosine: number): number[] {
  return vector(axis, Math.sqrt(1 / (cosine * cosine) - 1));
}

async function embed(
  t: T,
  owner: Owner,
  memoryDocId: Id<"memories">,
  embedding: number[],
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("memoryEmbeddings", {
      memoryDocId,
      userId: owner.clerkId,
      profileId: owner.profileId,
      embedding,
    });
  });
}

async function addVhub(t: T, owner: Owner): Promise<Id<"memories">[]> {
  const ids: Id<"memories">[] = [];
  for (const [i, path] of VHUB_PATHS.entries()) {
    ids.push(
      await addMemory(t, owner, {
        title: VHUB_TITLE,
        content: `${VHUB_TITLE}\nhttps://vhub.projectv.uk${path}`,
        url: `https://vhub.projectv.uk${path}`,
        source: "browsing-history",
        sourceType: "browsing-history",
        visitCount: i + 1,
        createdAt: NOW - DAY_MS + i,
      }),
    );
  }
  return ids;
}

async function dryRun(
  t: T,
  owner: Owner,
  extra: { jevMaxCalls?: number } = {},
): Promise<Id<"dreamRuns">> {
  const runId = await t.mutation(internal.dreamCleanup.dryRunForUser, {
    clerkUserId: owner.clerkId,
    ...extra,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return runId;
}

async function summary(t: T, runId: Id<"dreamRuns">) {
  const result = await t.query(internal.dreamCleanup.getRunSummary, { runId });
  if (!result) throw new Error("run missing");
  return result.run;
}

async function apply(
  t: T,
  runId: Id<"dreamRuns">,
  includeAi = false,
): Promise<Id<"dreamRuns">> {
  const applyRunId = await t.mutation(internal.dreamCleanup.applyInternal, {
    runId,
    includeAi,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return applyRunId;
}

async function memories(t: T): Promise<Doc<"memories">[]> {
  return await t.run(async (ctx) => ctx.db.query("memories").collect());
}

async function getDoc(t: T, id: Id<"memories">): Promise<Doc<"memories">> {
  const doc = await t.run(async (ctx) => ctx.db.get(id));
  if (!doc) throw new Error("memory missing");
  return doc;
}

// the member titles of each judge call, sorted
function judgedTitles(): string[][] {
  return generateText.mock.calls.map(([call]) =>
    promptMemories(call)
      .map((m) => m.title)
      .sort(),
  );
}

beforeEach(() => {
  seq = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  generateText.mockReset();
  generateText.mockImplementation(async (call: GenerateCall) =>
    duplicateReply(call),
  );
  evaluate.mockReset();
  evaluate.mockRejectedValue(new Error("no Jev in cleanup tests"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("dreamCleanup dry run", () => {
  it("plans the vhub pattern, an exact trio and A∩B without touching memories", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_cleanup");
    await addVhub(t, owner);
    for (let i = 0; i < 3; i += 1) {
      await addMemory(t, owner, { contentHash: "trio" });
    }
    // a and b share a hash; b and c share a browse key
    const browsing = {
      source: "browsing-history",
      sourceType: "browsing-history",
    };
    await addMemory(t, owner, {
      ...browsing,
      title: "Other",
      url: "https://x.dev/a",
      contentHash: "ab",
    });
    await addMemory(t, owner, {
      ...browsing,
      title: "Docs",
      url: "https://x.dev/b",
      contentHash: "ab",
    });
    await addMemory(t, owner, {
      ...browsing,
      title: "Docs",
      url: "https://x.dev/c",
    });
    const before = await memories(t);

    const run = await summary(t, await dryRun(t, owner));

    expect(await memories(t)).toEqual(before);
    expect(run).toMatchObject({
      dryRun: true,
      trigger: "backfill",
      status: "ok",
      aiCalls: 0,
      cleanup: {
        scannedRows: 14,
        exactGroups: 1,
        keyGroups: 1,
        bothGroups: 1,
        groups: 3,
        rowsToSuppress: 7 + 2 + 2,
      },
    });
    expect(run.sample?.[0]).toMatchObject({
      rule: "key",
      count: 8,
      keeperTitle: VHUB_TITLE,
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("plans duplicate tags when no memory is duplicated, without AI", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_tag_scan");
    await addMemory(t, owner, { tags: ["wwwyoutubecom", "video"] });
    await addMemory(t, owner, { tags: ["youtubecom"] });
    await addMemory(t, owner, { tags: ["youtubecom", "youtube"] });
    const before = await memories(t);

    const run = await summary(t, await dryRun(t, owner));

    expect(await memories(t)).toEqual(before);
    expect(run).toMatchObject({
      status: "ok",
      aiCalls: 0,
      cleanup: { groups: 0, rowsToSuppress: 0 },
    });
    expect(run.sample).toEqual([
      {
        rule: "tag",
        keeperTitle: "youtube",
        loserTitles: ["wwwyoutubecom", "youtubecom"],
        count: 3,
        memoryIds: [],
        reason: "Host-name tag spellings",
      },
    ]);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("caps sample titles at 80 chars", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_titles");
    const title = "x".repeat(200);
    await addMemory(t, owner, { title, contentHash: "same" });
    await addMemory(t, owner, { title, contentHash: "same" });
    const run = await summary(t, await dryRun(t, owner));
    expect(run.sample?.[0]?.keeperTitle.length).toBe(80);
  });
});

describe("dreamCleanup apply", () => {
  it("merges the vhub rows into one keeper, sums visits, and undoRun restores", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_apply");
    const ids = await addVhub(t, owner);
    const pinnedDup = await addMemory(t, owner, {
      contentHash: "pin",
      status: "pinned",
    });
    const plainDup = await addMemory(t, owner, { contentHash: "pin" });
    const before = await memories(t);

    const planId = await dryRun(t, owner);
    const applyId = await apply(t, planId);

    const [first, ...rest] = ids;
    if (!first) throw new Error("no rows");
    const keeper = await getDoc(t, first);
    expect(keeper).toMatchObject({
      status: "active",
      visitCount: 36,
      sourceId: `vhub.projectv.uk|${VHUB_TITLE.toLowerCase()}`,
    });
    for (const id of rest) {
      expect(await getDoc(t, id)).toMatchObject({
        status: "suppressed",
        mergedInto: first,
        suppressedBy: "dream",
      });
    }
    expect((await getDoc(t, pinnedDup)).status).toBe("pinned");
    expect((await getDoc(t, plainDup)).mergedInto).toBe(pinnedDup);
    expect(await summary(t, applyId)).toMatchObject({
      dryRun: false,
      status: "ok",
      planRunId: planId,
      counts: { exactMerged: 1, keyMerged: 1 },
    });

    await t.mutation(internal.dream.undoRunInternal, { runId: applyId });
    const restored = await memories(t);
    const pick = (docs: Doc<"memories">[]) =>
      docs.map((doc) => [doc._id, doc.status, doc.visitCount, doc.sourceId]);
    expect(pick(restored)).toEqual(pick(before));
  });

  it("merges host-name tags when the apply ends, through the shared consolidator", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_apply_tags");
    const a = await addMemory(t, owner, { tags: ["wwwyoutubecom", "video"] });
    const b = await addMemory(t, owner, { tags: ["youtubecom", "youtube"] });

    const planId = await dryRun(t, owner);
    // a tag-only plan: no plan groups, only the tag sample
    expect((await summary(t, planId)).sample?.[0]?.rule).toBe("tag");
    const applyId = await apply(t, planId);

    expect((await getDoc(t, a)).tags).toEqual(["youtube", "video"]);
    expect((await getDoc(t, a)).searchableText).toContain("youtube");
    expect((await getDoc(t, b)).tags).toEqual(["youtube"]);
    expect((await summary(t, applyId)).counts.tagsMerged).toBe(1);
  });

  it("skips groups whose rows changed after the plan", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_changed");
    const a = await addMemory(t, owner, { contentHash: "h" });
    const b = await addMemory(t, owner, { contentHash: "h" });
    const planId = await dryRun(t, owner);
    await t.run(async (ctx) => ctx.db.patch(b, { status: "suppressed" }));

    const applyId = await apply(t, planId);

    expect((await getDoc(t, a)).status).toBe("active");
    expect(await summary(t, applyId)).toMatchObject({
      counts: { exactMerged: 0 },
      cleanup: { skippedChanged: 1 },
    });
  });
});

describe("dreamCleanup AI pass", () => {
  // n1 ~ n2 by vector, e1/e2 share an entity, far is alone, web is a
  // low-prior row with the same vector as n1
  async function seedPairs(t: T, owner: Owner) {
    const n1 = await addMemory(t, owner, { title: "Uses pnpm" });
    const n2 = await addMemory(t, owner, { title: "Prefers pnpm" });
    const far = await addMemory(t, owner, { title: "Lives in London" });
    const web = await addMemory(t, owner, {
      title: "pnpm docs",
      source: "browsing-history",
      url: "https://pnpm.io",
    });
    await embed(t, owner, n1, vector(0));
    await embed(t, owner, n2, vector(0, 0.1));
    await embed(t, owner, far, vector(10));
    await embed(t, owner, web, vector(0));
    const e1 = await addMemory(t, owner, { title: "Works on vmem" });
    const e2 = await addMemory(t, owner, { title: "Builds vmem" });
    await t.run(async (ctx) => {
      const entityId = await ctx.db.insert("memoryEntities", {
        userId: owner.clerkId,
        profileId: owner.profileId,
        name: "vmem",
        normalizedName: "vmem",
        type: "technology",
        createdAt: NOW,
      });
      for (const id of [e1, e2]) {
        const doc = await ctx.db.get(id);
        if (!doc) throw new Error("memory missing");
        await ctx.db.insert("memoryEntityMentions", {
          userId: owner.clerkId,
          profileId: owner.profileId,
          memoryId: doc.memoryId,
          entityId,
          normalizedName: "vmem",
          createdAt: NOW,
        });
      }
    });
    return { n1, n2, far, web, e1, e2 };
  }

  // a ~ b and b ~ c by vector (cosine 0.93 and 0.96), a and c are not
  // neighbours (0.78): one cluster of three only through b. a is the oldest.
  async function seedCluster(t: T, owner: Owner) {
    const a = await addMemory(t, owner, {
      title: "Uses pnpm",
      content: "Uses pnpm in vmem.",
    });
    const b = await addMemory(t, owner, {
      title: "Prefers pnpm",
      content: "Prefers pnpm 10.",
    });
    const c = await addMemory(t, owner, {
      title: "pnpm workspaces",
      content: "vmem is a pnpm workspace.",
    });
    await embed(t, owner, a, vector(0));
    await embed(t, owner, b, vector(0, 0.4));
    await embed(t, owner, c, vector(0, 0.8));
    return { a, b, c };
  }

  const MERGED = {
    title: "Uses pnpm",
    content: "Uses pnpm 10 in vmem, a pnpm workspace.",
  };

  // the AI keeps "Uses pnpm" and merges every other member into it
  function clusterReply(call: GenerateCall) {
    const memories = promptMemories(call);
    const keep = memories.find((m) => m.title === "Uses pnpm");
    return chatReply({
      duplicate: true,
      keepId: keep?.id ?? "m0",
      removeIds: memories.filter((m) => m !== keep).map((m) => m.id),
      mergedTitle: MERGED.title,
      mergedContent: MERGED.content,
      confidence: 0.93,
      reason: "Same tool preference",
    });
  }

  async function proposals(t: T): Promise<Doc<"proposedUpdates">[]> {
    return await t.run(async (ctx) =>
      ctx.db.query("proposedUpdates").collect(),
    );
  }

  async function onlyProposal(t: T): Promise<Doc<"proposedUpdates">> {
    const all = await proposals(t);
    expect(all).toHaveLength(1);
    const [proposal] = all;
    if (!proposal) throw new Error("proposal missing");
    return proposal;
  }

  async function approve(
    t: T,
    owner: Owner,
    proposal: Doc<"proposedUpdates">,
    selectedSourceMemoryIds?: string[],
  ) {
    return await t.mutation(internal.proposedUpdateApi.resolveInternal, {
      clerkId: owner.clerkId,
      proposalId: proposal.proposalId,
      action: "approve",
      ...(selectedSourceMemoryIds === undefined
        ? {}
        : { selectedSourceMemoryIds }),
    });
  }

  it("judges only candidate groups, one logged call each, and skips low-prior rows", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_ai");
    await seedPairs(t, owner);

    const run = await summary(t, await dryRun(t, owner));

    const titles = judgedTitles();
    expect(titles).toEqual(
      expect.arrayContaining([
        ["Prefers pnpm", "Uses pnpm"],
        ["Builds vmem", "Works on vmem"],
      ]),
    );
    expect(titles).toHaveLength(2);
    expect(evaluate).not.toHaveBeenCalled();
    expect(run).toMatchObject({
      status: "ok",
      aiCalls: 2,
      counts: { aiFlagged: 2 },
      cleanup: { aiCandidates: 2, aiSkipped: 0, aiCostUnknown: 0 },
    });
    expect(run.costUsd).toBeCloseTo(0.0004);
    expect(run.sample?.filter((s) => s.rule === "near_dup")).toHaveLength(2);
    // the chat helper logs each call once
    const logs = await t.run(async (ctx) =>
      ctx.db.query("openRouterLogs").collect(),
    );
    expect(logs.map((log) => [log.feature, log.promptPreview])).toEqual([
      ["dream", undefined],
      ["dream", undefined],
    ]);
    expect(logs[0]).toMatchObject({
      endpoint: "chat",
      promptTokens: 300,
      completionTokens: 12,
      costUsd: 0.0002,
    });
  });

  it("judges a transitive cluster of three in one call and proposes one merge", async () => {
    generateText.mockImplementation(async (call: GenerateCall) =>
      clusterReply(call),
    );
    const t = setupT();
    const owner = await addUser(t, "clerk_cluster");
    const { a, b, c } = await seedCluster(t, owner);
    const docs = [await getDoc(t, a), await getDoc(t, b), await getDoc(t, c)];

    const planId = await dryRun(t, owner);

    expect(judgedTitles()).toEqual([
      ["Prefers pnpm", "Uses pnpm", "pnpm workspaces"],
    ]);
    const call = generateText.mock.calls[0]?.[0];
    if (!call) throw new Error("no judge call");
    // members are m0..m2 in the prompt, never row ids; thinking is off
    const prompt = call.messages.map((m) => m.content).join("\n");
    for (const doc of docs) {
      expect(prompt).not.toContain(doc._id);
      expect(prompt).not.toContain(doc.memoryId);
    }
    expect(promptMemories(call).map((m) => m.id)).toEqual(["m0", "m1", "m2"]);
    expect(call.providerOptions).toMatchObject({
      alibaba: { enableThinking: false },
    });
    expect(await summary(t, planId)).toMatchObject({
      status: "ok",
      aiCalls: 1,
      counts: { aiFlagged: 1 },
      cleanup: { aiCandidates: 1, aiSkipped: 0 },
    });
    const groups = await t.run(async (ctx) =>
      ctx.db.query("dreamPlanGroups").collect(),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      tier: "ai",
      aiStatus: "flagged",
      keeperId: a,
      proposedTitle: MERGED.title,
      proposedContent: MERGED.content,
    });
    expect([...(groups[0]?.loserIds ?? [])].sort()).toEqual([b, c].sort());

    const applyId = await apply(t, planId, true);

    const proposal = await onlyProposal(t);
    expect(proposal).toMatchObject({
      kind: "merge",
      status: "pending",
      memoryId: docs[0]?.memoryId,
      proposedTitle: MERGED.title,
      proposedContent: MERGED.content,
      memorySnapshot: { title: "Uses pnpm", content: "Uses pnpm in vmem." },
      dreamRunId: applyId,
    });
    expect([...proposal.sourceMemoryIds].sort()).toEqual(
      docs.map((doc) => doc.memoryId).sort(),
    );
    expect(proposal.sourceMemorySnapshots).toHaveLength(3);
    expect(proposal.reason).toContain("with the merged text");
    expect((await summary(t, applyId)).counts.proposals).toBe(1);
    // nothing changes before approval
    expect((await getDoc(t, a)).content).toBe("Uses pnpm in vmem.");
    expect((await getDoc(t, c)).status).toBe("active");
  });

  it("approving merges the cluster into the keeper with the merged text; undo restores it", async () => {
    generateText.mockImplementation(async (call: GenerateCall) =>
      clusterReply(call),
    );
    const t = setupT();
    const owner = await addUser(t, "clerk_cluster_apply");
    const { a, b, c } = await seedCluster(t, owner);
    const before = await getDoc(t, a);
    const applyId = await apply(t, await dryRun(t, owner), true);

    expect(await approve(t, owner, await onlyProposal(t))).toEqual({
      status: "approved",
      materializedMemoryId: before.memoryId,
    });

    const keeper = await getDoc(t, a);
    expect(keeper).toMatchObject({
      status: "active",
      title: MERGED.title,
      content: MERGED.content,
    });
    expect(keeper.contentHash).not.toBe(before.contentHash);
    expect(keeper.searchableText).toContain("workspace");
    expect(keeper.updatedAt).toBeGreaterThan(before.updatedAt);
    for (const id of [b, c]) {
      expect(await getDoc(t, id)).toMatchObject({
        status: "suppressed",
        mergedInto: a,
        suppressedBy: "dream-ai",
      });
    }
    // one undoable action for the whole cluster, judged by the chat model
    const actions = await t.run(async (ctx) =>
      ctx.db.query("dreamActions").collect(),
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "merge", keeperId: a });
    expect(actions[0]?.memoryIds).toHaveLength(2);
    expect(actions[0]?.ai?.model).not.toContain("jev");

    await t.mutation(internal.dream.undoRunInternal, { runId: applyId });
    const restored = await getDoc(t, a);
    expect(restored).toMatchObject({
      status: "active",
      title: before.title,
      content: before.content,
      contentHash: before.contentHash,
    });
    expect(restored.searchableText).not.toContain("workspace");
    for (const id of [b, c]) {
      expect((await getDoc(t, id)).status).toBe("active");
    }
  });

  it("merges only the sources left ticked", async () => {
    generateText.mockImplementation(async (call: GenerateCall) =>
      clusterReply(call),
    );
    const t = setupT();
    const owner = await addUser(t, "clerk_cluster_untick");
    const { a, b, c } = await seedCluster(t, owner);
    await apply(t, await dryRun(t, owner), true);
    const proposal = await onlyProposal(t);
    const keeperId = (await getDoc(t, a)).memoryId;
    const bId = (await getDoc(t, b)).memoryId;

    // the kept memory alone, or a memory outside the proposal, is refused
    await expect(approve(t, owner, proposal, [keeperId])).rejects.toThrow(
      /Select at least one memory/,
    );
    await expect(
      approve(t, owner, proposal, [keeperId, bId, "mem_other"]),
    ).rejects.toThrow(/selectedSourceMemoryIds/);
    expect((await onlyProposal(t)).status).toBe("pending");

    // c unticked; the keeper need not be listed
    await approve(t, owner, proposal, [bId]);

    expect(await getDoc(t, a)).toMatchObject({
      status: "active",
      content: MERGED.content,
    });
    expect(await getDoc(t, b)).toMatchObject({
      status: "suppressed",
      mergedInto: a,
    });
    expect((await getDoc(t, c)).status).toBe("active");
    expect((await onlyProposal(t)).status).toBe("approved");
  });

  it("refuses a source selection on a proposal that is not a merge", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_select_kind");
    const a = await addMemory(t, owner);
    const doc = await getDoc(t, a);
    await t.run(async (ctx) => {
      await ctx.db.insert("proposedUpdates", {
        proposalId: "prop_delete",
        userId: owner.clerkId,
        profileId: owner.profileId,
        memoryId: doc.memoryId,
        proposedContent: "",
        reason: "Stale",
        kind: "delete",
        status: "pending",
        createdAt: NOW,
        sourceMemoryIds: [doc.memoryId],
        source: "dream-mode",
        sourceMemorySnapshots: [],
      });
    });
    await expect(
      t.mutation(internal.proposedUpdateApi.resolveInternal, {
        clerkId: owner.clerkId,
        proposalId: "prop_delete",
        action: "approve",
        selectedSourceMemoryIds: [doc.memoryId],
      }),
    ).rejects.toThrow(/only for merge proposals/);
    expect((await getDoc(t, a)).status).toBe("active");
  });

  it("reuses a cluster verdict with its merged text; a changed member set is judged again", async () => {
    generateText.mockImplementation(async (call: GenerateCall) =>
      clusterReply(call),
    );
    const t = setupT();
    const owner = await addUser(t, "clerk_cluster_reuse");
    const { a, b, c } = await seedCluster(t, owner);
    await dryRun(t, owner);

    const secondId = await dryRun(t, owner);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(await summary(t, secondId)).toMatchObject({
      status: "ok",
      aiCalls: 0,
      counts: { aiFlagged: 1 },
    });
    const reused = await t.run(async (ctx) =>
      ctx.db
        .query("dreamPlanGroups")
        .withIndex("by_run_tier_seq", (q) =>
          q.eq("runId", secondId).eq("tier", "ai"),
        )
        .collect(),
    );
    expect(reused).toHaveLength(1);
    expect(reused[0]).toMatchObject({
      aiStatus: "flagged",
      aiJudge: CLUSTER_MERGE_JUDGE,
      keeperId: a,
      proposedTitle: MERGED.title,
      proposedContent: MERGED.content,
      aiConfidence: 0.93,
    });
    expect([...(reused[0]?.loserIds ?? [])].sort()).toEqual([b, c].sort());
    await apply(t, secondId, true);
    expect(await onlyProposal(t)).toMatchObject({
      proposedContent: MERGED.content,
    });

    // d joins the cluster through c: four members, a new group to judge
    await t.run(async (ctx) => {
      for (const proposal of await ctx.db.query("proposedUpdates").collect()) {
        await ctx.db.delete(proposal._id);
      }
    });
    const d = await addMemory(t, owner, { title: "pnpm 10" });
    await embed(t, owner, d, vector(0, 1.2));
    const thirdId = await dryRun(t, owner);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(judgedTitles()[1]).toHaveLength(4);
    expect(await summary(t, thirdId)).toMatchObject({ aiCalls: 1 });
  });

  it("judges a pair-judge verdict again once, then reuses the cluster verdict", async () => {
    generateText.mockImplementation(async () =>
      chatReply({ duplicate: false, confidence: 0.9, reason: "Other facts" }),
    );
    const t = setupT();
    const owner = await addUser(t, "clerk_pair_judge");
    await seedCluster(t, owner);
    await dryRun(t, owner);
    const aiGroups = async (runId: Id<"dreamRuns">) =>
      await t.run(async (ctx) =>
        ctx.db
          .query("dreamPlanGroups")
          .withIndex("by_run_tier_seq", (q) =>
            q.eq("runId", runId).eq("tier", "ai"),
          )
          .collect(),
      );
    // a plan from before the cluster judge: same verdict, no aiJudge
    await t.run(async (ctx) => {
      for (const group of await ctx.db.query("dreamPlanGroups").collect()) {
        expect(group).toMatchObject({
          aiStatus: "not_duplicate",
          aiJudge: CLUSTER_MERGE_JUDGE,
        });
        await ctx.db.patch(group._id, { aiJudge: undefined });
      }
    });

    const secondId = await dryRun(t, owner);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(await summary(t, secondId)).toMatchObject({ aiCalls: 1 });
    expect(await aiGroups(secondId)).toMatchObject([
      { aiStatus: "not_duplicate", aiJudge: CLUSTER_MERGE_JUDGE },
    ]);

    const thirdId = await dryRun(t, owner);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(await summary(t, thirdId)).toMatchObject({ aiCalls: 0 });
    expect(await aiGroups(thirdId)).toMatchObject([
      { aiStatus: "not_duplicate", aiJudge: CLUSTER_MERGE_JUDGE },
    ]);
  });

  it("keeps the keeper's own text when a member is too long for the AI to see", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_long");
    const long = "word ".repeat(1_000);
    const a = await addMemory(t, owner, { title: "Notes", content: long });
    const b = await addMemory(t, owner, { title: "Notes copy", content: long });
    await embed(t, owner, a, vector(0));
    await embed(t, owner, b, vector(0, 0.1));
    await apply(t, await dryRun(t, owner), true);

    const proposal = await onlyProposal(t);
    expect(proposal.proposedContent).toBe(long);
    expect(proposal.reason).not.toContain("merged text");
    await approve(t, owner, proposal);
    expect((await getDoc(t, a)).content).toBe(long);
    expect((await getDoc(t, b)).status).toBe("suppressed");
  });

  it("asks one call per cluster through the chat model with thinking off", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_policy");
    await seedPairs(t, owner);
    await dryRun(t, owner);

    const calls = generateText.mock.calls.map(([call]) => call);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.providerOptions).toMatchObject({
        alibaba: { enableThinking: false },
      });
      expect(call.messages[0]).toMatchObject({ role: "system" });
      expect(call.messages[0]?.content).toContain(
        "Respond with ONLY valid JSON",
      );
    }
  });

  it("respects jevMaxCalls", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_cap");
    await seedPairs(t, owner);
    const run = await summary(t, await dryRun(t, owner, { jevMaxCalls: 1 }));
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(run).toMatchObject({
      status: "partial",
      aiCalls: 1,
      cleanup: { aiCandidates: 2, aiSkipped: 1, aiStopReason: "cap" },
    });
  });

  // convex-test pages slowly over thousands of rows (about 7 s alone)
  it("pages every row and judges every candidate group by default", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_full_scan");
    // 25 near-duplicate pairs (more than the old 20-call default), the oldest
    // rows, so the scan meets them after 3,000 newer ones
    for (let i = 0; i < 25; i += 1) {
      const a = await addMemory(t, owner, { title: `Fact ${String(i)}` });
      const b = await addMemory(t, owner, { title: `Same fact ${String(i)}` });
      await embed(t, owner, a, vector(3 * i));
      await embed(t, owner, b, vector(3 * i, 0.1));
    }
    await t.run(async (ctx) => {
      for (let i = 0; i < 3_000; i += 1) {
        await ctx.db.insert("memories", memoryFields(owner));
      }
    });

    const run = await summary(t, await dryRun(t, owner));

    expect(generateText).toHaveBeenCalledTimes(25);
    expect(run).toMatchObject({
      status: "ok",
      aiCalls: 25,
      counts: { aiFlagged: 25 },
      cleanup: { scannedRows: 3_050, aiCandidates: 25, aiSkipped: 0 },
    });
    expect(run.cleanup?.aiStopReason).toBeUndefined();
  }, 30_000);

  it("continues a capped scan with the groups it left unjudged", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_continue");
    await seedPairs(t, owner);
    const judged = () => judgedTitles().map((titles) => titles.join(" | "));

    const first = await summary(t, await dryRun(t, owner, { jevMaxCalls: 1 }));
    expect(first).toMatchObject({
      status: "partial",
      aiCalls: 1,
      counts: { aiFlagged: 1 },
      cleanup: { aiCandidates: 2, aiSkipped: 1, aiStopReason: "cap" },
    });

    // the next scan judges only the group the first one skipped and keeps
    // the first verdict, so its plan holds both
    const secondId = await dryRun(t, owner, { jevMaxCalls: 1 });
    const second = await summary(t, secondId);
    expect(judged()).toHaveLength(2);
    expect(new Set(judged()).size).toBe(2);
    expect(second).toMatchObject({
      status: "ok",
      aiCalls: 1,
      counts: { aiFlagged: 2 },
      cleanup: { aiCandidates: 2, aiSkipped: 0 },
    });
    expect(second.sample?.filter((s) => s.rule === "near_dup")).toHaveLength(2);

    // applying it proposes both; verdicts carry across the apply
    const applyId = await apply(t, secondId, true);
    expect((await summary(t, applyId)).counts.proposals).toBe(2);
    const third = await summary(t, await dryRun(t, owner));
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(third).toMatchObject({
      status: "ok",
      aiCalls: 0,
      counts: { aiFlagged: 2 },
    });
  });

  it("stops at the daily budget", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_budget");
    await seedPairs(t, owner);
    await t.run(async (ctx) => {
      await ctx.db.insert("openRouterLogs", {
        userId: owner.userId,
        feature: "dream",
        endpoint: "chat",
        model: "alibaba/qwen3.7-flash",
        costUsd: 0.5,
        createdAt: NOW - 60_000,
      });
    });
    const run = await summary(t, await dryRun(t, owner));
    expect(generateText).not.toHaveBeenCalled();
    expect(run).toMatchObject({
      status: "partial",
      aiCalls: 0,
      cleanup: { aiSkipped: 2, aiStopReason: "budget" },
    });
  });

  it("skips rule J without an AI key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const t = setupT();
    const owner = await addUser(t, "clerk_nokey");
    await seedPairs(t, owner);
    const run = await summary(t, await dryRun(t, owner));
    expect(generateText).not.toHaveBeenCalled();
    expect(run).toMatchObject({
      status: "ok",
      cleanup: { aiCandidates: 0, aiStopReason: "no_key" },
    });
  });

  it("counts candidate groups at cosine >= 0.85 without AI or writes; a scan agrees", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const t = setupT();
    const owner = await addUser(t, "clerk_count");
    await seedPairs(t, owner);
    // 0.86 is a manual edge (no nightly candidate); 0.84 is no edge
    const looseA = await addMemory(t, owner, { title: "Loose A" });
    const looseB = await addMemory(t, owner, { title: "Loose B" });
    const apartA = await addMemory(t, owner, { title: "Apart A" });
    const apartB = await addMemory(t, owner, { title: "Apart B" });
    await embed(t, owner, looseA, vector(20));
    await embed(t, owner, looseB, atCosine(20, 0.86));
    await embed(t, owner, apartA, vector(30));
    await embed(t, owner, apartB, atCosine(30, 0.84));
    // an exact pair: one A/B group; its loser is not eligible
    await addMemory(t, owner, { contentHash: "same" });
    await addMemory(t, owner, { contentHash: "same" });

    const count = await t.action(internal.dreamCleanup.countCandidatesForUser, {
      clerkUserId: owner.clerkId,
    });

    expect(count).toEqual({
      scannedRows: 12,
      truncated: false,
      deterministicGroups: 1,
      // web is low-prior, one exact row is a loser
      eligibleRows: 10,
      aiCandidates: 3,
      vectorGroups: 2,
      entityOnlyGroups: 1,
      candidateRows: 6,
      topScores: [0.995, 0.86, 0],
    });
    expect(generateText).not.toHaveBeenCalled();
    expect(
      await t.run(async (ctx) => ({
        runs: (await ctx.db.query("dreamRuns").collect()).length,
        groups: (await ctx.db.query("dreamPlanGroups").collect()).length,
      })),
    ).toEqual({ runs: 0, groups: 0 });

    // the real scan finds the same groups
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const run = await summary(t, await dryRun(t, owner));
    expect(run.cleanup).toMatchObject({
      scannedRows: 12,
      groups: 1,
      aiCandidates: 3,
    });
    expect(judgedTitles()).toEqual(
      expect.arrayContaining([["Loose A", "Loose B"]]),
    );
    expect(judgedTitles().flat()).not.toContain("Apart A");
  });

  it("ignores malformed AI output", async () => {
    generateText.mockImplementation(async () => ({
      ...chatReply({}, null),
      text: "the first two look the same",
    }));
    const t = setupT();
    const owner = await addUser(t, "clerk_bad");
    const { n2 } = await seedPairs(t, owner);
    const planId = await dryRun(t, owner);
    expect(await summary(t, planId)).toMatchObject({
      status: "partial",
      counts: { aiFlagged: 0 },
      cleanup: { aiErrors: 2, aiCostUnknown: 2 },
    });
    await apply(t, planId, true);
    expect((await getDoc(t, n2)).status).toBe("active");

    // errors are not reused: the next scan asks again
    await dryRun(t, owner);
    expect(generateText).toHaveBeenCalledTimes(4);
  });

  it("turns AI groups into proposals; approval suppresses with undo", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_proposal");
    const { n1, n2 } = await seedPairs(t, owner);
    const n1Before = await getDoc(t, n1);
    const planId = await dryRun(t, owner);

    const applyId = await apply(t, planId, true);

    expect((await getDoc(t, n2)).status).toBe("active");
    const all = await proposals(t);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({
      kind: "merge",
      status: "pending",
      dreamRunId: applyId,
    });
    expect((await summary(t, applyId)).counts.proposals).toBe(2);

    const proposal = all.find((p) => p.memoryId === n1Before.memoryId);
    if (!proposal) throw new Error("proposal missing");
    await approve(t, owner, proposal);
    expect(await getDoc(t, n2)).toMatchObject({
      status: "suppressed",
      mergedInto: n1,
      suppressedBy: "dream-ai",
      suppressedAt: expect.any(Number),
    });
    expect((await getDoc(t, n1)).content).toBe(proposal.proposedContent);
    await t.mutation(internal.dream.undoRunInternal, { runId: applyId });
    expect((await getDoc(t, n2)).status).toBe("active");
    expect((await getDoc(t, n1)).content).toBe(n1Before.content);
  });

  it("merges AI groups at once, with the merged text, when auto-accept is on", async () => {
    generateText.mockImplementation(async (call: GenerateCall) =>
      clusterReply(call),
    );
    const t = setupT();
    const owner = await addUser(t, "clerk_auto");
    const { a, b, c } = await seedCluster(t, owner);
    await t.run(async (ctx) => {
      await ctx.db.insert("userSettings", {
        userId: owner.userId,
        dreamModeAutoAccept: true,
      });
    });
    const planId = await dryRun(t, owner);
    const applyId = await apply(t, planId, true);
    for (const id of [b, c]) {
      expect(await getDoc(t, id)).toMatchObject({
        status: "suppressed",
        mergedInto: a,
        suppressedBy: "dream-ai",
        suppressedAt: expect.any(Number),
      });
    }
    expect((await getDoc(t, a)).content).toBe(MERGED.content);
    expect(await summary(t, applyId)).toMatchObject({
      counts: { nearDupMerged: 1, proposals: 0 },
    });
  });

  it("does not apply AI groups unless asked", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_noai");
    const { n2 } = await seedPairs(t, owner);
    await apply(t, await dryRun(t, owner));
    expect((await getDoc(t, n2)).status).toBe("active");
    expect(await proposals(t)).toHaveLength(0);
  });
});

describe("dreamCleanup web", () => {
  it("startDryRun -> latestForProfile -> applyCleanup -> undo one group", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_web");
    const user = t.withIdentity({ subject: owner.clerkId });
    const [first, ...rest] = await addVhub(t, owner);
    if (!first) throw new Error("no rows");
    const a = await addMemory(t, owner, { contentHash: "h" });
    const b = await addMemory(t, owner, { contentHash: "h" });

    const planId = await user.mutation(api.dreamCleanup.startDryRun, {
      profileId: owner.profileId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await user.query(api.dreamCleanup.latestForProfile, {
        profileId: owner.profileId,
      }),
    ).toMatchObject({ _id: planId, dryRun: true, status: "ok" });

    const applyId = await user.mutation(api.dreamCleanup.applyCleanup, {
      runId: planId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await user.query(api.dreamCleanup.latestForProfile, {
        profileId: owner.profileId,
      }),
    ).toMatchObject({ _id: applyId, dryRun: false, status: "ok" });
    await expect(
      user.mutation(api.dreamCleanup.applyCleanup, { runId: planId }),
    ).rejects.toThrow("already applied");
    for (const id of rest) {
      expect((await getDoc(t, id)).status).toBe("suppressed");
    }
    expect((await getDoc(t, b)).mergedInto).toBe(a);

    const page = await user.query(api.dream.listActions, {
      runId: applyId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    const exact = page.page.find((action) => action.keeperId === a);
    if (!exact) throw new Error("exact action missing");
    await user.mutation(api.dream.undoAction, { actionId: exact._id });
    expect((await getDoc(t, b)).status).toBe("active");
    for (const id of rest) {
      expect((await getDoc(t, id)).status).toBe("suppressed");
    }
  });

  it("only applies the caller's own dry run and rate limits scans", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_web_owner");
    const stranger = await addUser(t, "clerk_web_stranger");
    const asStranger = t.withIdentity({ subject: stranger.clerkId });
    await addMemory(t, owner, { contentHash: "h" });
    await addMemory(t, owner, { contentHash: "h" });
    const planId = await dryRun(t, owner);

    const strangerApply = await asStranger
      .mutation(api.dreamCleanup.applyCleanup, { runId: planId })
      .catch((err: unknown) => err);
    expect(strangerApply).toBeInstanceOf(ConvexError);
    expect(convexErrorData(strangerApply)).toBe("Dream run not found");
    const strangerScan = await asStranger
      .mutation(api.dreamCleanup.startDryRun, { profileId: owner.profileId })
      .catch((err: unknown) => err);
    expect(strangerScan).toBeInstanceOf(ConvexError);
    expect(convexErrorData(strangerScan)).toBe("Profile not found");
    expect(
      await asStranger.query(api.dreamCleanup.latestForProfile, {
        profileId: owner.profileId,
      }),
    ).toBeNull();
    const cooldown = await t
      .withIdentity({ subject: owner.clerkId })
      .mutation(api.dreamCleanup.startDryRun, { profileId: owner.profileId })
      .catch((err: unknown) => err);
    expect(cooldown).toBeInstanceOf(ConvexError);
    const data = convexErrorData(cooldown);
    expect(data).toMatchObject({
      message: expect.stringContaining("last hour"),
      nextAllowedAt: expect.any(Number),
    });
  });

  it("sends AI groups to the inbox even with auto-accept on", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_web_ai");
    const n1 = await addMemory(t, owner, { title: "Uses pnpm" });
    const n2 = await addMemory(t, owner, { title: "Prefers pnpm" });
    await embed(t, owner, n1, vector(0));
    await embed(t, owner, n2, vector(0, 0.1));
    await t.run(async (ctx) => {
      await ctx.db.insert("userSettings", {
        userId: owner.userId,
        dreamModeAutoAccept: true,
      });
    });
    const planId = await dryRun(t, owner);
    await t
      .withIdentity({ subject: owner.clerkId })
      .mutation(api.dreamCleanup.applyCleanup, { runId: planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await getDoc(t, n2)).status).toBe("active");
    const proposals = await t.run(async (ctx) =>
      ctx.db.query("proposedUpdates").collect(),
    );
    expect(proposals).toEqual([
      expect.objectContaining({ kind: "merge", status: "pending" }),
    ]);
  });

  it("skips the AI on a web scan when dreamModeUseAi is off", async () => {
    const t = setupT();
    const owner = await addUser(t, "clerk_web_noai");
    const n1 = await addMemory(t, owner, { title: "Uses pnpm" });
    const n2 = await addMemory(t, owner, { title: "Prefers pnpm" });
    await embed(t, owner, n1, vector(0));
    await embed(t, owner, n2, vector(0, 0.1));
    await t.run(async (ctx) => {
      await ctx.db.insert("userSettings", {
        userId: owner.userId,
        dreamModeUseAi: false,
      });
    });
    await t
      .withIdentity({ subject: owner.clerkId })
      .mutation(api.dreamCleanup.startDryRun, { profileId: owner.profileId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(generateText).not.toHaveBeenCalled();
  });
});
