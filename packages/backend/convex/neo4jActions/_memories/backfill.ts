"use node";

import { computeContentHash } from "../../../engine/memory/hash";
import {
  clampBackfillLimit,
  partitionBackfillRows,
  summarizeBackfillPage,
  toBackfillInsertRow,
  type BackfillPageResult,
} from "../../../engine/memory/backfill";
import { scanMemoriesForBackfill } from "../../../engine/neo4j/memory/backfill";
import { getDriver } from "../../../engine/neo4j/driver";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";

export interface BackfillMemoryStoreArgs {
  dryRun?: boolean;
  limit?: number;
  cursorCreatedAt?: string;
  cursorId?: string;
  userId?: string;
  profileId?: string;
}

export async function runBackfillMemoryStore(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: BackfillMemoryStoreArgs,
): Promise<BackfillPageResult> {
  const dryRun = args.dryRun !== false;
  const limit = clampBackfillLimit(args.limit);
  const page = await scanMemoriesForBackfill(getDriver(), {
    limit,
    cursorCreatedAt: args.cursorCreatedAt,
    cursorId: args.cursorId,
    userId: args.userId,
    profileId: args.profileId,
  });

  const rows = page.memories.map((memory) =>
    toBackfillInsertRow(
      memory,
      computeContentHash(memory.title, memory.content),
    ),
  );
  const existing = await ctx.runQuery(
    internal.memoryStore.functions.existingMemoryIdsInternal,
    { memoryIds: rows.map((row) => row.memoryId) },
  );
  const { toInsert, skipped } = partitionBackfillRows(rows, new Set(existing));

  let inserted = 0;
  if (!dryRun && toInsert.length > 0) {
    inserted = await ctx.runMutation(
      internal.memoryStore.functions.insertBackfillBatchInternal,
      { rows: toInsert },
    );
  }

  return summarizeBackfillPage({
    scanned: page.memories.length + page.invalid,
    invalid: page.invalid,
    skipped: skipped.length,
    toInsertCount: toInsert.length,
    inserted,
    dryRun,
    last: page.lastCursor ?? undefined,
    limit,
  });
}
