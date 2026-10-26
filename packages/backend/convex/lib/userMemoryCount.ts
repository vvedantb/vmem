import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function getUserMemoryCountRow(
  ctx: QueryCtx,
  userId: string,
): Promise<Doc<"userMemoryCounts"> | null> {
  return await ctx.db
    .query("userMemoryCounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

// Call once per true insert (+1) and once per hard delete (-1).
export async function bumpUserMemoryCount(
  ctx: MutationCtx,
  userId: string,
  delta: number,
): Promise<void> {
  const row = await getUserMemoryCountRow(ctx, userId);
  if (row === null) {
    await ctx.db.insert("userMemoryCounts", {
      userId,
      count: Math.max(0, delta),
    });
    return;
  }
  await ctx.db.patch(row._id, { count: Math.max(0, row.count + delta) });
}
