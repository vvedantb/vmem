import {
  extractEntitiesFallback,
  mergeExtractedEntities,
  suggestRelatedMemoryIds,
  type ExtractedEntity,
  type KnownEntity,
  type RelatedMemorySuggestion,
} from "../../engine/memory/entities";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAX_KNOWN_ENTITIES = 150;
const RECENT_CANDIDATES = 16;
const MAX_LINKS_PER_WRITE = 32;

type MemoryLinkOrigin = "manual" | "entity" | "extract";

interface GraphEntityNode {
  id: string;
  name: string;
  normalizedName: string;
  type: string;
  createdAt: number;
}

interface GraphMentionEdge {
  memoryId: string;
  entityId: string;
}

function graphEntityId(normalizedName: string): string {
  return `entity ${normalizedName}`;
}

function isAutoOrigin(origin: string | undefined): boolean {
  return origin === "entity" || origin === "extract";
}

export async function listKnownEntities(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<KnownEntity[]> {
  const rows = await ctx.db
    .query("memoryEntities")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(MAX_KNOWN_ENTITIES);
  return rows.map((row) => ({
    name: row.name,
    normalizedName: row.normalizedName,
    type: row.type,
  }));
}

export async function listEntitiesForGraph(
  ctx: QueryCtx,
  userId: string,
): Promise<{ nodes: GraphEntityNode[]; mentions: GraphMentionEdge[] }> {
  const entities = await ctx.db
    .query("memoryEntities")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const nodes: GraphEntityNode[] = entities.map((row) => ({
    id: graphEntityId(row.normalizedName),
    name: row.name,
    normalizedName: row.normalizedName,
    type: row.type,
    createdAt: row.createdAt,
  }));
  const mentions: GraphMentionEdge[] = [];
  for (const entity of entities) {
    const rows = await ctx.db
      .query("memoryEntityMentions")
      .withIndex("by_entity", (q) => q.eq("entityId", entity._id))
      .collect();
    for (const row of rows) {
      mentions.push({
        memoryId: row.memoryId,
        entityId: graphEntityId(entity.normalizedName),
      });
    }
  }
  return { nodes, mentions };
}

async function listRecentCandidates(
  ctx: MutationCtx,
  doc: Doc<"memories">,
): Promise<Array<{ id: string; title: string; tags: string[] }>> {
  const rows = await ctx.db
    .query("memories")
    .withIndex("by_user_created", (q) => q.eq("userId", doc.userId))
    .order("desc")
    .take(RECENT_CANDIDATES + 4);
  const out: Array<{ id: string; title: string; tags: string[] }> = [];
  for (const row of rows) {
    if (row.memoryId === doc.memoryId) continue;
    if (doc.profileId !== undefined && row.profileId !== doc.profileId) {
      continue;
    }
    out.push({ id: row.memoryId, title: row.title, tags: row.tags });
    if (out.length >= RECENT_CANDIDATES) break;
  }
  return out.reverse();
}

async function upsertEntity(
  ctx: MutationCtx,
  doc: Doc<"memories">,
  entity: ExtractedEntity,
): Promise<Id<"memoryEntities">> {
  const existing = await ctx.db
    .query("memoryEntities")
    .withIndex("by_user_normalized", (q) =>
      q.eq("userId", doc.userId).eq("normalizedName", entity.normalizedName),
    )
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("memoryEntities", {
    userId: doc.userId,
    ...(doc.profileId === undefined ? {} : { profileId: doc.profileId }),
    name: entity.name,
    normalizedName: entity.normalizedName,
    type: entity.type,
    createdAt: Date.now(),
  });
}

async function deleteMentionsForMemory(
  ctx: MutationCtx,
  memoryId: string,
): Promise<Array<{ entityId: Id<"memoryEntities"> }>> {
  const rows = await ctx.db
    .query("memoryEntityMentions")
    .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
    .collect();
  const entityIds = rows.map((row) => ({ entityId: row.entityId }));
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return entityIds;
}

async function deleteOrphanEntities(
  ctx: MutationCtx,
  entityIds: ReadonlyArray<Id<"memoryEntities">>,
): Promise<void> {
  const seen = new Set<string>();
  for (const entityId of entityIds) {
    if (seen.has(entityId)) continue;
    seen.add(entityId);
    const remaining = await ctx.db
      .query("memoryEntityMentions")
      .withIndex("by_entity", (q) => q.eq("entityId", entityId))
      .first();
    if (remaining) continue;
    await ctx.db.delete(entityId);
  }
}

async function deleteAutoLinksForMemory(
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
    if (seen.has(row._id) || !isAutoOrigin(row.origin)) continue;
    seen.add(row._id);
    await ctx.db.delete(row._id);
  }
}

export async function deleteEntitiesForMemory(
  ctx: MutationCtx,
  userId: string,
  memoryId: string,
): Promise<void> {
  const removed = await deleteMentionsForMemory(ctx, memoryId);
  await deleteOrphanEntities(
    ctx,
    removed.map((row) => row.entityId),
  );
  await deleteAutoLinksForMemory(ctx, userId, memoryId);
}

export async function deleteEntitiesForUser(
  ctx: MutationCtx,
  userId: string,
): Promise<void> {
  const mentions = await ctx.db
    .query("memoryEntityMentions")
    .withIndex("by_user_normalized", (q) => q.eq("userId", userId))
    .collect();
  for (const row of mentions) {
    await ctx.db.delete(row._id);
  }
  const entities = await ctx.db
    .query("memoryEntities")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const row of entities) {
    await ctx.db.delete(row._id);
  }
}

