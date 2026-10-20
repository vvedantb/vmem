import {
  memoryStatusSchema,
  memoryTypeSchema,
  type MemoryStatus,
  type MemoryType,
  type MemoryWithTags,
  type TemporalKind,
} from "@vmem/sdk";
import { computeContentHash } from "../../engine/memory/hash";
import {
  computeUsefulness,
  jevEligible,
  jevPriority,
} from "../../engine/memory/usefulness";
import {
  memoryMatchesListFilter,
  pageMemoryList,
  type MemoryListFilter,
} from "../../engine/memory/list";
import {
  memoryMatchesScope,
  type MemoryReadScope,
} from "../../engine/memory/scope";
import { ftsQueryTexts } from "../../engine/memory/candidates";
import {
  clampFtsTake,
  ftsScanBudget,
  FTS_TAKE,
} from "../../engine/memory/retrieveCaps";
import { buildSearchableText } from "../../engine/memory/searchableText";
import { normalizeTags } from "../../engine/memory/tags";
import type { MemoryLinkEdge } from "../../engine/memory/links";
import { UPDATES_LINK_REASON } from "../../engine/memory/supersede";
import {
  inferTemporalFields,
  parseMillis,
  toTemporalStoreFields,
} from "../../engine/memory/temporal";
import type { IndexRange } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  applyFallbackEntityExtraction,
  deleteEntitiesForMemory,
  deleteEntitiesForUser,
} from "./entities";
import {
  parseIsoMillis,
  toMemorySummary,
  usefulnessOfDoc,
  toMemoryWithHits,
  toMemoryWithTags,
  type MemorySummary,
} from "./mappers";
import { trackMemoryChange, trackMemoryChanges } from "./stats";
import { deleteMemoryUsage, loadUsageHits } from "./usage";

export interface CreateMemoryStoreParams {
  memoryId?: string;
  userId: string;
  profileId?: string;
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  tags: string[];
  confidence: number;
  contentHash?: string;
  status?: MemoryStatus;
  createdAt?: number;
  updatedAt?: number;
  expiresAt?: string;
  url?: string;
  sourceType?: string;
  sourceId?: string;
  sourceUrl?: string;
  sourceSyncedAt?: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
  eventStart?: string | null;
  eventEnd?: string | null;
  temporalKind?: TemporalKind | null;
}

export interface ListMemoryStoreParams extends MemoryListFilter {
  limit: number;
  offset: number;
}

export interface UpdateMemoryStoreParams {
  title?: string;
  content?: string;
  type?: MemoryType;
  status?: MemoryStatus;
  tags?: string[];
  confidence?: number;
  expiresAt?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
  temporalKind?: TemporalKind | null;
  /** Set for system writes (sync, supersede) so they do not count as user edits. */
  skipEditCount?: boolean;
}

/**
 * `total` is a lower bound, not a table count. Empty query: matches seen while
 * scanning newest first, stopped at `offset + limit + 1` (enough to know whether
 * another page exists). Text query: matches among the search index hits, with
 * source/type/status applied inside the index and the rest (tags) applied to up
 * to CONVEX_FTS_SCAN_MAX hits. `total > offset + limit` means "more pages exist".
 */
export interface MemoryListStoreResult {
  memories: MemoryWithTags[];
  total: number;
}

export function memoryReadScopeFromArgs(args: {
  kind: "personal" | "team";
  userId?: string;
  profileId?: string;
}): MemoryReadScope | null {
  if (args.kind === "team") {
    if (args.profileId === undefined) return null;
    return { kind: "team", profileId: args.profileId };
  }
  if (args.userId === undefined) return null;
  return {
    kind: "personal",
    userId: args.userId,
    profileId: args.profileId,
  };
}

function resolveTemporalStore(args: {
  title: string;
  content: string;
  type: MemoryType;
  nowMs: number;
  eventStart?: string | null;
  eventEnd?: string | null;
  temporalKind?: TemporalKind | null;
}): {
  eventStart: number | null;
  eventEnd: number | null;
  temporalKind: TemporalKind | null;
} {
  if (
    args.eventStart !== undefined ||
    args.eventEnd !== undefined ||
    args.temporalKind !== undefined
  ) {
    return {
      temporalKind: args.temporalKind ?? null,
      eventStart: parseMillis(args.eventStart) ?? null,
      eventEnd: parseMillis(args.eventEnd) ?? null,
    };
  }
  return toTemporalStoreFields(
    inferTemporalFields(args.title, args.content, args.nowMs, args.type),
  );
}

async function findByMemoryId(
  ctx: QueryCtx | MutationCtx,
  memoryId: string,
): Promise<Doc<"memories"> | null> {
  return await ctx.db
    .query("memories")
    .withIndex("by_memory_id", (q) => q.eq("memoryId", memoryId))
    .first();
}

async function findEmbeddingRow(
  ctx: QueryCtx | MutationCtx,
  memoryDocId: Id<"memories">,
): Promise<Doc<"memoryEmbeddings"> | null> {
  return await ctx.db
    .query("memoryEmbeddings")
    .withIndex("by_memory_doc", (q) => q.eq("memoryDocId", memoryDocId))
    .first();
}

