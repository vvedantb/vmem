// One-off operator drain for the deprecated wiki tables. PR A of the table
// drop: keep wikiNodes / wikiNodeVersions in the schema, delete the rows so
// a later schema PR can remove the tables without Convex validation failing.
//
// Internal only. Prod still holds ~14 wikiNodes (0 versions). One call drains
// the tables in batches of 100; `done` is true when both remaining counts are
// 0. Safe when already empty. Re-run if a later write lands.
//
// Dry run (no writes):
//   cd packages/backend && CONVEX_DEPLOYMENT=prod:clear-bear-690 \
//     npx convex run internal.wikiCleanup:deleteAllWikiRows '{"dryRun":true}' --pretty
//
// Delete (repeat until done):
//   cd packages/backend && CONVEX_DEPLOYMENT=prod:clear-bear-690 \
//     npx convex run internal.wikiCleanup:deleteAllWikiRows --pretty
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";

const BATCH = 100;

type WikiTable = "wikiNodes" | "wikiNodeVersions";

async function countRows(
  ctx: MutationCtx,
  table: WikiTable,
): Promise<number> {
  let n = 0;
  let after = -1;
  for (;;) {
    const batch = await ctx.db
      .query(table)
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", after))
      .take(BATCH);
    n += batch.length;
    const last = batch[batch.length - 1];
    if (batch.length < BATCH || last === undefined) return n;
    after = last._creationTime;
  }
}

async function deleteRows(ctx: MutationCtx, table: WikiTable): Promise<number> {
  let deleted = 0;
  for (;;) {
    const batch = await ctx.db.query(table).take(BATCH);
    if (batch.length === 0) return deleted;
    for (const row of batch) {
      await ctx.db.delete(row._id);
    }
    deleted += batch.length;
    if (batch.length < BATCH) return deleted;
  }
}

export const deleteAllWikiRows = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({
    dryRun: v.boolean(),
    wikiNodesDeleted: v.number(),
    wikiNodeVersionsDeleted: v.number(),
    wikiNodesRemaining: v.number(),
    wikiNodeVersionsRemaining: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    if (dryRun) {
      const wikiNodesRemaining = await countRows(ctx, "wikiNodes");
      const wikiNodeVersionsRemaining = await countRows(
        ctx,
        "wikiNodeVersions",
      );
      return {
        dryRun: true,
        wikiNodesDeleted: 0,
        wikiNodeVersionsDeleted: 0,
        wikiNodesRemaining,
        wikiNodeVersionsRemaining,
        done: wikiNodesRemaining === 0 && wikiNodeVersionsRemaining === 0,
      };
    }

    // Versions first so a stop mid-run does not leave version rows on deleted nodes.
    const wikiNodeVersionsDeleted = await deleteRows(ctx, "wikiNodeVersions");
    const wikiNodesDeleted = await deleteRows(ctx, "wikiNodes");
    const wikiNodesRemaining = await countRows(ctx, "wikiNodes");
    const wikiNodeVersionsRemaining = await countRows(ctx, "wikiNodeVersions");
    return {
      dryRun: false,
      wikiNodesDeleted,
      wikiNodeVersionsDeleted,
      wikiNodesRemaining,
      wikiNodeVersionsRemaining,
      done: wikiNodesRemaining === 0 && wikiNodeVersionsRemaining === 0,
    };
  },
});
