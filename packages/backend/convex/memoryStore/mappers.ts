import type { MemoryWithTags } from "@vmem/sdk";
import type { Doc } from "../_generated/dataModel";
import { temporalFieldsFromStore } from "../../engine/memory/temporal";
import { computeUsefulness } from "../../engine/memory/usefulness";

/** Heuristic (+ Jev) usefulness for a stored row, with the clock supplied. */
export function usefulnessOfDoc(doc: Doc<"memories">, nowMs: number): number {
  return computeUsefulness({
    source: doc.source,
    sourceType: doc.sourceType,
    pinned: doc.status === "pinned",
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    nowMs,
    retrieveHits: doc.usefulnessRetrieveHits,
    searchHits: doc.usefulnessSearchHits,
    contextPackHits: doc.usefulnessContextPackHits,
    userEdits: doc.usefulnessEditCount,
    jevQuality: doc.usefulnessJevScore,
  });
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function parseIsoMillis(value: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return ms;
}

export function toMemoryStatRow(doc: Doc<"memories">): {
  createdAt: number;
  tags: string[];
} {
  return { createdAt: doc.createdAt, tags: doc.tags };
}

export function toMemoryWithTags(doc: Doc<"memories">): MemoryWithTags {
  return {
    id: doc.memoryId,
    userId: doc.userId,
    profileId: doc.profileId ?? null,
    title: doc.title,
    content: doc.content,
    type: doc.type,
    source: doc.source,
    sourceType: doc.sourceType ?? null,
    sourceId: doc.sourceId ?? null,
    sourceUrl: doc.sourceUrl ?? null,
    sourceSyncedAt:
      doc.sourceSyncedAt === undefined ? null : toIso(doc.sourceSyncedAt),
    confidence: doc.confidence,
    status: doc.status,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    expiresAt: doc.expiresAt === undefined ? null : toIso(doc.expiresAt),
    ...temporalFieldsFromStore({
      eventStart: doc.eventStart,
      eventEnd: doc.eventEnd,
      temporalKind: doc.temporalKind,
    }),
    tags: doc.tags,
    ...(hasUsefulnessSignals(doc)
      ? {
          usefulness: {
            score: doc.usefulnessScore,
            retrieveHits: doc.usefulnessRetrieveHits,
            searchHits: doc.usefulnessSearchHits,
            contextPackHits: doc.usefulnessContextPackHits,
            userEdits: doc.usefulnessEditCount,
            jevQuality: doc.usefulnessJevScore,
          },
        }
      : {}),
  };
}

function hasUsefulnessSignals(doc: Doc<"memories">): boolean {
  return (
    doc.usefulnessScore !== undefined ||
    doc.usefulnessRetrieveHits !== undefined ||
    doc.usefulnessSearchHits !== undefined ||
    doc.usefulnessContextPackHits !== undefined ||
    doc.usefulnessEditCount !== undefined ||
    doc.usefulnessJevScore !== undefined
  );
}

// slim list row: no content/searchableText, only a short single-line preview
export const MEMORY_PREVIEW_CHARS = 200;

export type MemorySummary = {
  id: string;
  title: string;
  preview: string;
  type: Doc<"memories">["type"];
  status: Doc<"memories">["status"];
  source: string;
  sourceUrl: string | null;
  sourceSyncedAt: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  profileId: string | null;
  usefulnessScore?: number | null;
};

export function memoryPreview(content: string): string {
  return content
    .slice(0, MEMORY_PREVIEW_CHARS * 2)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MEMORY_PREVIEW_CHARS);
}

export function toMemorySummary(doc: Doc<"memories">): MemorySummary {
  return {
    id: doc.memoryId,
    title: doc.title,
    preview: memoryPreview(doc.content),
    type: doc.type,
    status: doc.status,
    source: doc.source,
    sourceUrl: doc.sourceUrl ?? null,
    sourceSyncedAt:
      doc.sourceSyncedAt === undefined ? null : toIso(doc.sourceSyncedAt),
    tags: doc.tags,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    profileId: doc.profileId ?? null,
    usefulnessScore: doc.usefulnessScore ?? null,
  };
}