/** Writes the vector to `memoryEmbeddings` (the only home for vectors). */
async function upsertMemoryEmbedding(
  ctx: MutationCtx,
  doc: Doc<"memories">,
  embedding: number[],
): Promise<void> {
  const existing = await findEmbeddingRow(ctx, doc._id);
  if (existing) {
    await ctx.db.patch(existing._id, {
      embedding,
      userId: doc.userId,
      profileId: doc.profileId,
    });
  } else {
    await ctx.db.insert("memoryEmbeddings", {
      memoryDocId: doc._id,
      userId: doc.userId,
      ...(doc.profileId === undefined ? {} : { profileId: doc.profileId }),
      embedding,
    });
  }
}

async function deleteMemoryEmbedding(
  ctx: MutationCtx,
  memoryDocId: Id<"memories">,
): Promise<void> {
  const row = await findEmbeddingRow(ctx, memoryDocId);
  if (row) await ctx.db.delete(row._id);
}

/** Keeps the vector index scope filters in step with the memory row. */
async function syncEmbeddingScope(
  ctx: MutationCtx,
  memoryDocId: Id<"memories">,
  scope: { userId?: string; profileId?: string },
): Promise<void> {
  const row = await findEmbeddingRow(ctx, memoryDocId);
  if (row) await ctx.db.patch(row._id, scope);
}

export const SCOPED_MEMORY_PAGE_SIZE = 24;

export type ScopedMemoryPaginationOpts = {
  numItems: number;
  cursor: string | null;
};

export type ScopedMemoryDocPage = {
  page: Array<Doc<"memories">>;
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string | null;
  pageStatus?: "SplitRecommended" | "SplitRequired" | null;
};

function asScopedDocPage(
  result: {
    isDone: boolean;
    continueCursor: string;
    splitCursor?: string | null;
    pageStatus?: "SplitRecommended" | "SplitRequired" | null;
  },
  page: Array<Doc<"memories">>,
): ScopedMemoryDocPage {
  return {
    page,
    isDone: result.isDone,
    continueCursor: result.continueCursor,
    splitCursor: result.splitCursor,
    pageStatus: result.pageStatus,
  };
}

export async function paginateScopedDocs(
  ctx: QueryCtx | MutationCtx,
  scope: MemoryReadScope,
  paginationOpts: ScopedMemoryPaginationOpts,
): Promise<ScopedMemoryDocPage> {
  const result =
    scope.kind === "team"
      ? await ctx.db
          .query("memories")
          .withIndex("by_profile_created", (q) =>
            q.eq("profileId", scope.profileId),
          )
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db
          .query("memories")
          .withIndex("by_user_created", (q) => q.eq("userId", scope.userId))
          .order("desc")
          .paginate(paginationOpts);
  const page =
    scope.kind === "personal"
      ? result.page.filter((row) => memoryMatchesScope(row, scope))
      : result.page;
  return asScopedDocPage(result, page);
}

export type MemorySummaryFilter = {
  type?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
};

export type MemorySummaryPage = Omit<ScopedMemoryDocPage, "page"> & {
  page: MemorySummary[];
};

// One bounded page of slim summaries, newest first. Filters run after the page
// is read, so a filtered page can come back short (isDone tells the caller
// whether to keep paging). Each page is its own reactive range, so a write only
// re-runs the page it landed in.
export async function paginateMemorySummaries(
  ctx: QueryCtx | MutationCtx,
  scope: MemoryReadScope,
  paginationOpts: ScopedMemoryPaginationOpts,
  filter: MemorySummaryFilter,
): Promise<MemorySummaryPage> {
  const result = await paginateScopedDocs(ctx, scope, paginationOpts);
  return {
    ...result,
    page: result.page
      .filter((doc) => memoryMatchesListFilter(doc, filter))
      .map(toMemorySummary),
  };
}

// Reactive list queries re-run on every write inside the range they read, so
// they must never read the whole scope. Bounds: at most this many rows scanned
// and this many (approximate) bytes read per evaluation.
export const BOUNDED_LIST_MAX_SCAN = 6_000;
export const BOUNDED_LIST_MAX_BYTES = 8 * 1024 * 1024;

function approxDocBytes(doc: Doc<"memories">): number {
  return (
    doc.title.length +
    doc.content.length +
    (doc.searchableText?.length ?? 0) +
    doc.tags.join(",").length +
    512
  );
}

// the parts of a `[..., "createdAt"]` index range builder used below
interface CreatedAtUpperBound extends IndexRange {
  lte(field: "createdAt", value: number): IndexRange;
}
interface CreatedAtRange extends CreatedAtUpperBound {
  gte(field: "createdAt", value: number): CreatedAtUpperBound;
}

// Narrows a `[..., "createdAt"]` index to the inclusive createdAt window.
function createdRange(
  range: CreatedAtRange,
  after: number | undefined,
  before: number | undefined,
): IndexRange {
  if (after !== undefined && before !== undefined) {
    return range.gte("createdAt", after).lte("createdAt", before);
  }
  if (after !== undefined) return range.gte("createdAt", after);
  if (before !== undefined) return range.lte("createdAt", before);
  return range;
}

