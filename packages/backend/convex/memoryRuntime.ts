import type {
  MemoryCandidate,
  MemoryType,
  MemoryWithTags,
  TemporalKind,
} from "@vmem/sdk";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { MemoryListResult } from "./memoryApi/types";
import type { SearchMemoriesPage } from "./memoryStore/helpers";
import { getProfileKind, resolveProfileIdForClerkId } from "./memoryScope";
import {
  toMemoryStatusOrUndefined,
  toMemoryTypeOrUndefined,
} from "../engine/memory/parse";
import { memoryMatchesListFilter } from "../engine/memory/list";
import { memoryMatchesScope } from "../engine/memory/scope";
import { ftsQueryTexts } from "../engine/memory/candidates";
import {
  clampVectorLimit,
  CONVEX_FTS_SCAN_MAX,
  FTS_PAGE_SIZE,
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
import { jevRankRelatedMemories } from "../engine/memory/jevRank";
import {
  retrieveMemoriesFromPool,
  summarizeRetrievedMemories,
  toMemoryCandidate,
} from "../engine/memory/retrieve";
import {
  applyJevRetrieveGate,
  jevRankPoolLimit,
  wantsJevJudge,
  wantsLocalRerank,
  type RetrieveJudgeOptions,
} from "../engine/memory/jevGate";
import {
  readOpenRouterApiKey,
  resolveOpenRouterAuth,
} from "./lib/openRouterKey";
import {
  loggedJevEvaluate,
  resolveSystemOneApiKey,
  type JevLogScope,
} from "./lib/systemOneKey";
import {
  bestEffortEmbedQueryCached,
  queryEmbeddingCacheKey,
  type QueryEmbeddingLookup,
} from "./lib/openRouter/bestEffortEmbed";
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
import { enqueueMemoryAccess } from "./memoryUsefulness";
import { isLowPriorSource } from "../engine/memory/usefulness";
import type { MemoryReadScope } from "../engine/memory/scope";
import { collectScopedMemoriesPaged } from "./memoryStore/walk";

type MemoryCtx = Pick<ActionCtx, "runQuery" | "runMutation" | "scheduler">;

/**
 * Stage durations (ms) a retrieve fills in when the caller passes one. Text
 * search overlaps embed -> vector -> hydrate, so searchMs is the wall-clock
 * of that whole overlapped phase, not a sum. The stages after it run one
 * after the other, and postSearchMs is their wall-clock.
 */
export interface RetrieveTiming {
  searchMs?: number;
  embedMs?: number;
  embedCached?: boolean;
  vectorMs?: number;
  hydrateMs?: number;
  textMs?: number;
  /** pool from the text and vector hits */
  fuseMs?: number;
  /** one query: links around the pool and the neighbour memories */
  graphMs?: number;
  /** neighbour scope checks into the pool */
  neighborsMs?: number;
  /** recent memories, only when the pool is empty */
  recentMs?: number;
  rankMs?: number;
  /** Jev gate; near 0 when the judge is off */
  gateMs?: number;
  /** access tracking (a scheduler call) */
  trackMs?: number;
  postSearchMs?: number;
}

type RetrieveTimingStage = Exclude<keyof RetrieveTiming, "embedCached">;

async function timed<T>(
  timing: RetrieveTiming | undefined,
  stage: RetrieveTimingStage,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    if (timing !== undefined) timing[stage] = Date.now() - startedAt;
  }
}

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
  /** Instruction writes run their own dedupe (exact skip + supersede). */
  skipHashDedupe?: boolean;
}

/** Reads are bounded: `total` is a lower bound (see MemoryListStoreResult). */
export interface ListMemoryRuntimeArgs {
  clerkId: string;
  profileId?: string;
  type?: string;
  types?: string[];
  status?: string;
  source?: string;
  sources?: string[];
  tags?: string[];
  searchQuery?: string;
  // inclusive createdAt window, epoch ms
  createdAfter?: number;
  createdBefore?: number;
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
  // externalId upserts; a visit-only repeat or an exact-hash dedupe skips the
  // follow-up jobs below
  const { memory: created, needsFollowUp } = await ctx.runMutation(
    internal.memoryStore.functions.createOrUpsertMemoryInternal,
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
      storageId: args.storageId,
      mimeType: args.mimeType,
      originalFilename: args.originalFilename,
      eventStart: args.eventStart,
      eventEnd: args.eventEnd,
      temporalKind: args.temporalKind,
      skipHashDedupe: args.skipHashDedupe,
      externalId: args.externalId,
    },
  );
  if (!needsFollowUp) return created;
  await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);
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
    source: created.source,
    sourceType: created.sourceType,
  });
  return created;
}

