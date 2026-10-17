import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { legacyHitsOf, type UsageHits } from "./mappers";

export async function findUsageRow(
  ctx: Pick<QueryCtx, "db">,
  memoryId: string,
): Promise<Doc<"memoryUsage"> | null> {
  return await ctx.db
    .query("memoryUsage")
    .withIndex("by_memory_id", (q) => q.eq("memoryId", memoryId))
    .unique();
}

/** Hits for scoring: the usage row, else the legacy counters on the memory. */
export async function loadUsageHits(
  ctx: Pick<QueryCtx, "db">,
  doc: Doc<"memories">,
): Promise<UsageHits> {
  return (await findUsageRow(ctx, doc.memoryId)) ?? legacyHitsOf(doc);
}

/** Drops the usage row and any pending access rows of a deleted memory. */
export async function deleteMemoryUsage(
  ctx: MutationCtx,
  memoryId: string,
): Promise<void> {
  const row = await findUsageRow(ctx, memoryId);
  if (row !== null) await ctx.db.delete(row._id);
  const pending = await ctx.db
    .query("memoryAccessPending")
    .withIndex("by_memory_kind", (q) => q.eq("memoryId", memoryId))
    .collect();
  for (const p of pending) await ctx.db.delete(p._id);
}