// Newest-first scan that stops as soon as `offset + limit + 1` rows pass the
// filter, so cost follows the page requested rather than the table size.
// `total` is exact when the scope is exhausted and otherwise a lower bound of
// `offset + limit + 1` (enough for "is there another page" checks).
export async function listMemoriesBounded(
  ctx: QueryCtx | MutationCtx,
  scope: MemoryReadScope,
  params: ListMemoryStoreParams,
): Promise<MemoryListStoreResult> {
  const offset = Math.max(0, params.offset);
  const limit = Math.max(0, params.limit);
  const want = offset + limit + 1;
  const after = params.createdAfter;
  const before = params.createdBefore;
  const ordered =
    scope.kind === "team"
      ? ctx.db
          .query("memories")
          .withIndex("by_profile_created", (q) =>
            createdRange(q.eq("profileId", scope.profileId), after, before),
          )
          .order("desc")
      : ctx.db
          .query("memories")
          .withIndex("by_user_created", (q) =>
            createdRange(q.eq("userId", scope.userId), after, before),
          )
          .order("desc");

  const matched: Array<Doc<"memories">> = [];
  let scanned = 0;
  let bytes = 0;
  for await (const doc of ordered) {
    scanned += 1;
    bytes += approxDocBytes(doc);
    if (
      memoryMatchesScope(doc, scope) &&
      memoryMatchesListFilter(doc, params)
    ) {
      matched.push(doc);
      if (matched.length >= want) break;
    }
    if (scanned >= BOUNDED_LIST_MAX_SCAN || bytes >= BOUNDED_LIST_MAX_BYTES) {
      break;
    }
  }
  return {
    memories: matched.slice(offset, offset + limit).map(toMemoryWithTags),
    total: matched.length,
  };
}

async function listScopedDocs(
  ctx: QueryCtx | MutationCtx,
  scope: MemoryReadScope,
): Promise<Array<Doc<"memories">>> {
  if (scope.kind === "team") {
    return await ctx.db
      .query("memories")
      .withIndex("by_profile_created", (q) =>
        q.eq("profileId", scope.profileId),
      )
      .order("desc")
      .collect();
  }
  const rows = await ctx.db
    .query("memories")
    .withIndex("by_user_created", (q) => q.eq("userId", scope.userId))
    .order("desc")
    .collect();
  return rows.filter((row) => memoryMatchesScope(row, scope));
}

// Text queries use the search index (never a table scan). Source, type and
// status filter inside the index; tags filter the hits afterwards. Empty
// queries use the bounded newest-first scan.
async function listMemoriesInScope(
  ctx: QueryCtx,
  scope: MemoryReadScope,
  params: ListMemoryStoreParams,
): Promise<MemoryListStoreResult> {
  const query = params.searchQuery?.trim() ?? "";
  if (query.length === 0) return await listMemoriesBounded(ctx, scope, params);
  const offset = Math.max(0, params.offset);
  const limit = Math.max(0, params.limit);
  const hits = await searchMemoriesText(ctx, scope, query, {
    want: offset + limit + 1,
    filter: params,
  });
  return {
    memories: pageMemoryList(
      hits.map((hit) => hit.memory),
      limit,
      offset,
    ),
    total: hits.length,
  };
}

export async function createMemory(
  ctx: MutationCtx,
  params: CreateMemoryStoreParams,
): Promise<MemoryWithTags> {
  const memoryId = params.memoryId ?? crypto.randomUUID();
  const existing = await findByMemoryId(ctx, memoryId);
  if (existing) return toMemoryWithTags(existing);

  const now = Date.now();
  const createdAt = params.createdAt ?? now;
  const updatedAt = params.updatedAt ?? now;
  const contentHash =
    params.contentHash ?? computeContentHash(params.title, params.content);
  const expiresAt =
    params.expiresAt === undefined
      ? undefined
      : parseIsoMillis(params.expiresAt);
  const sourceSyncedAt =
    params.sourceSyncedAt === undefined
      ? undefined
      : parseIsoMillis(params.sourceSyncedAt);
  const temporal = resolveTemporalStore({
    title: params.title,
    content: params.content,
    type: params.type,
    nowMs: createdAt,
    eventStart: params.eventStart,
    eventEnd: params.eventEnd,
    temporalKind: params.temporalKind,
  });

  const heuristicAtCreate = computeUsefulness({
    source: params.source,
    sourceType: params.sourceType,
    pinned: params.status === "pinned",
    updatedAt,
    createdAt,
    nowMs: now,
  });

  const id = await ctx.db.insert("memories", {
    memoryId,
    userId: params.userId,
    ...(params.profileId === undefined ? {} : { profileId: params.profileId }),
    title: params.title,
    content: params.content,
    type: params.type,
    source: params.source,
    confidence: params.confidence,
    status: params.status ?? "active",
    tags: normalizeTags(params.tags),
    createdAt,
    updatedAt,
    expiresAt,
    url: params.url,
    contentHash,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    sourceUrl: params.sourceUrl,
    sourceSyncedAt,
    storageId: params.storageId,
    mimeType: params.mimeType,
    originalFilename: params.originalFilename,
    visitCount: 1,
    firstVisitAt: createdAt,
    lastVisitAt: updatedAt,
    searchableText: buildSearchableText(
      params.title,
      params.content,
      normalizeTags(params.tags),
    ),
    eventStart: temporal.eventStart,
    eventEnd: temporal.eventEnd,
    temporalKind: temporal.temporalKind,
    usefulnessScore: heuristicAtCreate,
    usefulnessScoredAt: now,
    ...(jevEligible(params.source, params.sourceType)
      ? {
          // Convex skips docs missing any indexed field; 0 sorts never-tried first
          usefulnessNeedsJev: true,
          usefulnessJevPriority: jevPriority(
            params.source,
            params.sourceType,
            "live",
          ),
          usefulnessJevAt: 0,
        }
      : {}),
  });

  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create memory");
  await trackMemoryChange(ctx, null, created);
  await applyFallbackEntityExtraction(ctx, created);
  return toMemoryWithTags(created);
}

