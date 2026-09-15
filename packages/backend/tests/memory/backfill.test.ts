import { describe, expect, it } from "vitest";
import type { MemoryWithTags } from "@vmem/sdk";
import {
  BACKFILL_DEFAULT_LIMIT,
  BACKFILL_MAX_LIMIT,
  clampBackfillLimit,
  partitionBackfillRows,
  summarizeBackfillPage,
  toBackfillInsertRow,
} from "../../engine/memory/backfill";
import {
  BACKFILL_SCAN_CYPHER,
  buildBackfillScanParams,
} from "../../engine/neo4j/memory/backfill";

const memory: MemoryWithTags = {
  id: "neo4j-uuid",
  userId: "clerk_user_a",
  profileId: null,
  title: "Prefers pnpm",
  content: "Use pnpm for vmem",
  type: "knowledge",
  source: "api",
  sourceType: null,
  sourceId: "src-1",
  sourceUrl: null,
  sourceSyncedAt: null,
  confidence: 0.8,
  status: "suppressed",
  createdAt: "2024-01-02T03:04:05.000Z",
  updatedAt: "2024-02-03T04:05:06.000Z",
  expiresAt: null,
  tags: ["tooling"],
};

describe("clampBackfillLimit", () => {
  it("defaults, floors, and caps the page size", () => {
    expect(clampBackfillLimit(undefined)).toBe(BACKFILL_DEFAULT_LIMIT);
    expect(clampBackfillLimit(Number.NaN)).toBe(BACKFILL_DEFAULT_LIMIT);
    expect(clampBackfillLimit(0)).toBe(1);
    expect(clampBackfillLimit(12.9)).toBe(12);
    expect(clampBackfillLimit(10_000)).toBe(BACKFILL_MAX_LIMIT);
  });
});

describe("toBackfillInsertRow", () => {
  it("keeps the Neo4j uuid, status, timestamps, and omits nulls", () => {
    expect(toBackfillInsertRow(memory, "hash-1")).toEqual({
      memoryId: "neo4j-uuid",
      userId: "clerk_user_a",
      profileId: undefined,
      title: "Prefers pnpm",
      content: "Use pnpm for vmem",
      type: "knowledge",
      source: "api",
      tags: ["tooling"],
      confidence: 0.8,
      contentHash: "hash-1",
      status: "suppressed",
      createdAt: "2024-01-02T03:04:05.000Z",
      updatedAt: "2024-02-03T04:05:06.000Z",
      expiresAt: undefined,
      sourceType: undefined,
      sourceId: "src-1",
      sourceUrl: undefined,
      sourceSyncedAt: undefined,
    });
  });
});

describe("partitionBackfillRows", () => {
  it("skips ids already in Convex", () => {
    const { toInsert, skipped } = partitionBackfillRows(
      [{ memoryId: "a" }, { memoryId: "b" }, { memoryId: "c" }],
      new Set(["b"]),
    );
    expect(toInsert.map((row) => row.memoryId)).toEqual(["a", "c"]);
    expect(skipped.map((row) => row.memoryId)).toEqual(["b"]);
  });
});

describe("summarizeBackfillPage", () => {
  it("keeps dry-run from inserting and returns a cursor when a full page remains", () => {
    const result = summarizeBackfillPage({
      scanned: 100,
      invalid: 1,
      skipped: 4,
      toInsertCount: 95,
      inserted: 95,
      dryRun: true,
      last: { createdAt: "2024-01-02T00:00:00.000Z", id: "last" },
      limit: 100,
    });
    expect(result).toEqual({
      scanned: 100,
      inserted: 0,
      wouldInsert: 95,
      skipped: 4,
      invalid: 1,
      nextCursor: { createdAt: "2024-01-02T00:00:00.000Z", id: "last" },
      done: false,
      dryRun: true,
    });
  });

  it("marks a short page done and records live inserts", () => {
    const result = summarizeBackfillPage({
      scanned: 3,
      invalid: 0,
      skipped: 1,
      toInsertCount: 2,
      inserted: 2,
      dryRun: false,
      last: { createdAt: "2024-01-02T00:00:00.000Z", id: "last" },
      limit: 100,
    });
    expect(result.done).toBe(true);
    expect(result.nextCursor).toBeNull();
    expect(result.inserted).toBe(2);
    expect(result.dryRun).toBe(false);
  });
});

describe("buildBackfillScanParams", () => {
  it("nulls optional filters and only applies a complete cursor", () => {
    expect(BACKFILL_SCAN_CYPHER).toContain(
      "ORDER BY m.createdAt ASC, m.id ASC",
    );

    const open = buildBackfillScanParams({ limit: 50 });
    expect(open.cursorCreatedAt).toBeNull();
    expect(open.cursorId).toBeNull();
    expect(open.filterUserId).toBeNull();
    expect(open.filterProfileId).toBeNull();
    expect(open.limit.toNumber()).toBe(50);

    const paged = buildBackfillScanParams({
      limit: 10,
      cursorCreatedAt: "2024-01-02T00:00:00.000Z",
      cursorId: "mem-9",
      userId: "clerk_a",
      profileId: "profile_team",
    });
    expect(paged.cursorCreatedAt).toBe("2024-01-02T00:00:00.000Z");
    expect(paged.cursorId).toBe("mem-9");
    expect(paged.filterUserId).toBe("clerk_a");
    expect(paged.filterProfileId).toBe("profile_team");
  });
});
