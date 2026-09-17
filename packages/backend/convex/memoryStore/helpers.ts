import type { MemoryStatus, MemoryType, MemoryWithTags } from "@vmem/sdk";
import { computeContentHash } from "../../engine/memory/hash";
import {
  memoryMatchesListFilter,
  pageMemoryList,
} from "../../engine/memory/list";
import {
  memoryMatchesScope,
  type MemoryReadScope,
} from "../../engine/memory/scope";
import { ftsQueryTexts } from "../../engine/memory/candidates";
import { clampFtsTake, FTS_TAKE } from "../../engine/memory/retrieveCaps";
import { buildSearchableText } from "../../engine/memory/searchableText";
import { normalizeTags } from "../../engine/memory/tags";
import type { MemoryLinkEdge } from "../../engine/memory/links";
import { UPDATES_LINK_REASON } from "../../engine/memory/supersede";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { parseIsoMillis, toMemoryWithTags } from "./mappers";

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
}

export interface ListMemoryStoreParams {
  type?: string;
  status?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
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
}

export interface MemoryListStoreResult {
  memories: MemoryWithTags[];
  total: number;
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

function pageFiltered(
  docs: Array<Doc<"memories">>,
  params: ListMemoryStoreParams,
): MemoryListStoreResult {
  const matched = docs.filter((doc) => memoryMatchesListFilter(doc, params));
  return {
    memories: pageMemoryList(matched, params.limit, params.offset).map(
      toMemoryWithTags,
    ),
    total: matched.length,
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
  });

  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create memory");
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
  return toMemoryWithTags(doc);
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
  return toMemoryWithTags(doc);
}

export async function listMemories(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  params: ListMemoryStoreParams & { profileId?: string | null },
): Promise<MemoryListStoreResult> {
  const docs = await listScopedDocs(ctx, {
    kind: "personal",
    userId,
    profileId: params.profileId,
  });
  return pageFiltered(docs, params);
}

export async function listMemoriesForTeam(
  ctx: QueryCtx | MutationCtx,
  profileId: string,
  params: ListMemoryStoreParams,
): Promise<MemoryListStoreResult> {
  const docs = await listScopedDocs(ctx, { kind: "team", profileId });
  return pageFiltered(docs, params);
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
      type: updates.type ?? doc.type,
      status: updates.status ?? doc.status,
      tags: nextTags,
      confidence: updates.confidence ?? doc.confidence,
      contentHash,
      searchableText,
      updatedAt: now,
    };
    await ctx.db.replace(_id, fields);
  } else {
    await ctx.db.patch(doc._id, {
      updatedAt: now,
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
    });
  }

  const updated = await findByMemoryId(ctx, doc.memoryId);
  if (!updated) return null;
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
      { status: "suppressed" },
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
  await deleteLinksForMemory(ctx, userId, memoryId);
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
  await deleteLinksForMemory(ctx, doc.userId, memoryId);
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
  await deleteLinksForUser(ctx, userId);
  for (const doc of docs) {
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
  for (const doc of docs) {
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
  for (const doc of docs) {
    await ctx.db.patch(doc._id, { profileId: toProfileId });
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
  let deleted = 0;
  for (const doc of docs) {
    if (doc.sourceType === undefined || !wanted.has(doc.sourceType)) continue;
    await ctx.db.delete(doc._id);
    deleted += 1;
  }
  return deleted;
}

export async function upsertMemoryFromSource(
  ctx: MutationCtx,
  params: CreateMemoryStoreParams & { sourceId: string; sourceType: string },
): Promise<MemoryWithTags> {
  const docs = await ctx.db
    .query("memories")
    .withIndex("by_user_created", (q) => q.eq("userId", params.userId))
    .collect();
  const existing = docs.find(
    (doc) =>
      doc.sourceType === params.sourceType && doc.sourceId === params.sourceId,
  );
  if (existing) {
    const updated = await updateMemory(ctx, params.userId, existing.memoryId, {
      title: params.title,
      content: params.content,
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

export async function searchMemoriesText(
  ctx: QueryCtx,
  scope: MemoryReadScope,
  query: string,
  take: number = FTS_TAKE,
): Promise<Array<{ memory: MemoryWithTags; rank: number }>> {
  const queries = ftsQueryTexts(query);
  if (queries.length === 0) return [];
  const limit = clampFtsTake(take);
  const seen = new Set<string>();
  const out: Array<{ memory: MemoryWithTags; rank: number }> = [];

  for (const search of queries) {
    const hits =
      scope.kind === "team"
        ? await ctx.db
            .query("memories")
            .withSearchIndex("search_text", (q) =>
              q
                .search("searchableText", search)
                .eq("profileId", scope.profileId),
            )
            .take(limit)
        : await ctx.db
            .query("memories")
            .withSearchIndex("search_text", (q) =>
              q.search("searchableText", search).eq("userId", scope.userId),
            )
            .take(limit);
    for (const doc of hits) {
      if (seen.has(doc.memoryId)) continue;
      if (!memoryMatchesScope(doc, scope)) continue;
      seen.add(doc.memoryId);
      out.push({ memory: toMemoryWithTags(doc), rank: out.length + 1 });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export async function getMemoriesByDocIds(
  ctx: QueryCtx,
  ids: Array<Id<"memories">>,
): Promise<Array<MemoryWithTags | null>> {
  const out: Array<MemoryWithTags | null> = [];
  for (const id of ids) {
    const doc = await ctx.db.get(id);
    out.push(doc ? toMemoryWithTags(doc) : null);
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
  await ctx.db.patch(doc._id, { embedding });
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
  if (existing) return true;
  await ctx.db.insert("memoryLinks", {
    userId: params.userId,
    ...(params.profileId === undefined ? {} : { profileId: params.profileId }),
    sourceId,
    targetId,
    reason: params.reason.trim() || "related",
    createdAt: Date.now(),
  });
  return true;
}

export async function unlinkMemories(
  ctx: MutationCtx,
  params: { userId: string; memoryIdA: string; memoryIdB: string },
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
  if (!existing || existing.userId !== params.userId) return false;
  await ctx.db.delete(existing._id);
  return true;
}

export async function listMemoryLinksForUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<MemoryLinkEdge[]> {
  const rows = await ctx.db
    .query("memoryLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.map((row) => ({
    sourceId: row.sourceId,
    targetId: row.targetId,
    reason: row.reason,
  }));
}