export async function getMemory(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  memoryId: string,
): Promise<MemoryWithTags | null> {
  const doc = await findByMemoryId(ctx, memoryId);
  if (!doc || !memoryMatchesScope(doc, { kind: "personal", userId })) {
    return null;
  }
  return toMemoryWithHits(doc, await loadUsageHits(ctx, doc));
}

export async function getMemoryForTeam(
  ctx: QueryCtx | MutationCtx,
  profileId: string,
  memoryId: string,
): Promise<MemoryWithTags | null> {
  const doc = await findByMemoryId(ctx, memoryId);
  if (!doc || !memoryMatchesScope(doc, { kind: "team", profileId })) {
    return null;
  }
  return toMemoryWithHits(doc, await loadUsageHits(ctx, doc));
}

export async function listMemories(
  ctx: QueryCtx,
  userId: string,
  params: ListMemoryStoreParams & { profileId?: string | null },
): Promise<MemoryListStoreResult> {
  return await listMemoriesInScope(
    ctx,
    { kind: "personal", userId, profileId: params.profileId },
    params,
  );
}

export async function listMemoriesForTeam(
  ctx: QueryCtx,
  profileId: string,
  params: ListMemoryStoreParams,
): Promise<MemoryListStoreResult> {
  return await listMemoriesInScope(ctx, { kind: "team", profileId }, params);
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

async function applyMemoryUpdates(
  ctx: MutationCtx,
  doc: Doc<"memories">,
  updates: UpdateMemoryStoreParams,
): Promise<MemoryWithTags | null> {
  const now = Date.now();
  const nextTitle = updates.title ?? doc.title;
  const nextContent = updates.content ?? doc.content;
  const nextTags =
    updates.tags === undefined ? doc.tags : normalizeTags(updates.tags);
  const textChanged =
    updates.title !== undefined || updates.content !== undefined;
  const contentChanged = textChanged || updates.tags !== undefined;
  const contentHash = textChanged
    ? computeContentHash(nextTitle, nextContent)
    : doc.contentHash;
  const searchableText = contentChanged
    ? buildSearchableText(nextTitle, nextContent, nextTags)
    : doc.searchableText;
  const nextType = updates.type ?? doc.type;
  const temporalChanged =
    textChanged ||
    updates.type !== undefined ||
    updates.eventStart !== undefined ||
    updates.eventEnd !== undefined ||
    updates.temporalKind !== undefined;
  const temporal = temporalChanged
    ? resolveTemporalStore({
        title: nextTitle,
        content: nextContent,
        type: nextType,
        nowMs: now,
        eventStart: updates.eventStart,
        eventEnd: updates.eventEnd,
        temporalKind: updates.temporalKind,
      })
    : undefined;
  const nextStatus = updates.status ?? doc.status;
  const editCount =
    (doc.usefulnessEditCount ?? 0) + (updates.skipEditCount === true ? 0 : 1);
  const usefulnessFields = {
    usefulnessEditCount: editCount,
    usefulnessScore: usefulnessOfDoc(
      {
        ...doc,
        status: nextStatus,
        updatedAt: now,
        usefulnessEditCount: editCount,
      },
      now,
      await loadUsageHits(ctx, doc),
    ),
    usefulnessScoredAt: now,
    ...(textChanged && jevEligible(doc.source, doc.sourceType)
      ? {
          // an edit restarts Jev: new content, fresh attempts, front of queue
          usefulnessNeedsJev: true,
          usefulnessJevPriority: jevPriority(
            doc.source,
            doc.sourceType,
            "live",
          ),
          usefulnessJevAttempts: 0,
          usefulnessJevAt: 0,
        }
      : {}),
  };
  if (updates.expiresAt === null) {
    const {
      _id,
      _creationTime,
      expiresAt: _expiresAt,
      ...fields
    } = {
      ...doc,
      title: nextTitle,
      content: nextContent,
      type: nextType,
      status: updates.status ?? doc.status,
      tags: nextTags,
      confidence: updates.confidence ?? doc.confidence,
      contentHash,
      searchableText,
      updatedAt: now,
      ...usefulnessFields,
      ...(temporal === undefined ? {} : temporal),
    };
    await ctx.db.replace(_id, fields);
  } else {
    await ctx.db.patch(doc._id, {
      updatedAt: now,
      ...usefulnessFields,
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.content !== undefined ? { content: updates.content } : {}),
      ...(updates.type !== undefined ? { type: updates.type } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.tags !== undefined ? { tags: nextTags } : {}),
      ...(updates.confidence !== undefined
        ? { confidence: updates.confidence }
        : {}),
      ...(contentChanged ? { contentHash, searchableText } : {}),
      ...(updates.expiresAt !== undefined
        ? { expiresAt: parseIsoMillis(updates.expiresAt) }
        : {}),
      ...(temporal === undefined ? {} : temporal),
    });
  }

  const updated = await findByMemoryId(ctx, doc.memoryId);
  if (!updated) return null;
  if (!sameTags(doc.tags, updated.tags)) {
    await trackMemoryChange(ctx, doc, updated);
  }
  if (contentChanged) {
    await applyFallbackEntityExtraction(ctx, updated);
  }
  return toMemoryWithTags(updated);
}

