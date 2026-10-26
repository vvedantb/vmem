import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const COUNT_PAGE = 100;

export async function getUserMemoryCountRow(
  ctx: QueryCtx,
  userId: string,
): Promise<Doc<"userMemoryCounts"> | null> {
  return await ctx.db
    .query("userMemoryCounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function setUserMemoryCount(
  ctx: MutationCtx,
  userId: string,
  count: number,
): Promise<void> {
  const next = Math.max(0, count);
  const row = await getUserMemoryCountRow(ctx, userId);
  if (row === null) {
    await ctx.db.insert("userMemoryCounts", { userId, count: next });
    return;
  }
  await ctx.db.patch(row._id, { count: next });
}

// Walks `by_user_created` in pages. Used only to create a missing counter row
// (backfill gap or first touch). Steady-state cap checks never call this.
export async function countUserMemories(
  ctx: MutationCtx,
  userId: string,
): Promise<number> {
  let total = 0;
  let cursor: string | null = null;
  for (;;) {
    const page = await ctx.db
      .query("memories")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .paginate({ cursor, numItems: COUNT_PAGE });
    total += page.page.length;
    if (page.isDone) return total;
    cursor = page.continueCursor;
  }
}

// Call once per true insert (+1) and once per hard delete (-1).
export async function bumpUserMemoryCount(
  ctx: MutationCtx,
  userId: string,
  delta: number,
): Promise<void> {
  const row = await getUserMemoryCountRow(ctx, userId);
  if (row === null) {
    // Never stamp `count: delta` over an unscanned table (pre-backfill gap).
    await setUserMemoryCount(ctx, userId, await countUserMemories(ctx, userId));
    return;
  }
  await ctx.db.patch(row._id, { count: Math.max(0, row.count + delta) });
}
