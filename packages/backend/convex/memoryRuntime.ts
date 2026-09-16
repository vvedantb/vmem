import type { MemoryCandidate, MemoryType, MemoryWithTags } from "@vmem/sdk";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { MemoryListResult } from "./memoryApi/types";
import { resolveProfileIdForClerkId } from "./memoryScope";
import {
  toMemoryStatusOrUndefined,
  toMemoryTypeOrUndefined,
} from "../engine/memory/parse";
import { memoryMatchesListFilter } from "../engine/memory/list";
import { relatedMemories } from "../engine/memory/rank";
import {
  rankMemories,
  summarizeRetrievedMemories,
  toMemoryCandidate,
} from "../engine/memory/retrieve";
import { bestEffortEmbedOne } from "./lib/openRouter/bestEffortEmbed";
import { scheduleContextPromptInvalidationByClerkId } from "./lib/contextPromptInvalidate";

type MemoryCtx = Pick<ActionCtx, "runQuery" | "runMutation" | "scheduler">;

export const toMemoryType = toMemoryTypeOrUndefined;
export const toMemoryStatus = toMemoryStatusOrUndefined;
export { toMemoryCandidate, summarizeRetrievedMemories };

export interface CreateMemoryRuntimeArgs {
  clerkId: string;
  profileId?: string;
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
  externalId?: string;
  sourceType?: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
}

export interface ListMemoryRuntimeArgs {
  clerkId: string;
  profileId?: string;
  type?: string;
  status?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
  limit: number;
  offset: number;
}

export interface UpdateMemoryRuntimeArgs {
  clerkId: string;
  memoryId: string;
  title?: string;
  content?: string;
  type?: MemoryType;
  status?: ReturnType<typeof toMemoryStatus>;
  tags?: string[];
  confidence?: number;
  expiresAt?: string | null;
}

export async function createMemoryForClerk(
  ctx: MemoryCtx,
  args: CreateMemoryRuntimeArgs,
): Promise<MemoryWithTags> {
  const profileId = await resolveProfileIdForClerkId(
    ctx,
    args.clerkId,
    args.profileId,
  );
  const created = await ctx.runMutation(
    internal.memoryStore.functions.createMemoryInternal,
    {
      userId: args.clerkId,
      profileId,
      title: args.title,
      content: args.content,
      type: args.type,
      source: args.source,
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
      url: args.url,
      sourceType: args.sourceType ?? args.source,
      sourceId: args.externalId,
      storageId: args.storageId,
      mimeType: args.mimeType,
      originalFilename: args.originalFilename,
    },
  );
  await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);
  await scheduleMemoryEmbedding(ctx, {
    clerkId: args.clerkId,
    memoryId: created.id,
    profileId: created.profileId ?? args.profileId,
    title: created.title,
    content: created.content,
  });
  return created;
}

export async function listMemoriesForClerk(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: ListMemoryRuntimeArgs,
): Promise<MemoryListResult> {
  const profileId = await resolveProfileIdForClerkId(
    ctx,
    args.clerkId,
    args.profileId,
  );
  return await ctx.runQuery(
    internal.memoryStore.functions.listMemoriesInternal,
    {
      userId: args.clerkId,
      profileId,
      type: args.type,
      status: args.status,
      source: args.source,
      tags: args.tags,
      searchQuery: args.searchQuery,
      limit: args.limit,
      offset: args.offset,
    },
  );
}

export async function listMemoriesForTeamProfile(
  ctx: Pick<ActionCtx, "runQuery">,
  args: Omit<ListMemoryRuntimeArgs, "clerkId"> & { profileId: string },
): Promise<MemoryListResult> {
  return await ctx.runQuery(
    internal.memoryStore.functions.listMemoriesForTeamInternal,
    {
      profileId: args.profileId,
      type: args.type,
      status: args.status,
      source: args.source,
      tags: args.tags,
      searchQuery: args.searchQuery,
      limit: args.limit,
      offset: args.offset,
    },
  );
}

export async function getMemoryForClerk(
  ctx: Pick<ActionCtx, "runQuery">,
  clerkId: string,
  memoryId: string,
): Promise<MemoryWithTags | null> {
  return await ctx.runQuery(internal.memoryStore.functions.getMemoryInternal, {
    userId: clerkId,
    memoryId,
  });
}

