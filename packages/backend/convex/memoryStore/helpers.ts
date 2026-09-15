import type { MemoryStatus, MemoryType, MemoryWithTags } from "@vmem/sdk";
import {
  memoryMatchesListFilter,
  pageMemoryList,
} from "../../engine/memory/list";
import {
  memoryMatchesScope,
  type MemoryReadScope,
} from "../../engine/memory/scope";
import { normalizeTags } from "../../engine/memory/tags";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { parseIsoMillis, toMemoryWithTags } from "./mappers";

export interface CreateMemoryStoreParams {
  memoryId?: string;
  userId: string;
  profileId: string;
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  tags: string[];
  confidence: number;
  contentHash: string;
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
    profileId: params.profileId,
    title: params.title,
    content: params.content,
    type: params.type,
    source: params.source,
    confidence: params.confidence,
    status: "active",
    tags: normalizeTags(params.tags),
    createdAt: now,
    updatedAt: now,
    expiresAt,
    url: params.url,
    contentHash: params.contentHash,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    sourceUrl: params.sourceUrl,
    sourceSyncedAt,
    storageId: params.storageId,
    mimeType: params.mimeType,
    originalFilename: params.originalFilename,
    visitCount: 1,
    firstVisitAt: now,
    lastVisitAt: now,
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

export async function updateMemory(
  ctx: MutationCtx,
  userId: string,
  memoryId: string,
  updates: UpdateMemoryStoreParams,
): Promise<MemoryWithTags | null> {
  const doc = await findByMemoryId(ctx, memoryId);
  if (!doc || doc.userId !== userId) return null;

  const now = Date.now();
  if (updates.expiresAt === null) {
    const {
      _id,
      _creationTime,
      expiresAt: _expiresAt,
      ...fields
    } = {
      ...doc,
      title: updates.title ?? doc.title,
      content: updates.content ?? doc.content,
      type: updates.type ?? doc.type,
      status: updates.status ?? doc.status,
      tags: updates.tags === undefined ? doc.tags : normalizeTags(updates.tags),
      confidence: updates.confidence ?? doc.confidence,
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
      ...(updates.tags !== undefined
        ? { tags: normalizeTags(updates.tags) }
        : {}),
      ...(updates.confidence !== undefined
        ? { confidence: updates.confidence }
        : {}),
      ...(updates.expiresAt !== undefined
        ? { expiresAt: parseIsoMillis(updates.expiresAt) }
        : {}),
    });
  }

  const updated = await findByMemoryId(ctx, memoryId);
  if (!updated) return null;
  return toMemoryWithTags(updated);
}

export async function deleteMemory(
  ctx: MutationCtx,
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const doc = await findByMemoryId(ctx, memoryId);
  if (!doc || doc.userId !== userId) return false;
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
  for (const doc of docs) {
    await ctx.db.delete(doc._id);
  }
  return docs.length;
}