function docMatchesWriteScope(
  doc: Doc<"memories">,
  scope: MemoryReadScope,
): boolean {
  if (scope.kind === "team") {
    return memoryMatchesScope(doc, scope);
  }
  return doc.userId === scope.userId;
}

export async function updateMemory(
  ctx: MutationCtx,
  userId: string,
  memoryId: string,
  updates: UpdateMemoryStoreParams,
): Promise<MemoryWithTags | null> {
  const doc = await findByMemoryId(ctx, memoryId);
  if (!doc || doc.userId !== userId) return null;
  return applyMemoryUpdates(ctx, doc, updates);
}

async function updateMemoryInScope(
  ctx: MutationCtx,
  scope: MemoryReadScope,
  memoryId: string,
  updates: UpdateMemoryStoreParams,
): Promise<MemoryWithTags | null> {
  const doc = await findByMemoryId(ctx, memoryId);
  if (!doc || !docMatchesWriteScope(doc, scope)) return null;
  return applyMemoryUpdates(ctx, doc, updates);
}

export async function supersedeMemories(
  ctx: MutationCtx,
  params: {
    scope: MemoryReadScope;
    predecessorIds: string[];
    successorId?: string;
    reason?: string;
  },
): Promise<number> {
  const successorId = params.successorId;
  const reason = params.reason?.trim() || UPDATES_LINK_REASON;
  let count = 0;
  const seen = new Set<string>();
  for (const predecessorId of params.predecessorIds) {
    if (predecessorId === successorId || seen.has(predecessorId)) continue;
    seen.add(predecessorId);
    const updated = await updateMemoryInScope(
      ctx,
      params.scope,
      predecessorId,
      { status: "suppressed", skipEditCount: true },
    );
    if (!updated) continue;
    count += 1;
    if (successorId === undefined) continue;
    await linkMemories(ctx, {
      userId: updated.userId,
      profileId: updated.profileId ?? writeProfileId(params.scope),
      memoryIdA: predecessorId,
      memoryIdB: successorId,
      reason,
    });
  }
  return count;
}

function writeProfileId(scope: MemoryReadScope): string | undefined {
  if (scope.kind === "team") return scope.profileId;
  return scope.profileId ?? undefined;
}

async function deleteLinksForMemory(
  ctx: MutationCtx,
  userId: string,
  memoryId: string,
): Promise<void> {
  const sources = await ctx.db
    .query("memoryLinks")
    .withIndex("by_user_source", (q) =>
      q.eq("userId", userId).eq("sourceId", memoryId),
    )
    .collect();
  const targets = await ctx.db
    .query("memoryLinks")
    .withIndex("by_user_target", (q) =>
      q.eq("userId", userId).eq("targetId", memoryId),
    )
    .collect();
  const seen = new Set<string>();
  for (const row of [...sources, ...targets]) {
    if (seen.has(row._id)) continue;
    seen.add(row._id);
    await ctx.db.delete(row._id);
  }
}