export async function updateMemoryForClerk(
  ctx: MemoryCtx,
  args: UpdateMemoryRuntimeArgs,
): Promise<MemoryWithTags | null> {
  const updated = await ctx.runMutation(
    internal.memoryStore.functions.updateMemoryInternal,
    {
      userId: args.clerkId,
      memoryId: args.memoryId,
      title: args.title,
      content: args.content,
      type: args.type,
      status: args.status,
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
    },
  );
  if (updated) {
    await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);
    if (args.title !== undefined || args.content !== undefined) {
      await scheduleMemoryEmbedding(ctx, {
        clerkId: args.clerkId,
        memoryId: updated.id,
        profileId: updated.profileId ?? undefined,
        title: updated.title,
        content: updated.content,
      });
    }
  }
  return updated;
}

export async function deleteMemoryForClerk(
  ctx: MemoryCtx,
  clerkId: string,
  memoryId: string,
): Promise<boolean> {
  const deleted = await ctx.runMutation(
    internal.memoryStore.functions.deleteMemoryInternal,
    { userId: clerkId, memoryId },
  );
  if (deleted) {
    await scheduleContextPromptInvalidationByClerkId(ctx, clerkId);
  }
  return deleted;
}

const RETRIEVE_RECENT_CAP = 500;
const VECTOR_CANDIDATE_LIMIT = 32;

async function scheduleMemoryEmbedding(
  ctx: MemoryCtx,
  args: {
    clerkId: string;
    memoryId: string;
    profileId?: string | null;
    title: string;
    content: string;
  },
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.memoryEmbed.embedMemoryInternal, {
    clerkId: args.clerkId,
    memoryId: args.memoryId,
    profileId: args.profileId ?? undefined,
    text: `${args.title}\n${args.content}`,
  });
}

export async function retrieveMemoriesForClerk(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    profileId?: string;
    query: string;
    type?: string;
    tags?: string[];
    limit: number;
  },
): Promise<MemoryCandidate[]> {
  return retrieveRanked(ctx, {
    kind: "personal",
    clerkId: args.clerkId,
    profileId: args.profileId,
    query: args.query,
    type: args.type,
    tags: args.tags,
    limit: args.limit,
  });
}

export async function retrieveMemoriesForTeamProfile(
  ctx: ActionCtx,
  args: {
    clerkId?: string;
    profileId: string;
    query: string;
    type?: string;
    tags?: string[];
    limit: number;
  },
): Promise<MemoryCandidate[]> {
  return retrieveRanked(ctx, {
    kind: "team",
    clerkId: args.clerkId,
    profileId: args.profileId,
    query: args.query,
    type: args.type,
    tags: args.tags,
    limit: args.limit,
  });
}

async function retrieveRanked(
  ctx: ActionCtx,
  args: {
    kind: "personal" | "team";
    clerkId?: string;
    profileId?: string;
    query: string;
    type?: string;
    tags?: string[];
    limit: number;
  },
): Promise<MemoryCandidate[]> {
  const listed =
    args.kind === "team" && args.profileId !== undefined
      ? await listMemoriesForTeamProfile(ctx, {
          profileId: args.profileId,
          type: args.type,
          tags: args.tags,
          limit: RETRIEVE_RECENT_CAP,
          offset: 0,
        })
      : args.clerkId === undefined
        ? { memories: [], total: 0 }
        : await listMemoriesForClerk(ctx, {
            clerkId: args.clerkId,
            profileId: args.profileId,
            type: args.type,
            tags: args.tags,
            limit: RETRIEVE_RECENT_CAP,
            offset: 0,
          });

  const [ftsHits, vectorHits] = await Promise.all([
    ctx.runQuery(internal.memoryStore.functions.searchMemoriesTextInternal, {
      kind: args.kind,
      userId: args.clerkId,
      profileId: args.profileId,
      query: args.query,
    }),
    vectorScoresForQuery(ctx, args),
  ]);

  const byId = new Map<string, MemoryWithTags>();
  for (const memory of listed.memories) byId.set(memory.id, memory);
  for (const hit of ftsHits) {
    if (
      memoryMatchesListFilter(hit.memory, { type: args.type, tags: args.tags })
    ) {
      byId.set(hit.memory.id, hit.memory);
    }
  }
  for (const hit of vectorHits.memories) {
    if (memoryMatchesListFilter(hit, { type: args.type, tags: args.tags })) {
      byId.set(hit.id, hit);
    }
  }

  const ftsRanks = new Map<string, number>();
  for (const hit of ftsHits) {
    ftsRanks.set(hit.memory.id, 1 / hit.rank);
  }

  return rankMemories([...byId.values()], args.query, {
    limit: args.limit,
    vectorScores: vectorHits.scores,
    ftsRanks,
  });
}

