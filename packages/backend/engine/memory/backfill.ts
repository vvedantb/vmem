import type { MemoryStatus, MemoryType, MemoryWithTags } from "@vmem/sdk";

export const BACKFILL_DEFAULT_LIMIT = 100;
export const BACKFILL_MAX_LIMIT = 500;

export interface BackfillCursor {
  createdAt: string;
  id: string;
}

export interface BackfillInsertRow {
  memoryId: string;
  userId: string;
  profileId?: string;
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  tags: string[];
  confidence: number;
  contentHash: string;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  sourceType?: string;
  sourceId?: string;
  sourceUrl?: string;
  sourceSyncedAt?: string;
}

export interface BackfillPageResult {
  scanned: number;
  inserted: number;
  wouldInsert: number;
  skipped: number;
  invalid: number;
  nextCursor: BackfillCursor | null;
  done: boolean;
  dryRun: boolean;
}

function optionalString(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value;
}

export function clampBackfillLimit(limit: number | undefined): number {
  const n = Math.trunc(limit ?? BACKFILL_DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return BACKFILL_DEFAULT_LIMIT;
  return Math.min(BACKFILL_MAX_LIMIT, Math.max(1, n));
}

export function toBackfillInsertRow(
  memory: MemoryWithTags,
  contentHash: string,
): BackfillInsertRow {
  return {
    memoryId: memory.id,
    userId: memory.userId,
    profileId: optionalString(memory.profileId),
    title: memory.title,
    content: memory.content,
    type: memory.type,
    source: memory.source,
    tags: memory.tags,
    confidence: memory.confidence,
    contentHash,
    status: memory.status,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    expiresAt: optionalString(memory.expiresAt),
    sourceType: optionalString(memory.sourceType),
    sourceId: optionalString(memory.sourceId),
    sourceUrl: optionalString(memory.sourceUrl),
    sourceSyncedAt: optionalString(memory.sourceSyncedAt),
  };
}

export function partitionBackfillRows<T extends { memoryId: string }>(
  rows: readonly T[],
  existingIds: ReadonlySet<string>,
): { toInsert: T[]; skipped: T[] } {
  const toInsert: T[] = [];
  const skipped: T[] = [];
  for (const row of rows) {
    if (existingIds.has(row.memoryId)) skipped.push(row);
    else toInsert.push(row);
  }
  return { toInsert, skipped };
}

export function summarizeBackfillPage(input: {
  scanned: number;
  invalid: number;
  skipped: number;
  toInsertCount: number;
  inserted: number;
  dryRun: boolean;
  last: BackfillCursor | undefined;
  limit: number;
}): BackfillPageResult {
  const done = input.scanned < input.limit;
  return {
    scanned: input.scanned,
    inserted: input.dryRun ? 0 : input.inserted,
    wouldInsert: input.toInsertCount,
    skipped: input.skipped,
    invalid: input.invalid,
    nextCursor: done || input.last === undefined ? null : input.last,
    done,
    dryRun: input.dryRun,
  };
}