async function deleteLinksForUser(
  ctx: MutationCtx,
  userId: string,
): Promise<void> {
  const rows = await ctx.db
    .query("memoryLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

export async function deleteMemory(
  ctx: MutationCtx,
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const doc = await findByMemoryId(ctx, memoryId);
  if (!doc || doc.userId !== userId) return false;
  await deleteEntitiesForMemory(ctx, userId, memoryId);
  await deleteLinksForMemory(ctx, userId, memoryId);
  await deleteMemoryEmbedding(ctx, doc._id);
  await trackMemoryChange(ctx, doc, null);
  await deleteMemoryUsage(ctx, memoryId);
  await ctx.db.delete(doc._id);
  return true;
}

export async function deleteTeamMemoryAsOwner(
  ctx: MutationCtx,
  profileId: string,
  memoryId: string,
): Promise<boolean> {
  const doc = await findByMemoryId(ctx, memoryId);
  if (!doc || !memoryMatchesScope(doc, { kind: "team", profileId })) {
    return false;
  }
  await deleteEntitiesForMemory(ctx, doc.userId, memoryId);
  await deleteLinksForMemory(ctx, doc.userId, memoryId);
  await deleteMemoryEmbedding(ctx, doc._id);
  await trackMemoryChange(ctx, doc, null);
  await deleteMemoryUsage(ctx, memoryId);
  await ctx.db.delete(doc._id);
  return true;
}

export async function deleteMemoriesForUser(
  ctx: MutationCtx,
  userId: string,
): Promise<number> {
  const docs = await ctx.db
    .query("memories")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .collect();
  await deleteEntitiesForUser(ctx, userId);
  await deleteLinksForUser(ctx, userId);
  await trackMemoryChanges(
    ctx,
    docs.map((doc) => ({ before: doc, after: null })),
  );
  for (const doc of docs) {
    await deleteMemoryEmbedding(ctx, doc._id);
    await deleteMemoryUsage(ctx, doc.memoryId);
    await ctx.db.delete(doc._id);
  }
  return docs.length;
}

export async function deleteMemoriesByProfile(
  ctx: MutationCtx,
  profileId: string,
): Promise<number> {
  const docs = await ctx.db
    .query("memories")
    .withIndex("by_profile_created", (q) => q.eq("profileId", profileId))
    .collect();
  await trackMemoryChanges(
    ctx,
    docs.map((doc) => ({ before: doc, after: null })),
  );
  for (const doc of docs) {
    await deleteMemoryEmbedding(ctx, doc._id);
    await deleteMemoryUsage(ctx, doc.memoryId);
    await ctx.db.delete(doc._id);
  }
  return docs.length;
}

export async function reassignMemoriesProfile(
  ctx: MutationCtx,
  fromProfileId: string,
  toProfileId: string,
): Promise<number> {
  const docs = await ctx.db
    .query("memories")
    .withIndex("by_profile_created", (q) => q.eq("profileId", fromProfileId))
    .collect();
  await trackMemoryChanges(
    ctx,
    docs.map((doc) => ({
      before: doc,
      after: { ...doc, profileId: toProfileId },
    })),
  );
  for (const doc of docs) {
    await ctx.db.patch(doc._id, { profileId: toProfileId });
    await syncEmbeddingScope(ctx, doc._id, { profileId: toProfileId });
  }
  return docs.length;
}

export async function deleteMemoriesBySourceTypes(
  ctx: MutationCtx,
  userId: string,
  sourceTypes: string[],
): Promise<number> {
  if (sourceTypes.length === 0) return 0;
  const wanted = new Set(sourceTypes);
  const docs = await ctx.db
    .query("memories")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .collect();
  const doomed = docs.filter(
    (doc) => doc.sourceType !== undefined && wanted.has(doc.sourceType),
  );
  await trackMemoryChanges(
    ctx,
    doomed.map((doc) => ({ before: doc, after: null })),
  );
  for (const doc of doomed) {
    await deleteMemoryEmbedding(ctx, doc._id);
    await deleteMemoryUsage(ctx, doc.memoryId);
    await ctx.db.delete(doc._id);
  }
  return doomed.length;
}

export async function upsertMemoryFromSource(
  ctx: MutationCtx,
  params: CreateMemoryStoreParams & { sourceId: string; sourceType: string },
): Promise<MemoryWithTags> {
  // indexed lookup: this used to collect() the user's whole memories table for
  // every synced item, which is O(table) reads per item and made every sync
  // write conflict with all other writes to the user's memories
  const existing = await ctx.db
    .query("memories")
    .withIndex("by_user_source", (q) =>
      q
        .eq("userId", params.userId)
        .eq("sourceType", params.sourceType)
        .eq("sourceId", params.sourceId),
    )
    .first();
  if (existing) {
    const updated = await updateMemory(ctx, params.userId, existing.memoryId, {
      title: params.title,
      content: params.content,
      skipEditCount: true,
    });
    if (updated) {
      await ctx.db.patch(existing._id, {
        sourceUrl: params.sourceUrl,
        sourceSyncedAt: Date.now(),
      });
      const refreshed = await findByMemoryId(ctx, existing.memoryId);
      if (refreshed) return toMemoryWithTags(refreshed);
      return updated;
    }
  }
  return await createMemory(ctx, {
    ...params,
    sourceSyncedAt: params.sourceSyncedAt ?? new Date().toISOString(),
  });
}

export async function collectScopedMemories(
  ctx: QueryCtx | MutationCtx,
  scope: MemoryReadScope,
): Promise<MemoryWithTags[]> {
  const docs = await listScopedDocs(ctx, scope);
  return docs.map(toMemoryWithTags);
}

function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

// Rows found only through synonym terms must still contain a term the caller
// typed, otherwise a query plus filter returns synonym-only noise.
function containsAnyTerm(memory: MemoryWithTags, terms: string): boolean {
  const haystack =
    `${memory.title} ${memory.content} ${memory.tags.join(" ")}`.toLowerCase();
  return terms.split(" ").some((term) => haystack.includes(term));
}

interface IndexFilter {
  source?: string;
  type?: MemoryType;
  status?: MemoryStatus;
}

// source/type/status run inside the search index. An unknown type or status
// cannot match any row, so it returns null.
function parseIndexFilter(filter: MemoryListFilter): IndexFilter | null {
  const typeText = trimmedOrUndefined(filter.type);
  const statusText = trimmedOrUndefined(filter.status);
  const type =
    typeText === undefined ? undefined : memoryTypeSchema.safeParse(typeText);
  const status =
    statusText === undefined
      ? undefined
      : memoryStatusSchema.safeParse(statusText);
  if (type?.success === false || status?.success === false) return null;
  return {
    source: trimmedOrUndefined(filter.source),
    type: type?.data,
    status: status?.data,
  };
}

function searchIndexQuery(
  ctx: QueryCtx,
  scope: MemoryReadScope,
  search: string,
  index: IndexFilter,
) {
  return ctx.db.query("memories").withSearchIndex("search_text", (q) => {
    // personal scope filters profileId in JS: legacy rows have none
    let scoped = q.search("searchableText", search);
    scoped =
      scope.kind === "team"
        ? scoped.eq("profileId", scope.profileId)
        : scoped.eq("userId", scope.userId);
    if (index.source !== undefined) scoped = scoped.eq("source", index.source);
    if (index.type !== undefined) scoped = scoped.eq("type", index.type);
    if (index.status !== undefined) scoped = scoped.eq("status", index.status);
    return scoped;
  });
}

// Post-filter shared by the take path and the page path.
function acceptSearchHit(
  doc: Doc<"memories">,
  scope: MemoryReadScope,
  filter: MemoryListFilter,
  requireTerms: string | undefined,
): MemoryWithTags | null {
  if (!memoryMatchesScope(doc, scope)) return null;
  const memory = toMemoryWithTags(doc);
  if (!memoryMatchesListFilter(memory, filter)) return null;
  if (requireTerms !== undefined && !containsAnyTerm(memory, requireTerms)) {
    return null;
  }
  return memory;
}

export interface SearchMemoriesPage {
  memories: MemoryWithTags[];
  continueCursor: string;
  isDone: boolean;
  /** Index rows read for this page, before post-filtering. */
  scanned: number;
}

/**
 * One page of search-index hits for one search string, post-filtered.
 * Convex allows one `.paginate()` per query function, so the caller loops over
 * cursors from an action (see `searchMemoryListPaged` in memoryRuntime).
 */
export async function searchMemoriesPage(
  ctx: QueryCtx,
  scope: MemoryReadScope,
  args: {
    search: string;
    filter: MemoryListFilter;
    requireTerms?: string;
    numItems: number;
    cursor: string | null;
  },
): Promise<SearchMemoriesPage> {
  const index = parseIndexFilter(args.filter);
  if (index === null) {
    return { memories: [], continueCursor: "", isDone: true, scanned: 0 };
  }
  const filter = { ...args.filter, searchQuery: undefined };
  const page = await searchIndexQuery(ctx, scope, args.search, index).paginate({
    numItems: args.numItems,
    cursor: args.cursor,
  });
  const memories: MemoryWithTags[] = [];
  for (const doc of page.page) {
    const memory = acceptSearchHit(doc, scope, filter, args.requireTerms);
    if (memory !== null) memories.push(memory);
  }
  return {
    memories,
    continueCursor: page.continueCursor,
    isDone: page.isDone,
    scanned: page.page.length,
  };
}

/**
 * Search-index hits in rank order that match `filter`, from one bounded take
 * per search string. Used for the retrieve candidate pool and for direct store
 * calls. List paging goes through `searchMemoriesPage` instead.
 * - source/type/status run inside the index, so the take cap applies after them.
 * - Tags and hidden statuses run on the hits. With tags the passes share one
 *   CONVEX_FTS_SCAN_MAX budget (`ftsScanBudget`), else each takes FTS_TAKE.
 */
export async function searchMemoriesText(
  ctx: QueryCtx,
  scope: MemoryReadScope,
  query: string,
  options: { want?: number; filter?: MemoryListFilter } = {},
): Promise<Array<{ memory: MemoryWithTags; rank: number }>> {
  const queries = ftsQueryTexts(query);
  if (queries.length === 0) return [];
  const want = clampFtsTake(options.want ?? FTS_TAKE);
  const filter = { ...options.filter, searchQuery: undefined };
  const index = parseIndexFilter(filter);
  if (index === null) return [];
  const tagged = filter.tags !== undefined && filter.tags.length > 0;
  const perPass = clampFtsTake(Math.max(want, FTS_TAKE));
  let taken = 0;
  const seen = new Set<string>();
  const out: Array<{ memory: MemoryWithTags; rank: number }> = [];

  for (const [i, search] of queries.entries()) {
    // tagged: all passes share one CONVEX_FTS_SCAN_MAX budget
    const scan = tagged ? ftsScanBudget(taken) : perPass;
    if (scan === 0) break;
    const hits = await searchIndexQuery(ctx, scope, search, index).take(scan);
    taken += hits.length;
    for (const doc of hits) {
      if (seen.has(doc.memoryId)) continue;
      const memory = acceptSearchHit(
        doc,
        scope,
        filter,
        i > 0 ? queries[0] : undefined,
      );
      if (memory === null) continue;
      seen.add(doc.memoryId);
      out.push({ memory, rank: out.length + 1 });
      if (out.length >= want) return out;
    }
  }
  return out;
}

export async function getMemoriesByMemoryIds(
  ctx: QueryCtx,
  ids: readonly string[],
): Promise<Array<MemoryWithTags | null>> {
  const out: Array<MemoryWithTags | null> = [];
  for (const memoryId of ids) {
    const doc = await findByMemoryId(ctx, memoryId);
    out.push(doc ? toMemoryWithTags(doc) : null);
  }
  return out;
}

export async function patchMemoryEmbedding(
  ctx: MutationCtx,
  memoryId: string,
  embedding: number[],
): Promise<boolean> {
  const doc = await findByMemoryId(ctx, memoryId);
  if (!doc) return false;
  await upsertMemoryEmbedding(ctx, doc, embedding);
  return true;
}

function orderedLinkIds(
  a: string,
  b: string,
): { sourceId: string; targetId: string } {
  return a < b ? { sourceId: a, targetId: b } : { sourceId: b, targetId: a };
}

export async function linkMemories(
  ctx: MutationCtx,
  params: {
    userId: string;
    profileId?: string;
    memoryIdA: string;
    memoryIdB: string;
    reason: string;
    origin?: "manual" | "entity" | "extract";
  },
): Promise<boolean> {
  if (params.memoryIdA === params.memoryIdB) return false;
  const a = await findByMemoryId(ctx, params.memoryIdA);
  const b = await findByMemoryId(ctx, params.memoryIdB);
  if (!a || !b) return false;
  const sameUser = a.userId === params.userId && b.userId === params.userId;
  const sameProfile =
    params.profileId !== undefined &&
    a.profileId === params.profileId &&
    b.profileId === params.profileId;
  if (!sameUser && !sameProfile) return false;
  const { sourceId, targetId } = orderedLinkIds(
    params.memoryIdA,
    params.memoryIdB,
  );
  const existing = await ctx.db
    .query("memoryLinks")
    .withIndex("by_source_target", (q) =>
      q.eq("sourceId", sourceId).eq("targetId", targetId),
    )
    .first();
  if (existing) {
    const nextOrigin = params.origin ?? "manual";
    const nextReason = params.reason.trim() || "related";
    if (
      nextOrigin === "manual" &&
      (existing.origin === "entity" || existing.origin === "extract")
    ) {
      await ctx.db.patch(existing._id, {
        reason: nextReason,
        origin: nextOrigin,
      });
    }
    return true;
  }
  await ctx.db.insert("memoryLinks", {
    userId: params.userId,
    ...(params.profileId === undefined ? {} : { profileId: params.profileId }),
    sourceId,
    targetId,
    reason: params.reason.trim() || "related",
    createdAt: Date.now(),
    origin: params.origin ?? "manual",
  });
  return true;
}

// The link's author may unlink. With profileId (team scope, membership
// checked by the caller) any member may unlink two memories of that profile,
// mirroring linkMemories.
export async function unlinkMemories(
  ctx: MutationCtx,
  params: {
    userId: string;
    profileId?: string;
    memoryIdA: string;
    memoryIdB: string;
  },
): Promise<boolean> {
  const { sourceId, targetId } = orderedLinkIds(
    params.memoryIdA,
    params.memoryIdB,
  );
  const existing = await ctx.db
    .query("memoryLinks")
    .withIndex("by_source_target", (q) =>
      q.eq("sourceId", sourceId).eq("targetId", targetId),
    )
    .first();
  if (!existing) return false;
  if (existing.userId !== params.userId) {
    if (params.profileId === undefined) return false;
    const a = await findByMemoryId(ctx, sourceId);
    const b = await findByMemoryId(ctx, targetId);
    if (
      a?.profileId !== params.profileId ||
      b?.profileId !== params.profileId
    ) {
      return false;
    }
  }
  await ctx.db.delete(existing._id);
  return true;
}

// Hard cap on edges read per call. Stays below Convex's 8192 array-length
// limit on return values: at 10k edges the query read fine but its result was
// rejected, so graph views failed outright for users with that many links.
export const MAX_MEMORY_LINKS_READ = 8_000;

export async function listMemoryLinksForUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<MemoryLinkEdge[]> {
  const rows = await ctx.db
    .query("memoryLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(MAX_MEMORY_LINKS_READ);
  return rows.map((row) => ({
    sourceId: row.sourceId,
    targetId: row.targetId,
    reason: row.reason,
  }));
}

export const LINK_EXPANSION_PER_NODE = 16;
export const LINK_EXPANSION_MAX_EDGES = 1_000;
export const LINK_EXPANSION_MAX_SEEDS = 400;
export const LINK_EXPANSION_MAX_HOPS = 3;

type LinkEdgeRow = Pick<Doc<"memoryLinks">, "sourceId" | "targetId" | "reason">;

async function listIncidentLinks(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  memoryId: string,
  perNode: number,
): Promise<LinkEdgeRow[]> {
  const [asSource, asTarget] = await Promise.all([
    ctx.db
      .query("memoryLinks")
      .withIndex("by_user_source", (q) =>
        q.eq("userId", userId).eq("sourceId", memoryId),
      )
      .take(perNode),
    ctx.db
      .query("memoryLinks")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", userId).eq("targetId", memoryId),
      )
      .take(perNode),
  ]);
  return [...asSource, ...asTarget];
}

// Bounded replacement for listMemoryLinksForUser on the retrieve path: walks
// outward from the seed memories with indexed per-node lookups, so the bytes
// read scale with the neighbourhood of the hits, not with the user's total
// number of links.
export async function listMemoryLinksAround(
  ctx: QueryCtx | MutationCtx,
  params: {
    userId: string;
    seedIds: readonly string[];
    hops: number;
    perNode?: number;
    maxEdges?: number;
  },
): Promise<MemoryLinkEdge[]> {
  const perNode = Math.max(1, params.perNode ?? LINK_EXPANSION_PER_NODE);
  const maxEdges = Math.max(1, params.maxEdges ?? LINK_EXPANSION_MAX_EDGES);
  const hops = Math.min(Math.max(0, params.hops), LINK_EXPANSION_MAX_HOPS);
  const visited = new Set<string>(
    params.seedIds.slice(0, LINK_EXPANSION_MAX_SEEDS),
  );
  const edges = new Map<string, MemoryLinkEdge>();
  let frontier = [...visited];
  for (let hop = 0; hop < hops && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const memoryId of frontier) {
      if (edges.size >= maxEdges) return [...edges.values()];
      const rows = await listIncidentLinks(
        ctx,
        params.userId,
        memoryId,
        perNode,
      );
      for (const row of rows) {
        const key = `${row.sourceId}|${row.targetId}`;
        if (edges.has(key)) continue;
        if (edges.size >= maxEdges) break;
        edges.set(key, {
          sourceId: row.sourceId,
          targetId: row.targetId,
          reason: row.reason,
        });
        for (const neighbor of [row.sourceId, row.targetId]) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return [...edges.values()];
}
