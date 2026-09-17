import type { MemoryWithTags } from "@vmem/sdk";
import type { Doc } from "../_generated/dataModel";
import { temporalFieldsFromStore } from "../../engine/memory/temporal";

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
  };
}