async function vectorScoresForQuery(
  ctx: ActionCtx,
  args: {
    kind: "personal" | "team";
    clerkId?: string;
    profileId?: string;
    query: string;
  },
): Promise<{ memories: MemoryWithTags[]; scores: Map<string, number> }> {
  const memories: MemoryWithTags[] = [];
  const scores = new Map<string, number>();
  const empty = { memories, scores };
  if (args.query.trim().length === 0 || args.clerkId === undefined)
    return empty;

  const embedding = await bestEffortEmbedOne({
    ctx,
    clerkId: args.clerkId,
    profileId: args.profileId,
    feature: "memory-search",
    failureLog: "[memoryRuntime] query embedding failed",
    text: args.query,
  });
  if (!embedding) return empty;

  const clerkId = args.clerkId;
  const profileId = args.profileId;
  const hits =
    args.kind === "team" && profileId !== undefined
      ? await ctx.vectorSearch("memories", "by_embedding", {
          vector: embedding,
          limit: VECTOR_CANDIDATE_LIMIT,
          filter: (q) => q.eq("profileId", profileId),
        })
      : await ctx.vectorSearch("memories", "by_embedding", {
          vector: embedding,
          limit: VECTOR_CANDIDATE_LIMIT,
          filter: (q) => q.eq("userId", clerkId),
        });
  if (hits.length === 0) return empty;

  const docs = await ctx.runQuery(
    internal.memoryStore.functions.getMemoriesByDocIdsInternal,
    { ids: hits.map((hit) => hit._id) },
  );
  for (let i = 0; i < hits.length; i += 1) {
    const memory = docs[i];
    const hit = hits[i];
    if (memory === null || memory === undefined || hit === undefined) continue;
    memories.push(memory);
    scores.set(memory.id, Math.max(0, hit._score));
  }
  return { memories, scores };
}

export async function relatedMemoriesForClerk(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    clerkId: string;
    profileId?: string;
    memoryId: string;
    limit?: number;
  },
): Promise<Array<{ memory: MemoryWithTags; reason: string }>> {
  const seed = await getMemoryForClerk(ctx, args.clerkId, args.memoryId);
  if (!seed) return [];
  const listed = await listMemoriesForClerk(ctx, {
    clerkId: args.clerkId,
    profileId: args.profileId ?? seed.profileId ?? undefined,
    limit: RETRIEVE_RECENT_CAP,
    offset: 0,
  });
  return relatedMemories(seed, listed.memories, args.limit ?? 10).map(
    (hit) => ({
      memory: hit.memory,
      reason: hit.reason,
    }),
  );
}

export async function relatedMemoriesForTeamProfile(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { profileId: string; memoryId: string; limit?: number },
): Promise<Array<{ memory: MemoryWithTags; reason: string }>> {
  const seed = await ctx.runQuery(
    internal.memoryStore.functions.getMemoryForTeamInternal,
    { profileId: args.profileId, memoryId: args.memoryId },
  );
  if (!seed) return [];
  const listed = await listMemoriesForTeamProfile(ctx, {
    profileId: args.profileId,
    limit: RETRIEVE_RECENT_CAP,
    offset: 0,
  });
  return relatedMemories(seed, listed.memories, args.limit ?? 10).map(
    (hit) => ({
      memory: hit.memory,
      reason: hit.reason,
    }),
  );
}

export async function storeMemoryFromInstruction(
  ctx: MemoryCtx,
  args: { clerkId: string; instruction: string; profileId?: string },
): Promise<{ created: MemoryWithTags[]; summary: string }> {
  const instruction = args.instruction.trim();
  // Non-LLM fallback: persist the instruction as one knowledge memory.
  // Does not require OpenRouter and does not return HTTP 422.
  const created = await createMemoryForClerk(ctx, {
    clerkId: args.clerkId,
    profileId: args.profileId,
    title: instruction.slice(0, 80) || "Instruction",
    content: instruction,
    type: "knowledge",
    source: "instruction",
    tags: ["instruction"],
    confidence: 0.9,
    sourceType: "instruction",
  });
  return {
    created: [created],
    summary: "Stored 1 memory from instruction.",
  };
}
