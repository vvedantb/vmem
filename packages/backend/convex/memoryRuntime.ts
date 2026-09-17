import type {
  MemoryCandidate,
  MemoryType,
  MemoryWithTags,
  TemporalKind,
} from "@vmem/sdk";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { MemoryListResult } from "./memoryApi/types";
import { getProfileKind, resolveProfileIdForClerkId } from "./memoryScope";
import {
  toMemoryStatusOrUndefined,
  toMemoryTypeOrUndefined,
} from "../engine/memory/parse";
import { expandGraphNeighbors } from "../engine/memory/links";
import { memoryMatchesListFilter } from "../engine/memory/list";
import { memoryMatchesScope } from "../engine/memory/scope";
import {
  clampVectorLimit,
  RETRIEVE_GRAPH_MAX_HOPS,
  RETRIEVE_GRAPH_NEIGHBOR_LIMIT,
  RETRIEVE_RANK_POOL_CAP,
  RETRIEVE_RECENT_CAP,
  VECTOR_CANDIDATE_LIMIT,
} from "../engine/memory/retrieveCaps";
import { queryEmbeddingText } from "../engine/memory/synonyms";
import { buildSearchableText } from "../engine/memory/searchableText";
import { parseReferenceMs } from "../engine/memory/temporal";
import { OpenRouterRequiredError } from "../engine/memory/openRouterRequired";
import { relatedMemories } from "../engine/memory/rank";
import {
  retrieveMemoriesFromPool,
  summarizeRetrievedMemories,
  toMemoryCandidate,
} from "../engine/memory/retrieve";
import {
  applyJevRetrieveGate,
  jevRankPoolLimit,
  wantsJevJudge,
} from "../engine/memory/jevGate";
import {
  readSystemOneApiKey,
  SYSTEMONE_API_KEY_ENV_NAMES,
} from "../engine/llm/systemOneClient";
import { tryUserAndApiKeyByClerkId } from "./lib/envVars";
import { bestEffortEmbedOne } from "./lib/openRouter/bestEffortEmbed";
import { callJsonChat } from "./lib/openRouter/jsonChat";
import { scheduleContextPromptInvalidationByClerkId } from "./lib/contextPromptInvalidate";
import {
  buildFactExtractionPrompt,
  parseFactExtractionResponse,
  type ExtractedFact,
} from "../engine/memory/extractFacts";
import {
  buildFactDecisionPrompt,
  parseFactDecisionResponse,
  resolveFactDecision,
} from "../engine/memory/factDecision";
import {
  instructionTitle,
  UPDATES_LINK_REASON,
  visibleDecisionCandidates,
  type DecisionCandidate,
  type FactDecision,
} from "../engine/memory/supersede";
import { scheduleDreamTriggerCheck } from "./lib/dreamTriggerInvalidate";
import type { MemoryReadScope } from "../engine/memory/scope";

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
  eventStart?: string | null;
  eventEnd?: string | null;
  temporalKind?: TemporalKind | null;
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
      eventStart: args.eventStart,
      eventEnd: args.eventEnd,
      temporalKind: args.temporalKind,
    },
  );
  await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);
  if (args.source !== "dream-merge") {
    await scheduleDreamTriggerCheck(ctx, args.clerkId);
  }
  await scheduleMemoryEmbedding(ctx, {
    clerkId: args.clerkId,
    memoryId: created.id,
    profileId: created.profileId ?? args.profileId,
    title: created.title,
    content: created.content,
    tags: created.tags,
  });
  await scheduleMemoryEntityExtraction(ctx, {
    clerkId: args.clerkId,
    memoryId: created.id,
    profileId: created.profileId ?? args.profileId,
    updatedAt: created.updatedAt,
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
    if (
      args.title !== undefined ||
      args.content !== undefined ||
      args.tags !== undefined
    ) {
      await scheduleMemoryEmbedding(ctx, {
        clerkId: args.clerkId,
        memoryId: updated.id,
        profileId: updated.profileId ?? undefined,
        title: updated.title,
        content: updated.content,
        tags: updated.tags,
      });
      await scheduleMemoryEntityExtraction(ctx, {
        clerkId: args.clerkId,
        memoryId: updated.id,
        profileId: updated.profileId ?? undefined,
        updatedAt: updated.updatedAt,
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

async function scheduleMemoryEmbedding(
  ctx: MemoryCtx,
  args: {
    clerkId: string;
    memoryId: string;
    profileId?: string | null;
    title: string;
    content: string;
    tags?: readonly string[];
  },
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.memoryEmbed.embedMemoryInternal, {
    clerkId: args.clerkId,
    memoryId: args.memoryId,
    profileId: args.profileId ?? undefined,
    text: buildSearchableText(args.title, args.content, args.tags ?? []),
  });
}

async function scheduleMemoryEntityExtraction(
  ctx: MemoryCtx,
  args: {
    clerkId: string;
    memoryId: string;
    profileId?: string | null;
    updatedAt: string;
  },
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal.memoryExtract.extractMemoryEntitiesInternal,
    {
      clerkId: args.clerkId,
      memoryId: args.memoryId,
      profileId: args.profileId ?? undefined,
      updatedAt: args.updatedAt,
    },
  );
}

export async function retrieveMemoriesForClerk(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    profileId?: string;
    query: string;
    type?: string;
    tags?: string[];
    status?: string;
    source?: string;
    limit: number;
    threshold?: number;
    rerank?: boolean | "jev";
    judge?: "jev";
    referenceDate?: string;
  },
): Promise<MemoryCandidate[]> {
  return retrieveRanked(ctx, {
    kind: "personal",
    clerkId: args.clerkId,
    profileId: args.profileId,
    query: args.query,
    type: args.type,
    tags: args.tags,
    status: args.status,
    source: args.source,
    limit: args.limit,
    threshold: args.threshold,
    rerank: args.rerank,
    judge: args.judge,
    referenceDate: args.referenceDate,
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
    status?: string;
    source?: string;
    limit: number;
    threshold?: number;
    rerank?: boolean | "jev";
    judge?: "jev";
    referenceDate?: string;
  },
): Promise<MemoryCandidate[]> {
  return retrieveRanked(ctx, {
    kind: "team",
    clerkId: args.clerkId,
    profileId: args.profileId,
    query: args.query,
    type: args.type,
    tags: args.tags,
    status: args.status,
    source: args.source,
    limit: args.limit,
    threshold: args.threshold,
    rerank: args.rerank,
    judge: args.judge,
    referenceDate: args.referenceDate,
  });
}

async function listRecentForRetrieve(
  ctx: ActionCtx,
  args: {
    kind: "personal" | "team";
    clerkId?: string;
    profileId?: string;
    type?: string;
    tags?: string[];
    status?: string;
    source?: string;
  },
): Promise<MemoryWithTags[]> {
  if (args.kind === "team" && args.profileId !== undefined) {
    const listed = await listMemoriesForTeamProfile(ctx, {
      profileId: args.profileId,
      type: args.type,
      tags: args.tags,
      status: args.status,
      source: args.source,
      limit: RETRIEVE_RECENT_CAP,
      offset: 0,
    });
    return listed.memories;
  }
  if (args.clerkId === undefined) return [];
  const listed = await listMemoriesForClerk(ctx, {
    clerkId: args.clerkId,
    profileId: args.profileId,
    type: args.type,
    tags: args.tags,
    status: args.status,
    source: args.source,
    limit: RETRIEVE_RECENT_CAP,
    offset: 0,
  });
  return listed.memories;
}

async function resolveSystemOneApiKey(
  ctx: ActionCtx,
  clerkId: string | undefined,
): Promise<string | undefined> {
  if (clerkId !== undefined) {
    for (const name of SYSTEMONE_API_KEY_ENV_NAMES) {
      const found = await tryUserAndApiKeyByClerkId(ctx, clerkId, name);
      if (found === null) continue;
      const trimmed = found.apiKey.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return readSystemOneApiKey();
}

async function maybeApplyJevRetrieveGate(
  ctx: ActionCtx,
  args: {
    clerkId?: string;
    query: string;
    judge?: "jev";
    rerank?: boolean | "jev";
    limit: number;
    referenceDate?: string;
  },
  ranked: MemoryCandidate[],
): Promise<MemoryCandidate[]> {
  if (!wantsJevJudge(args)) return ranked;
  if (ranked.length === 0) return ranked;
  if (args.query.trim().length === 0) return ranked;
  const apiKey = await resolveSystemOneApiKey(ctx, args.clerkId);
  if (apiKey === undefined) return ranked;
  return applyJevRetrieveGate({
    query: args.query,
    hits: ranked,
    apiKey,
    referenceDate: args.referenceDate,
    limit: args.limit,
  });
}

async function finishRetrieve(
  ctx: ActionCtx,
  args: {
    clerkId?: string;
    query: string;
    judge?: "jev";
    rerank?: boolean | "jev";
    limit: number;
    referenceDate?: string;
  },
  ranked: MemoryCandidate[],
): Promise<MemoryCandidate[]> {
  const gated = await maybeApplyJevRetrieveGate(ctx, args, ranked);
  return gated.slice(0, Math.max(0, args.limit));
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
    status?: string;
    source?: string;
    limit: number;
    threshold?: number;
    rerank?: boolean | "jev";
    judge?: "jev";
    referenceDate?: string;
  },
): Promise<MemoryCandidate[]> {
  const listFilter = {
    type: args.type,
    tags: args.tags,
    status: args.status,
    source: args.source,
  };
  const trimmed = args.query.trim();
  const jev = wantsJevJudge(args);
  const rankOpts = {
    limit: jevRankPoolLimit(args.limit, jev),
    nowMs: parseReferenceMs(args.referenceDate, Date.now()),
    threshold: args.threshold,
    rerank: args.rerank === true,
    ...listFilter,
  };
  if (trimmed.length === 0) {
    const recent = await listRecentForRetrieve(ctx, args);
    return finishRetrieve(
      ctx,
      args,
      retrieveMemoriesFromPool(recent, args.query, rankOpts),
    );
  }

  const [ftsHits, vectorHits, links] = await Promise.all([
    ctx.runQuery(internal.memoryStore.functions.searchMemoriesTextInternal, {
      kind: args.kind,
      userId: args.clerkId,
      profileId: args.profileId,
      query: args.query,
    }),
    vectorScoresForQuery(ctx, args),
    args.clerkId === undefined
      ? Promise.resolve([])
      : ctx.runQuery(
          internal.memoryStore.functions.listMemoryLinksForUserInternal,
          { userId: args.clerkId },
        ),
  ]);

  const byId = new Map<string, MemoryWithTags>();
  const ftsRanks = new Map<string, number>();
  for (const hit of ftsHits) {
    ftsRanks.set(hit.memory.id, 1 / hit.rank);
    if (
      byId.size < RETRIEVE_RANK_POOL_CAP &&
      memoryMatchesListFilter(hit.memory, listFilter)
    ) {
      byId.set(hit.memory.id, hit.memory);
    }
  }
  for (const hit of vectorHits.memories) {
    if (
      byId.size < RETRIEVE_RANK_POOL_CAP &&
      memoryMatchesListFilter(hit, listFilter)
    ) {
      byId.set(hit.id, hit);
    }
  }

  if (links.length > 0 && byId.size > 0 && byId.size < RETRIEVE_RANK_POOL_CAP) {
    const seedTitleById = new Map(
      [...byId.values()].map((memory) => [memory.id, memory.title]),
    );
    const neighbors = expandGraphNeighbors(
      [...byId.keys()],
      seedTitleById,
      links,
      RETRIEVE_GRAPH_NEIGHBOR_LIMIT,
      RETRIEVE_GRAPH_MAX_HOPS,
    );
    const missing = neighbors
      .map((neighbor) => neighbor.id)
      .filter((id) => !byId.has(id))
      .slice(0, RETRIEVE_RANK_POOL_CAP - byId.size);
    if (missing.length > 0) {
      const docs = await ctx.runQuery(
        internal.memoryStore.functions.getMemoriesByMemoryIdsInternal,
        { ids: missing },
      );
      for (const memory of docs) {
        if (memory === null || memory === undefined) continue;
        if (!memoryMatchesListFilter(memory, listFilter)) continue;
        if (args.kind === "team") {
          if (args.profileId === undefined) continue;
          if (
            !memoryMatchesScope(memory, {
              kind: "team",
              profileId: args.profileId,
            })
          ) {
            continue;
          }
        } else if (args.clerkId !== undefined) {
          if (
            !memoryMatchesScope(memory, {
              kind: "personal",
              userId: args.clerkId,
              profileId: args.profileId,
            })
          ) {
            continue;
          }
        }
        if (byId.size >= RETRIEVE_RANK_POOL_CAP) break;
        byId.set(memory.id, memory);
      }
    }
  }

  if (byId.size === 0) {
    const recent = await listRecentForRetrieve(ctx, args);
    return finishRetrieve(
      ctx,
      args,
      retrieveMemoriesFromPool(recent, args.query, {
        ...rankOpts,
        vectorScores: vectorHits.scores,
        ftsRanks,
        links,
      }),
    );
  }

  return finishRetrieve(
    ctx,
    args,
    retrieveMemoriesFromPool([...byId.values()], args.query, {
      ...rankOpts,
      vectorScores: vectorHits.scores,
      ftsRanks,
      links,
    }),
  );
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
    text: queryEmbeddingText(args.query),
  });
  if (!embedding) return empty;

  const clerkId = args.clerkId;
  const profileId = args.profileId;
  const hits =
    args.kind === "team" && profileId !== undefined
      ? await ctx.vectorSearch("memories", "by_embedding", {
          vector: embedding,
          limit: clampVectorLimit(VECTOR_CANDIDATE_LIMIT),
          filter: (q) => q.eq("profileId", profileId),
        })
      : await ctx.vectorSearch("memories", "by_embedding", {
          vector: embedding,
          limit: clampVectorLimit(VECTOR_CANDIDATE_LIMIT),
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

async function instructionWriteScope(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  clerkId: string,
  profileId?: string,
): Promise<{
  profileId: string;
  kind: "personal" | "team";
  scope: MemoryReadScope;
}> {
  const resolved = await resolveProfileIdForClerkId(ctx, clerkId, profileId);
  const kind = await getProfileKind(ctx, resolved);
  const scope: MemoryReadScope =
    kind === "team"
      ? { kind: "team", profileId: resolved }
      : { kind: "personal", userId: clerkId, profileId: resolved };
  return { profileId: resolved, kind, scope };
}

function scopeMutationArgs(scope: MemoryReadScope): {
  kind: "personal" | "team";
  userId?: string;
  profileId?: string;
} {
  if (scope.kind === "team") {
    return { kind: "team", profileId: scope.profileId };
  }
  return {
    kind: "personal",
    userId: scope.userId,
    profileId: scope.profileId ?? undefined,
  };
}

async function collectInstructionCandidates(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  scope: MemoryReadScope,
): Promise<{ memories: MemoryWithTags[]; candidates: DecisionCandidate[] }> {
  const memories = await ctx.runQuery(
    internal.memoryStore.functions.collectScopedMemoriesInternal,
    scope.kind === "team"
      ? { kind: "team", profileId: scope.profileId }
      : {
          kind: "personal",
          userId: scope.userId,
          profileId: scope.profileId ?? undefined,
        },
  );
  return { memories, candidates: visibleDecisionCandidates(memories) };
}

async function supersedeInstructionTargets(
  ctx: Pick<ActionCtx, "runMutation">,
  scope: MemoryReadScope,
  predecessorIds: string[],
  successorId?: string,
): Promise<void> {
  if (predecessorIds.length === 0) return;
  await ctx.runMutation(
    internal.memoryStore.functions.supersedeMemoriesInternal,
    {
      ...scopeMutationArgs(scope),
      predecessorIds,
      successorId,
      reason: UPDATES_LINK_REASON,
    },
  );
}

async function writeInstructionMemory(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    profileId: string;
    text: string;
    extracted: boolean;
    temporalKind?: ExtractedFact["temporalKind"];
    eventStart?: string;
    eventEnd?: string;
  },
): Promise<MemoryWithTags> {
  const source = args.extracted ? "sdk-extracted" : "instruction";
  return createMemoryForClerk(ctx, {
    clerkId: args.clerkId,
    profileId: args.profileId,
    title: instructionTitle(args.text),
    content: args.text,
    type: "knowledge",
    source,
    tags: [source],
    confidence: 0.9,
    sourceType: source,
    temporalKind: args.temporalKind,
    eventStart: args.eventStart,
    eventEnd: args.eventEnd,
  });
}

async function extractInstructionFacts(
  ctx: ActionCtx,
  args: { clerkId: string; instruction: string; profileId?: string },
): Promise<{ facts: ExtractedFact[]; extracted: boolean }> {
  const openRouter = await tryUserAndApiKeyByClerkId(
    ctx,
    args.clerkId,
    "OPENROUTER_API_KEY",
  );
  if (!openRouter) throw new OpenRouterRequiredError();

  const instruction = args.instruction.trim();
  const now = new Date().toISOString();
  const extractionRaw = await callJsonChat(ctx, {
    apiKey: openRouter.apiKey,
    userId: openRouter.userId,
    profileId: args.profileId,
    feature: "fact-extraction",
    prompt: buildFactExtractionPrompt(instruction, now, now),
  });
  const extracted = extractionRaw
    ? parseFactExtractionResponse(extractionRaw)
    : null;
  const facts = extracted?.facts.filter((fact) => fact.text.length > 0) ?? [];
  return {
    facts: facts.length > 0 ? facts : [{ id: 0, text: instruction }],
    extracted: facts.length > 0,
  };
}

function dropCandidate(
  candidates: DecisionCandidate[],
  id: string,
): DecisionCandidate[] {
  return candidates.filter((candidate) => candidate.id !== id);
}

async function applyInstructionDecision(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    profileId: string;
    scope: MemoryReadScope;
    extracted: boolean;
    fact: ExtractedFact;
    decision: FactDecision;
    memoriesById: Map<string, MemoryWithTags>;
    candidates: DecisionCandidate[];
  },
): Promise<{
  applied: MemoryWithTags | null;
  created: boolean;
  candidates: DecisionCandidate[];
}> {
  const { decision } = args;
  if (decision.event === "NONE") {
    const existing =
      decision.targetId === undefined
        ? null
        : (args.memoriesById.get(decision.targetId) ?? null);
    return { applied: existing, created: false, candidates: args.candidates };
  }
  if (decision.event === "DELETE") {
    if (decision.targetId !== undefined) {
      await supersedeInstructionTargets(ctx, args.scope, [decision.targetId]);
      args.memoriesById.delete(decision.targetId);
    }
    return {
      applied: null,
      created: false,
      candidates: decision.targetId
        ? dropCandidate(args.candidates, decision.targetId)
        : args.candidates,
    };
  }
  const created = await writeInstructionMemory(ctx, {
    clerkId: args.clerkId,
    profileId: args.profileId,
    text: decision.text,
    extracted: args.extracted,
    temporalKind: args.fact.temporalKind,
    eventStart: args.fact.eventStart,
    eventEnd: args.fact.eventEnd,
  });
  if (decision.event === "UPDATE" && decision.targetId !== undefined) {
    await supersedeInstructionTargets(
      ctx,
      args.scope,
      [decision.targetId],
      created.id,
    );
    args.memoriesById.delete(decision.targetId);
  }
  args.memoriesById.set(created.id, created);
  const nextCandidates = dropCandidate(
    args.candidates,
    decision.targetId ?? "",
  );
  nextCandidates.push({
    id: created.id,
    title: created.title,
    content: created.content,
  });
  return { applied: created, created: true, candidates: nextCandidates };
}

async function decideInstructionFact(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    profileId: string;
    kind: "personal" | "team";
    factText: string;
    candidates: DecisionCandidate[];
    useLlm: boolean;
  },
): Promise<FactDecision> {
  if (!args.useLlm) {
    return resolveFactDecision({
      factText: args.factText,
      candidates: args.candidates,
    });
  }
  const related =
    args.kind === "team"
      ? await retrieveMemoriesForTeamProfile(ctx, {
          clerkId: args.clerkId,
          profileId: args.profileId,
          query: args.factText,
          limit: 8,
        })
      : await retrieveMemoriesForClerk(ctx, {
          clerkId: args.clerkId,
          profileId: args.profileId,
          query: args.factText,
          limit: 8,
        });
  const byId = new Map(
    args.candidates.map((candidate) => [candidate.id, candidate]),
  );
  for (const hit of related) {
    if (!byId.has(hit.id)) {
      byId.set(hit.id, {
        id: hit.id,
        title: hit.title,
        content: hit.content,
      });
    }
  }
  const candidates = [...byId.values()];
  const openRouter = await tryUserAndApiKeyByClerkId(
    ctx,
    args.clerkId,
    "OPENROUTER_API_KEY",
  );
  let llmDecision: FactDecision | null = null;
  if (openRouter) {
    const raw = await callJsonChat(ctx, {
      apiKey: openRouter.apiKey,
      userId: openRouter.userId,
      profileId: args.profileId,
      feature: "fact-extraction",
      prompt: buildFactDecisionPrompt(args.factText, candidates),
    });
    llmDecision = raw
      ? parseFactDecisionResponse(raw, args.factText, candidates)
      : null;
  }
  return resolveFactDecision({
    factText: args.factText,
    candidates,
    llmDecision,
  });
}

export async function storeMemoryFromInstruction(
  ctx: ActionCtx,
  args: { clerkId: string; instruction: string; profileId?: string },
): Promise<{ created: MemoryWithTags[]; summary: string }> {
  const { facts, extracted } = await extractInstructionFacts(ctx, args);
  const { profileId, scope } = await instructionWriteScope(
    ctx,
    args.clerkId,
    args.profileId,
  );
  const collected = await collectInstructionCandidates(ctx, scope);
  let candidates = collected.candidates;
  const memoriesById = new Map(
    collected.memories.map((memory) => [memory.id, memory]),
  );
  const created: MemoryWithTags[] = [];
  for (const fact of facts) {
    const decision = await decideInstructionFact(ctx, {
      clerkId: args.clerkId,
      profileId,
      kind: scope.kind,
      factText: fact.text,
      candidates,
      useLlm: false,
    });
    const applied = await applyInstructionDecision(ctx, {
      clerkId: args.clerkId,
      profileId,
      scope,
      extracted,
      fact,
      decision,
      memoriesById,
      candidates,
    });
    candidates = applied.candidates;
    if (applied.created && applied.applied) created.push(applied.applied);
  }
  if (created.length > 1) {
    for (let i = 0; i < created.length; i += 1) {
      const left = created[i];
      if (left === undefined) continue;
      for (let j = i + 1; j < created.length; j += 1) {
        const right = created[j];
        if (right === undefined) continue;
        await ctx.runMutation(
          internal.memoryStore.functions.linkMemoriesInternal,
          {
            userId: args.clerkId,
            profileId: left.profileId ?? args.profileId,
            memoryIdA: left.id,
            memoryIdB: right.id,
            reason: "extracted together",
            origin: "extract",
          },
        );
      }
    }
  }
  return {
    created,
    summary: `Stored ${String(created.length)} ${created.length === 1 ? "memory" : "memories"} from the instruction.`,
  };
}

export async function updateMemoryFromInstruction(
  ctx: ActionCtx,
  args: { clerkId: string; instruction: string; profileId?: string },
): Promise<{
  applied: MemoryWithTags[];
  proposals: Array<{
    id: string;
    memoryId: string;
    proposedContent: string;
    reason: string;
    kind: string;
    status: string;
  }>;
  summary: string;
}> {
  const { facts, extracted } = await extractInstructionFacts(ctx, args);
  const { profileId, scope } = await instructionWriteScope(
    ctx,
    args.clerkId,
    args.profileId,
  );
  const collected = await collectInstructionCandidates(ctx, scope);
  let candidates = collected.candidates;
  const memoriesById = new Map(
    collected.memories.map((memory) => [memory.id, memory]),
  );
  const applied: MemoryWithTags[] = [];
  let superseded = 0;
  for (const fact of facts) {
    const decision = await decideInstructionFact(ctx, {
      clerkId: args.clerkId,
      profileId,
      kind: scope.kind,
      factText: fact.text,
      candidates,
      useLlm: true,
    });
    const result = await applyInstructionDecision(ctx, {
      clerkId: args.clerkId,
      profileId,
      scope,
      extracted,
      fact,
      decision,
      memoriesById,
      candidates,
    });
    candidates = result.candidates;
    if (decision.event === "UPDATE" || decision.event === "DELETE") {
      superseded += 1;
    }
    if (result.applied) applied.push(result.applied);
  }
  return {
    applied,
    proposals: [],
    summary: `Applied ${String(applied.length)} ${applied.length === 1 ? "memory" : "memories"} and superseded ${String(superseded)} ${superseded === 1 ? "row" : "rows"}.`,
  };
}
