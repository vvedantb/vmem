import { v } from "convex/values";
import {
  BROWSE_SOURCE,
  browseGateParts,
  browseUrlOf,
  isBrowseSource,
  isLowValueBrowseUrl,
  type BrowseGateParts,
} from "../engine/memory/browseGate";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
  applyMemoryUpdates,
  deleteMemory,
  isLiveDoc,
} from "./memoryStore/helpers";

// One-off cleanup of browsing-history duplicates that old extension builds
// wrote without an externalId. One page of the user's rows per call, oldest
// first (by_user_created: the fields it orders by never change here, and a
// loser is always older than its keeper, so deletes stay behind the cursor);
// non-browse rows are read but skipped. Call again with continueCursor until
// isDone. Rows are grouped per profile by the browse gate key; a page also
// pulls in rows that already carry the key as sourceId, so dupes split across
// pages merge into the keeper an earlier page keyed. Not caught: a dupe whose
// keeper keeps a different (current extension) sourceId on another page.
// Counts: scanned = rows read, groups = distinct keys seen, merged = groups
// that had dupes. dryRun (default) writes nothing and reports what a real run
// would do. Safe to rerun.

const DEFAULT_PAGE = 200;
const MAX_PAGE = 500;
const KEYED_LOOKUP_MAX = 50;

type MemoryDoc = Doc<"memories">;

interface BrowseRow {
  doc: MemoryDoc;
  gate: BrowseGateParts;
}

function newestFirst(a: MemoryDoc, b: MemoryDoc): number {
  return b.createdAt - a.createdAt || b._creationTime - a._creationTime;
}

// newest pinned row, else the newest row; other pinned rows are never removed
function splitGroup(
  members: MemoryDoc[],
): { keeper: MemoryDoc; losers: MemoryDoc[] } | null {
  const sorted = [...members].sort(newestFirst);
  const keeper = sorted.find((doc) => doc.status === "pinned") ?? sorted[0];
  if (!keeper) return null;
  const losers = sorted.filter(
    (doc) => doc !== keeper && doc.status !== "pinned",
  );
  return { keeper, losers };
}

// live rows in the same profile that already carry the key as sourceId
async function keyedRows(
  ctx: MutationCtx,
  userId: string,
  profileId: string | undefined,
  key: string,
  now: number,
): Promise<MemoryDoc[]> {
  const rows = await ctx.db
    .query("memories")
    .withIndex("by_user_source", (q) =>
      q
        .eq("userId", userId)
        .eq("sourceType", BROWSE_SOURCE)
        .eq("sourceId", key),
    )
    .take(KEYED_LOOKUP_MAX);
  return rows.filter(
    (doc) => doc.profileId === profileId && isLiveDoc(doc, now),
  );
}

// keyless or self-keyed keepers take the key and the stable content; a
// keeper under another key (current extension) keeps its text
async function patchKeeper(
  ctx: MutationCtx,
  keeperId: Id<"memories">,
  losers: MemoryDoc[],
  gate: BrowseGateParts,
): Promise<void> {
  // re-read: an earlier group on this page may have bumped the keeper
  const keeper = await ctx.db.get(keeperId);
  if (!keeper) return;
  const members = [keeper, ...losers];
  const ownsKey = keeper.sourceId === undefined || keeper.sourceId === gate.key;
  if (losers.length > 0 || keeper.sourceId === undefined) {
    await ctx.db.patch(keeper._id, {
      visitCount: members.reduce((sum, doc) => sum + doc.visitCount, 0),
      firstVisitAt: Math.min(...members.map((doc) => doc.firstVisitAt)),
      lastVisitAt: Math.max(...members.map((doc) => doc.lastVisitAt)),
      ...(keeper.sourceId === undefined ? { sourceId: gate.key } : {}),
    });
  }
  if (
    ownsKey &&
    (keeper.title !== gate.title || keeper.content !== gate.content)
  ) {
    const fresh = await ctx.db.get(keeper._id);
    if (fresh) {
      await applyMemoryUpdates(ctx, fresh, {
        title: gate.title,
        content: gate.content,
        skipEditCount: true,
      });
    }
  }
}

export const mergeBrowseDuplicates = internalMutation({
  args: {
    // Clerk id, as stored on memories.userId
    userId: v.string(),
    dryRun: v.optional(v.boolean()),
    deleteLowValue: v.optional(v.boolean()),
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    groups: v.number(),
    merged: v.number(),
    deleted: v.number(),
    lowValueDeleted: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const numItems = Math.min(
      Math.max(1, Math.floor(args.numItems ?? DEFAULT_PAGE)),
      MAX_PAGE,
    );
    const page = await ctx.db
      .query("memories")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .paginate({ numItems, cursor: args.cursor ?? null });
    const now = Date.now();
    const counts = {
      scanned: page.page.length,
      groups: 0,
      merged: 0,
      deleted: 0,
      lowValueDeleted: 0,
    };

    const buckets = new Map<string, BrowseRow[]>();
    for (const doc of page.page) {
      if (!isBrowseSource(doc) || !isLiveDoc(doc, now)) continue;
      const url = browseUrlOf(doc);
      if (!url) continue;
      if (args.deleteLowValue === true && isLowValueBrowseUrl(url)) {
        if (doc.status === "pinned") continue;
        counts.lowValueDeleted += 1;
        if (!dryRun) await deleteMemory(ctx, doc.userId, doc.memoryId);
        continue;
      }
      const gate = browseGateParts({ url, title: doc.title });
      const bucketKey = `${doc.profileId ?? ""}\u0000${gate.key}`;
      const bucket = buckets.get(bucketKey);
      if (bucket) bucket.push({ doc, gate });
      else buckets.set(bucketKey, [{ doc, gate }]);
    }

    // a keyed lookup can pull in a row of another bucket on this page
    const removed = new Set<Id<"memories">>();
    for (const bucket of buckets.values()) {
      const first = bucket[0];
      if (!first) continue;
      const { gate } = first;
      const members = new Map(bucket.map((row) => [row.doc._id, row.doc]));
      const keyed = await keyedRows(
        ctx,
        args.userId,
        first.doc.profileId,
        gate.key,
        now,
      );
      for (const doc of keyed) members.set(doc._id, doc);
      for (const id of removed) members.delete(id);
      const group = splitGroup([...members.values()]);
      if (!group) continue;
      counts.groups += 1;
      for (const loser of group.losers) removed.add(loser._id);
      if (group.losers.length > 0) {
        counts.merged += 1;
        counts.deleted += group.losers.length;
      }
      if (dryRun) continue;
      await patchKeeper(ctx, group.keeper._id, group.losers, gate);
      for (const loser of group.losers) {
        await deleteMemory(ctx, loser.userId, loser.memoryId);
      }
    }

    return {
      ...counts,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
