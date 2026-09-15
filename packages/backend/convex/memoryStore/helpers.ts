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
import { normalizeTags } from "../../engine/memory/tags";
import type { Doc } from "../_generated/dataModel";
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
  const nextTitle = updates.title ?? doc.title;
  const nextContent = updates.content ?? doc.content;
  const contentHash =
    updates.title !== undefined || updates.content !== undefined
      ? computeContentHash(nextTitle, nextContent)
      : doc.contentHash;
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
      tags: updates.tags === undefined ? doc.tags : normalizeTags(updates.tags),
      confidence: updates.confidence ?? doc.confidence,
      contentHash,
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
      ...(updates.title !== undefined || updates.content !== undefined
        ? { contentHash }
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