function orderedLinkIds(
  a: string,
  b: string,
): { sourceId: string; targetId: string } {
  return a < b ? { sourceId: a, targetId: b } : { sourceId: b, targetId: a };
}

async function linkAuto(
  ctx: MutationCtx,
  doc: Doc<"memories">,
  otherId: string,
  reason: string,
  origin: MemoryLinkOrigin,
): Promise<boolean> {
  if (doc.memoryId === otherId) return false;
  const { sourceId, targetId } = orderedLinkIds(doc.memoryId, otherId);
  const existing = await ctx.db
    .query("memoryLinks")
    .withIndex("by_source_target", (q) =>
      q.eq("sourceId", sourceId).eq("targetId", targetId),
    )
    .first();
  if (existing) return true;
  const other = await ctx.db
    .query("memories")
    .withIndex("by_memory_id", (q) => q.eq("memoryId", otherId))
    .first();
  if (!other || other.userId !== doc.userId) return false;
  await ctx.db.insert("memoryLinks", {
    userId: doc.userId,
    ...(doc.profileId === undefined ? {} : { profileId: doc.profileId }),
    sourceId,
    targetId,
    reason: reason.trim() || "related",
    createdAt: Date.now(),
    origin,
  });
  return true;
}

async function applyExtractedEntities(
  ctx: MutationCtx,
  doc: Doc<"memories">,
  entities: readonly ExtractedEntity[],
  related: readonly RelatedMemorySuggestion[],
): Promise<number> {
  const stale = await deleteMentionsForMemory(ctx, doc.memoryId);
  await deleteAutoLinksForMemory(ctx, doc.userId, doc.memoryId);

  let links = 0;
  for (const entity of entities) {
    const entityId = await upsertEntity(ctx, doc, entity);
    await ctx.db.insert("memoryEntityMentions", {
      userId: doc.userId,
      ...(doc.profileId === undefined ? {} : { profileId: doc.profileId }),
      memoryId: doc.memoryId,
      entityId,
      normalizedName: entity.normalizedName,
      createdAt: Date.now(),
    });
    if (links >= MAX_LINKS_PER_WRITE) continue;
    const others = await ctx.db
      .query("memoryEntityMentions")
      .withIndex("by_user_normalized", (q) =>
        q.eq("userId", doc.userId).eq("normalizedName", entity.normalizedName),
      )
      .take(MAX_LINKS_PER_WRITE + 1);
    for (const other of others) {
      if (other.memoryId === doc.memoryId) continue;
      if (links >= MAX_LINKS_PER_WRITE) break;
      const linked = await linkAuto(
        ctx,
        doc,
        other.memoryId,
        entity.name,
        "entity",
      );
      if (linked) links += 1;
    }
  }

  for (const suggestion of related) {
    if (links >= MAX_LINKS_PER_WRITE) break;
    const linked = await linkAuto(
      ctx,
      doc,
      suggestion.id,
      suggestion.reason,
      "extract",
    );
    if (linked) links += 1;
  }

  await deleteOrphanEntities(
    ctx,
    stale.map((row) => row.entityId),
  );
  return links;
}

export async function applyFallbackEntityExtraction(
  ctx: MutationCtx,
  doc: Doc<"memories">,
): Promise<number> {
  const known = await listKnownEntities(ctx, doc.userId);
  const entities = extractEntitiesFallback({
    title: doc.title,
    content: doc.content,
    tags: doc.tags,
    knownEntities: known,
  });
  const candidates = await listRecentCandidates(ctx, doc);
  const related = suggestRelatedMemoryIds({
    title: doc.title,
    content: doc.content,
    tags: doc.tags,
    candidates,
  });
  return await applyExtractedEntities(ctx, doc, entities, related);
}

export async function applyLlmEntityExtraction(
  ctx: MutationCtx,
  params: {
    userId: string;
    memoryId: string;
    entities: ExtractedEntity[];
    relatedMemoryIds: string[];
  },
): Promise<number> {
  const doc = await ctx.db
    .query("memories")
    .withIndex("by_memory_id", (q) => q.eq("memoryId", params.memoryId))
    .first();
  if (!doc || doc.userId !== params.userId) return 0;

  const known = await listKnownEntities(ctx, doc.userId);
  const fallback = extractEntitiesFallback({
    title: doc.title,
    content: doc.content,
    tags: doc.tags,
    knownEntities: known,
  });
  const entities = mergeExtractedEntities(params.entities, fallback);
  const candidates = await listRecentCandidates(ctx, doc);
  const allowed = new Set(candidates.map((candidate) => candidate.id));
  const related = [
    ...suggestRelatedMemoryIds({
      title: doc.title,
      content: doc.content,
      tags: doc.tags,
      candidates,
    }),
    ...params.relatedMemoryIds
      .filter((id) => allowed.has(id))
      .map((id) => ({ id, reason: "related" })),
  ];
  return await applyExtractedEntities(ctx, doc, entities, related);
}

export async function listRecentMemoryCandidates(
  ctx: QueryCtx,
  userId: string,
  profileId: string | undefined,
  excludeMemoryId: string,
): Promise<Array<{ id: string; title: string; tags: string[] }>> {
  const rows = await ctx.db
    .query("memories")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .order("desc")
    .take(RECENT_CANDIDATES + 4);
  const out: Array<{ id: string; title: string; tags: string[] }> = [];
  for (const row of rows) {
    if (row.memoryId === excludeMemoryId) continue;
    if (profileId !== undefined && row.profileId !== profileId) continue;
    out.push({ id: row.memoryId, title: row.title, tags: row.tags });
    if (out.length >= RECENT_CANDIDATES) break;
  }
  return out.reverse();
}
