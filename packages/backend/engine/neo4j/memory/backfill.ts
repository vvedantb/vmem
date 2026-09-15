import type { Driver, Integer } from "neo4j-driver";
import type { MemoryWithTags } from "@vmem/sdk";
import {
  BACKFILL_DEFAULT_LIMIT,
  BACKFILL_MAX_LIMIT,
  type BackfillCursor,
} from "../../memory/backfill";
import { clampNeo4jLimit } from "../intParams";
import { neo4jGet } from "../record";
import { toMemoryWithTags } from "./mappers";

export const BACKFILL_SCAN_CYPHER = `MATCH (m:Memory)
WHERE ($filterUserId IS NULL OR m.userId = $filterUserId)
  AND ($filterProfileId IS NULL OR m.profileId = $filterProfileId)
  AND (
    $cursorCreatedAt IS NULL
    OR m.createdAt > $cursorCreatedAt
    OR (m.createdAt = $cursorCreatedAt AND m.id > $cursorId)
  )
WITH m
ORDER BY m.createdAt ASC, m.id ASC
LIMIT $limit
OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
RETURN m, collect(t.name) AS tags`;

export interface ScanMemoriesForBackfillParams {
  limit: number;
  cursorCreatedAt?: string;
  cursorId?: string;
  userId?: string;
  profileId?: string;
}

export interface BackfillScanParams {
  limit: Integer;
  cursorCreatedAt: string | null;
  cursorId: string | null;
  filterUserId: string | null;
  filterProfileId: string | null;
}

export interface BackfillScanPage {
  memories: MemoryWithTags[];
  invalid: number;
  lastCursor: BackfillCursor | null;
}

function readStringProp(object: object, key: string): string | null {
  const desc = Object.getOwnPropertyDescriptor(object, key);
  const value: unknown = desc?.value;
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export function buildBackfillScanParams(
  params: ScanMemoriesForBackfillParams,
): BackfillScanParams {
  const limit = clampNeo4jLimit(
    params.limit,
    BACKFILL_DEFAULT_LIMIT,
    BACKFILL_MAX_LIMIT,
  );
  const cursorCreatedAt = params.cursorCreatedAt;
  const cursorId = params.cursorId;
  const hasCursor =
    cursorCreatedAt !== undefined &&
    cursorCreatedAt.length > 0 &&
    cursorId !== undefined &&
    cursorId.length > 0;
  return {
    limit,
    cursorCreatedAt: hasCursor ? cursorCreatedAt : null,
    cursorId: hasCursor ? cursorId : null,
    filterUserId: params.userId ?? null,
    filterProfileId: params.profileId ?? null,
  };
}

function cursorFromMemoryRecord(
  record: Parameters<typeof neo4jGet>[0],
): BackfillCursor | null {
  const node = neo4jGet(record, "m");
  if (typeof node !== "object" || node === null) return null;
  const propertiesValue: unknown = Object.getOwnPropertyDescriptor(
    node,
    "properties",
  )?.value;
  if (typeof propertiesValue !== "object" || propertiesValue === null) {
    return null;
  }
  const id = readStringProp(propertiesValue, "id");
  const createdAt = readStringProp(propertiesValue, "createdAt");
  if (id === null || createdAt === null) return null;
  return { createdAt, id };
}

export async function scanMemoriesForBackfill(
  driver: Driver,
  params: ScanMemoriesForBackfillParams,
): Promise<BackfillScanPage> {
  const result = await driver.executeQuery(
    BACKFILL_SCAN_CYPHER,
    buildBackfillScanParams(params),
  );

  const memories: MemoryWithTags[] = [];
  let invalid = 0;
  let lastCursor: BackfillCursor | null = null;

  for (const record of result.records) {
    const cursor = cursorFromMemoryRecord(record);
    if (cursor) lastCursor = cursor;
    try {
      memories.push(toMemoryWithTags(record));
    } catch {
      invalid += 1;
    }
  }

  return { memories, invalid, lastCursor };
}