type SearchPageScope =
  | { kind: "personal"; userId: string; profileId?: string }
  | { kind: "team"; profileId: string };

/**
 * Text list/search. Convex allows one `.paginate()` per query function, so this
 * action walks search-index cursors, one internal query per page. It stops at
 * `offset + limit + 1` matches or CONVEX_FTS_SCAN_MAX scanned rows, so `total`
 * is a lower bound.
 */
async function searchMemoryListPaged(
  ctx: Pick<ActionCtx, "runQuery">,
  scope: SearchPageScope,
  args: Omit<ListMemoryRuntimeArgs, "clerkId" | "profileId"> & {
    searchQuery: string;
  },
): Promise<MemoryListResult> {
  const queries = ftsQueryTexts(args.searchQuery);
  const offset = Math.max(0, args.offset);
  const limit = Math.max(0, args.limit);
  const want = offset + limit + 1;
  const seen = new Set<string>();
  const matches: MemoryWithTags[] = [];
  let scanned = 0;

  for (const [index, search] of queries.entries()) {
    let cursor: string | null = null;
    while (matches.length < want && scanned < CONVEX_FTS_SCAN_MAX) {
      const page: SearchMemoriesPage = await ctx.runQuery(
        internal.memoryStore.functions.searchMemoriesPageInternal,
        {
          ...scope,
          search,
          // synonym batches must still contain a term the caller typed
          requireTerms: index > 0 ? queries[0] : undefined,
          type: args.type,
          types: args.types,
          status: args.status,
          source: args.source,
          sources: args.sources,
          tags: args.tags,
          createdAfter: args.createdAfter,
          createdBefore: args.createdBefore,
          // first page asks for only what the caller needs; later pages
          // (post-filters left `want` unmet) grow to FTS_PAGE_SIZE
          numItems: Math.min(
            scanned === 0 ? want : FTS_PAGE_SIZE,
            FTS_PAGE_SIZE,
            CONVEX_FTS_SCAN_MAX - scanned,
          ),
          cursor,
        },
      );
      scanned += page.scanned;
      for (const memory of page.memories) {
        if (seen.has(memory.id)) continue;
        seen.add(memory.id);
        matches.push(memory);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    if (matches.length >= want) break;
  }
  return {
    memories: matches.slice(offset, offset + limit),
    total: matches.length,
  };
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
  const searchQuery = args.searchQuery?.trim() ?? "";
  if (searchQuery.length > 0) {
    return await searchMemoryListPaged(
      ctx,
      {
        kind: "personal",
        userId: args.clerkId,
        profileId: profileId ?? undefined,
      },
      { ...args, searchQuery },
    );
  }
  return await ctx.runQuery(
    internal.memoryStore.functions.listMemoriesInternal,
    {
      userId: args.clerkId,
      profileId,
      type: args.type,
      types: args.types,
      status: args.status,
      source: args.source,
      sources: args.sources,
      tags: args.tags,
      createdAfter: args.createdAfter,
      createdBefore: args.createdBefore,
      limit: args.limit,
      offset: args.offset,
    },
  );
}

export async function listMemoriesForTeamProfile(
  ctx: Pick<ActionCtx, "runQuery">,
  args: Omit<ListMemoryRuntimeArgs, "clerkId"> & { profileId: string },
): Promise<MemoryListResult> {
  const searchQuery = args.searchQuery?.trim() ?? "";
  if (searchQuery.length > 0) {
    return await searchMemoryListPaged(
      ctx,
      { kind: "team", profileId: args.profileId },
      { ...args, searchQuery },
    );
  }
  return await ctx.runQuery(
    internal.memoryStore.functions.listMemoriesForTeamInternal,
    {
      profileId: args.profileId,
      type: args.type,
      types: args.types,
      status: args.status,
      source: args.source,
      sources: args.sources,
      tags: args.tags,
      createdAfter: args.createdAfter,
      createdBefore: args.createdBefore,
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
        source: updated.source,
        sourceType: updated.sourceType,
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
    source: string;
    sourceType?: string | null;
  },
): Promise<void> {
  if (isLowPriorSource(args.source, args.sourceType)) return;
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
    referenceDate?: string;
    timing?: RetrieveTiming;
    /** false: the caller enqueues the access itself */
    track?: boolean;
    embeddingLookup?: QueryEmbeddingLookup;
  } & RetrieveJudgeOptions,
): Promise<MemoryCandidate[]> {
  return retrieveAndTrack(ctx, {
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
    timing: args.timing,
    track: args.track,
    embeddingLookup: args.embeddingLookup,
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
    referenceDate?: string;
    timing?: RetrieveTiming;
    /** false: the caller enqueues the access itself */
    track?: boolean;
    embeddingLookup?: QueryEmbeddingLookup;
  } & RetrieveJudgeOptions,
): Promise<MemoryCandidate[]> {
  return retrieveAndTrack(ctx, {
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
    timing: args.timing,
    track: args.track,
    embeddingLookup: args.embeddingLookup,
  });
}

async function retrieveAndTrack(
  ctx: ActionCtx,
  args: Parameters<typeof retrieveRanked>[1] & { track?: boolean },
): Promise<MemoryCandidate[]> {
  const hits = await retrieveRanked(ctx, args);
  if (args.track === false) return hits;
  await timed(args.timing, "trackMs", () =>
    enqueueMemoryAccess(
      ctx,
      hits.map((hit) => hit.id),
      "retrieve",
    ),
  );
  return hits;
}

/**
 * The query-embedding cache key a retrieve of `query` uses, so a caller can
 * read the cache row ahead of it. Undefined when nothing would be cached.
 */
export async function retrieveEmbeddingCacheKey(
  clerkId: string,
  query: string,
): Promise<string | undefined> {
  if (readOpenRouterApiKey() === undefined) return undefined;
  if (query.trim().length === 0) return undefined;
  return queryEmbeddingCacheKey(clerkId, queryEmbeddingText(query));
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

async function maybeApplyJevRetrieveGate(
  ctx: ActionCtx,
  args: {
    clerkId?: string;
    profileId?: string;
    query: string;
    limit: number;
    referenceDate?: string;
    apiKey?: string;
  } & RetrieveJudgeOptions,
  ranked: MemoryCandidate[],
): Promise<MemoryCandidate[]> {
  if (!wantsJevJudge(args)) return ranked;
  if (ranked.length === 0) return ranked;
  if (args.query.trim().length === 0) return ranked;
  const apiKey = args.apiKey ?? resolveSystemOneApiKey();
  if (apiKey === undefined) return ranked;
  return applyJevRetrieveGate({
    query: args.query,
    hits: ranked,
    apiKey,
    referenceDate: args.referenceDate,
    limit: args.limit,
    evaluate: loggedJevEvaluate(ctx, {
      clerkId: args.clerkId,
      profileId: args.profileId,
    }),
  });
}

async function finishRetrieve(
  ctx: ActionCtx,
  args: {
    clerkId?: string;
    profileId?: string;
    query: string;
    limit: number;
    referenceDate?: string;
    apiKey?: string;
  } & RetrieveJudgeOptions,
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
    referenceDate?: string;
    timing?: RetrieveTiming;
    embeddingLookup?: QueryEmbeddingLookup;
  } & RetrieveJudgeOptions,
): Promise<MemoryCandidate[]> {
  const listFilter = {
    type: args.type,
    tags: args.tags,
    status: args.status,
    source: args.source,
  };
  const trimmed = args.query.trim();
  const nowMs = parseReferenceMs(args.referenceDate, Date.now());
  if (trimmed.length === 0) {
    const recent = await listRecentForRetrieve(ctx, args);
    return retrieveMemoriesFromPool(recent, args.query, {
      limit: args.limit,
      nowMs,
      threshold: args.threshold,
      rerank: wantsLocalRerank(args, false),
      ...listFilter,
    }).slice(0, Math.max(0, args.limit));
  }

  // the embedding call starts first; text search runs alongside it, and only
  // the vector search and hydration wait on the vector
  const [vectorHits, ftsHits, apiKey] = await timed(
    args.timing,
    "searchMs",
    () =>
      Promise.all([
        vectorScoresForQuery(ctx, args),
        timed(args.timing, "textMs", () =>
          ctx.runQuery(
            internal.memoryStore.functions.searchMemoriesTextInternal,
            {
              kind: args.kind,
              userId: args.clerkId,
              profileId: args.profileId,
              query: args.query,
              ...listFilter,
            },
          ),
        ),
        wantsJevJudge(args)
          ? Promise.resolve(resolveSystemOneApiKey())
          : Promise.resolve(undefined),
      ]),
  );
  const searchedAt = Date.now();
  const jev = apiKey !== undefined;
  const rankOpts = {
    limit: jevRankPoolLimit(args.limit, jev),
    nowMs,
    threshold: args.threshold,
    rerank: wantsLocalRerank(args, jev),
    ...listFilter,
  };

  const { byId, ftsRanks } = await timed(args.timing, "fuseMs", async () => {
    const pool = new Map<string, MemoryWithTags>();
    const ranks = new Map<string, number>();
    for (const hit of ftsHits) {
      ranks.set(hit.memory.id, 1 / hit.rank);
      if (
        pool.size < RETRIEVE_RANK_POOL_CAP &&
        memoryMatchesListFilter(hit.memory, listFilter)
      ) {
        pool.set(hit.memory.id, hit.memory);
      }
    }
    for (const hit of vectorHits.memories) {
      if (
        pool.size < RETRIEVE_RANK_POOL_CAP &&
        memoryMatchesListFilter(hit, listFilter)
      ) {
        pool.set(hit.id, hit);
      }
    }
    return { byId: pool, ftsRanks: ranks };
  });

  // links and the neighbour memories they reach come back in one query
  const linkUserId = args.clerkId;
  const graph =
    linkUserId === undefined || byId.size === 0
      ? { links: [], neighbors: [] }
      : await timed(args.timing, "graphMs", () =>
          ctx.runQuery(
            internal.memoryStore.functions.listMemoryGraphAroundInternal,
            {
              userId: linkUserId,
              seedIds: [...byId.keys()],
              hops: RETRIEVE_GRAPH_MAX_HOPS + 1,
              neighborLimit: RETRIEVE_GRAPH_NEIGHBOR_LIMIT,
              neighborMaxHops: RETRIEVE_GRAPH_MAX_HOPS,
              neighborCap: RETRIEVE_RANK_POOL_CAP - byId.size,
            },
          ),
        );
  const links = graph.links;

  await timed(args.timing, "neighborsMs", async () => {
    for (const memory of graph.neighbors) {
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
  });

  const pool =
    byId.size === 0
      ? await timed(args.timing, "recentMs", () =>
          listRecentForRetrieve(ctx, args),
        )
      : [...byId.values()];
  const ranked = await timed(args.timing, "rankMs", async () =>
    retrieveMemoriesFromPool(pool, args.query, {
      ...rankOpts,
      vectorScores: vectorHits.scores,
      ftsRanks,
      links,
    }),
  );
  const finished = await timed(args.timing, "gateMs", () =>
    finishRetrieve(ctx, { ...args, apiKey }, ranked),
  );
  if (args.timing !== undefined) {
    args.timing.postSearchMs = Date.now() - searchedAt;
  }
  await vectorHits.cacheWrite;
  return finished;
}

async function vectorScoresForQuery(
  ctx: ActionCtx,
  args: {
    kind: "personal" | "team";
    clerkId?: string;
    profileId?: string;
    query: string;
    timing?: RetrieveTiming;
    embeddingLookup?: QueryEmbeddingLookup;
  },
): Promise<{
  memories: MemoryWithTags[];
  scores: Map<string, number>;
  cacheWrite: Promise<void>;
}> {
  const memories: MemoryWithTags[] = [];
  const scores = new Map<string, number>();
  const empty = { memories, scores, cacheWrite: Promise.resolve() };
  if (args.query.trim().length === 0 || args.clerkId === undefined)
    return empty;

  const clerkId = args.clerkId;
  const { embedding, cached, cacheWrite } = await timed(
    args.timing,
    "embedMs",
    () =>
      bestEffortEmbedQueryCached({
        ctx,
        clerkId,
        profileId: args.profileId,
        feature: "memory-search",
        failureLog: "[memoryRuntime] query embedding failed",
        text: queryEmbeddingText(args.query),
        lookup: args.embeddingLookup,
      }),
  );
  if (args.timing !== undefined) args.timing.embedCached = cached;
  if (!embedding) return empty;
  // the cache write (never rejects) runs on through the rest of the
  // retrieve; the caller awaits it last
  try {
    const hits = await vectorHitsForEmbedding(
      ctx,
      { ...args, clerkId },
      embedding,
    );
    return { ...hits, cacheWrite };
  } catch (err) {
    await cacheWrite;
    throw err;
  }
}

async function vectorHitsForEmbedding(
  ctx: ActionCtx,
  args: {
    kind: "personal" | "team";
    clerkId: string;
    profileId?: string;
    timing?: RetrieveTiming;
  },
  embedding: number[],
): Promise<{ memories: MemoryWithTags[]; scores: Map<string, number> }> {
  const memories: MemoryWithTags[] = [];
  const scores = new Map<string, number>();
  const empty = { memories, scores };
  const clerkId = args.clerkId;
  const profileId = args.profileId;
  const vectorLimit = clampVectorLimit(VECTOR_CANDIDATE_LIMIT);
  const teamScope = args.kind === "team" && profileId !== undefined;
  const splitHits = await timed(args.timing, "vectorMs", () =>
    teamScope
      ? ctx.vectorSearch("memoryEmbeddings", "by_embedding", {
          vector: embedding,
          limit: vectorLimit,
          filter: (q) => q.eq("profileId", profileId),
        })
      : ctx.vectorSearch("memoryEmbeddings", "by_embedding", {
          vector: embedding,
          limit: vectorLimit,
          filter: (q) => q.eq("userId", clerkId),
        }),
  );
  if (splitHits.length === 0) return empty;

  const splitDocs = await timed(args.timing, "hydrateMs", () =>
    ctx.runQuery(
      internal.memoryStore.functions.getMemoriesByEmbeddingIdsInternal,
      { ids: splitHits.map((hit) => hit._id) },
    ),
  );
  const hits = splitHits.map((hit, i) => ({
    memory: splitDocs[i],
    score: hit._score,
  }));
  for (const hit of hits.slice(0, vectorLimit)) {
    const memory = hit.memory;
    if (memory === null || memory === undefined) continue;
    memories.push(memory);
    scores.set(memory.id, Math.max(0, hit.score));
  }
  return { memories, scores };
}

/** Lexical related pool, then Jev rerank of the head (fail-open, no drop). */
async function rankRelatedMemories(
  ctx: Pick<ActionCtx, "runQuery" | "scheduler">,
  scope: JevLogScope,
  seed: MemoryWithTags,
  pool: readonly MemoryWithTags[],
  limit: number,
): Promise<Array<{ memory: MemoryWithTags; reason: string }>> {
  const apiKey = resolveSystemOneApiKey();
  return jevRankRelatedMemories({
    seed,
    hits: relatedMemories(
      seed,
      pool,
      jevRankPoolLimit(limit, apiKey !== undefined),
    ),
    limit,
    apiKey,
    evaluate: loggedJevEvaluate(ctx, scope),
  });
}

export async function relatedMemoriesForClerk(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation" | "scheduler">,
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
  return rankRelatedMemories(
    ctx,
    {
      clerkId: args.clerkId,
      profileId: args.profileId ?? seed.profileId ?? undefined,
    },
    seed,
    listed.memories,
    args.limit ?? 10,
  );
}

export async function relatedMemoriesForTeamProfile(
  ctx: Pick<ActionCtx, "runQuery" | "scheduler">,
  args: {
    clerkId: string;
    profileId: string;
    memoryId: string;
    limit?: number;
  },
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
  return rankRelatedMemories(
    ctx,
    { clerkId: args.clerkId, profileId: args.profileId },
    seed,
    listed.memories,
    args.limit ?? 10,
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
  const memories = await collectScopedMemoriesPaged(ctx, scope);
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
      // an UPDATE keeps the old row as a prior version; DELETE has no successor
      asVersion: successorId !== undefined,
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
    skipHashDedupe: true,
    temporalKind: args.temporalKind,
    eventStart: args.eventStart,
    eventEnd: args.eventEnd,
  });
}

async function extractInstructionFacts(
  ctx: ActionCtx,
  args: { clerkId: string; instruction: string; profileId?: string },
): Promise<{ facts: ExtractedFact[]; extracted: boolean }> {
  const openRouter = await resolveOpenRouterAuth(ctx, args.clerkId);
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
  const openRouter = await resolveOpenRouterAuth(ctx, args.clerkId);
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
