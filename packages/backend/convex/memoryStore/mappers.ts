import type { MemoryWithTags } from "@vmem/sdk";
import type { Doc } from "../_generated/dataModel";
import { temporalFieldsFromStore } from "../../engine/memory/temporal";
import { computeUsefulness } from "../../engine/memory/usefulness";
import { toWellFormed, truncateWellFormed } from "../lib/wellFormed";

export interface UsageHits {
  retrieveHits?: number;
  searchHits?: number;
  contextPackHits?: number;
}

/** Hits from the legacy counters on the memory row (pre memoryUsage). */
export function legacyHitsOf(doc: Doc<"memories">): UsageHits {
  return {
    retrieveHits: doc.usefulnessRetrieveHits,
    searchHits: doc.usefulnessSearchHits,
    contextPackHits: doc.usefulnessContextPackHits,
  };
}

/**
 * Heuristic (+ Jev) usefulness for a stored row, with the clock supplied.
 * `hits` come from memoryUsage; without them the legacy row counters apply.
 */
export function usefulnessOfDoc(
  doc: Doc<"memories">,
  nowMs: number,
  hits: UsageHits = legacyHitsOf(doc),
): number {
  return computeUsefulness({
    source: doc.source,
    sourceType: doc.sourceType,
    pinned: doc.status === "pinned",
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    nowMs,
    retrieveHits: hits.retrieveHits,
    searchHits: hits.searchHits,
    contextPackHits: hits.contextPackHits,
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

/**
 * Row to API shape for list, search and retrieve. Hit counts live in
 * `memoryUsage`, so these rows omit them. Single reads use `toMemoryWithHits`.
 */
export function toMemoryWithTags(doc: Doc<"memories">): MemoryWithTags {
  return toMemoryWithHits(doc, undefined);
}

/** Single-row read: `hits` come from `loadUsageHits`. */
export function toMemoryWithHits(
  doc: Doc<"memories">,
  hits: UsageHits | undefined,
): MemoryWithTags {
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
    ...visitCountField(doc),
    ...(hasUsefulnessSignals(doc, hits)
      ? {
          usefulness: {
            score: doc.usefulnessScore,
            retrieveHits: hits?.retrieveHits,
            searchHits: hits?.searchHits,
            contextPackHits: hits?.contextPackHits,
            userEdits: doc.usefulnessEditCount,
            jevQuality: doc.usefulnessJevScore,
          },
        }
      : {}),
  };
}

// only rows seen more than once carry it (list "×N visits")
function visitCountField(doc: Doc<"memories">): { visitCount?: number } {
  return doc.visitCount > 1 ? { visitCount: doc.visitCount } : {};
}

function hasUsefulnessSignals(
  doc: Doc<"memories">,
  hits: UsageHits | undefined,
): boolean {
  return (
    doc.usefulnessScore !== undefined ||
    hits?.retrieveHits !== undefined ||
    hits?.searchHits !== undefined ||
    hits?.contextPackHits !== undefined ||
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
  visitCount?: number;
};

export function memoryPreview(content: string): string {
  const flat = truncateWellFormed(content, MEMORY_PREVIEW_CHARS * 2)
    .replace(/\s+/g, " ")
    .trim();
  return truncateWellFormed(flat, MEMORY_PREVIEW_CHARS);
}

export function toMemorySummary(doc: Doc<"memories">): MemorySummary {
  return {
    id: doc.memoryId,
    title: toWellFormed(doc.title),
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
    ...visitCountField(doc),
  };
}
