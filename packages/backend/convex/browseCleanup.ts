import { v } from "convex/values";
import {
  BROWSE_SOURCE,
  browseGateParts,
  browseUrlOf,
  isBrowseSource,
  isLowValueBrowseUrl,
  type BrowseGateParts,
} from "../engine/memory/browseGate";
import { computeContentHash } from "../engine/memory/hash";
import { buildSearchableText } from "../engine/memory/searchableText";
import {
  inferTemporalFields,
  toTemporalStoreFields,
} from "../engine/memory/temporal";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { deleteMemory, isLiveDoc } from "./memoryStore/helpers";

// One-off cleanup of browsing-history duplicates that old extension builds
// wrote without an externalId. One page of the user's rows per call, oldest
// first (by_user_created: the fields it orders by never change here, and a
// loser is always older than its keeper, so deletes stay behind the cursor);
// non-browse rows are read but skipped. Call again with continueCursor until
// isDone. Rows are grouped per profile by the browse gate key; a page also
// pulls in rows that already carry the key as sourceId, so dupes split across
// pages merge into the keeper an earlier page keyed. Not caught: a dupe whose
// keeper keeps a different (current extension) sourceId on another page.
// Counts: scanned = rows read, groups = keys with dupes, deleted = dupes
// removed, lowValueCandidates = unpinned low-value rows seen. dryRun (default)
// writes nothing and reports what a real run would do. Safe to rerun.
// Read budget: a real run stops once READ_BUDGET is spent (deleteMemory also
// clears entities, links, embeddings and counters, so each delete is costed at
// DELETE_COST) and returns the cursor it started from with isDone false. The
// next call rereads that page; done work is a no-op there, so runs converge.

const DEFAULT_PAGE = 100;
const MAX_PAGE = 200;
const KEYED_LOOKUP_MAX = 50;
// well under Convex's 4,096 reads per function execution
const READ_BUDGET = 2000;
const DELETE_COST = 50;

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
// keeper under another key (current extension) keeps its text. One direct
// patch: no applyMemoryUpdates, so no entity extraction, usefulness rescore or
// embedding work (all read-heavy). Stat counters track tags/status/createdAt
// only, none of which change here, so trackMemoryChange is not needed.
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
  const rewrite =
    ownsKey && (keeper.title !== gate.title || keeper.content !== gate.content);
  if (losers.length === 0 && keeper.sourceId !== undefined && !rewrite) return;
  await ctx.db.patch(keeper._id, {
    visitCount: members.reduce((sum, doc) => sum + doc.visitCount, 0),
    firstVisitAt: Math.min(...members.map((doc) => doc.firstVisitAt)),
    lastVisitAt: Math.max(...members.map((doc) => doc.lastVisitAt)),
    ...(keeper.sourceId === undefined ? { sourceId: gate.key } : {}),
    ...(rewrite
      ? {
          title: gate.title,
          content: gate.content,
          contentHash: computeContentHash(gate.title, gate.content),
          searchableText: buildSearchableText(
            gate.title,
            gate.content,
            keeper.tags,
          ),
          ...toTemporalStoreFields(
            inferTemporalFields(
              gate.title,
              gate.content,
              keeper.createdAt,
              keeper.type,
            ),
          ),
        }
      : {}),
  });
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
    deleted: v.number(),
    lowValueCandidates: v.number(),
    lowValueDeleted: v.number(),
    isDone: v.boolean(),
    // null = start from the beginning (a stopped first call)
    continueCursor: v.union(v.string(), v.null()),
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
      deleted: 0,
      lowValueCandidates: 0,
      lowValueDeleted: 0,
    };
    let spent = page.page.length;
    let worked = false;
    // deletes that fit the budget; at least one per call so runs progress
    const deleteRoom = (): number =>
      dryRun
        ? Number.POSITIVE_INFINITY
        : Math.max(
            worked ? 0 : 1,
            Math.floor((READ_BUDGET - spent) / DELETE_COST),
          );
    const stopped = () => ({
      ...counts,
      isDone: false,
      continueCursor: args.cursor ?? null,
    });

    const buckets = new Map<string, BrowseRow[]>();
    for (const doc of page.page) {
      if (!isBrowseSource(doc) || !isLiveDoc(doc, now)) continue;
      const url = browseUrlOf(doc);
      if (!url) continue;
      if (isLowValueBrowseUrl(url) && doc.status !== "pinned") {
        counts.lowValueCandidates += 1;
      }
      if (args.deleteLowValue === true && isLowValueBrowseUrl(url)) {
        if (doc.status === "pinned") continue;
        if (deleteRoom() < 1) return stopped();
        counts.lowValueDeleted += 1;
        if (!dryRun) {
          await deleteMemory(ctx, doc.userId, doc.memoryId);
          spent += DELETE_COST;
          worked = true;
        }
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
      if (!dryRun && worked && spent >= READ_BUDGET) return stopped();
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
      spent += keyed.length + 1;
      for (const doc of keyed) members.set(doc._id, doc);
      for (const id of removed) members.delete(id);
      const group = splitGroup([...members.values()]);
      if (!group) continue;
      // a group too big for the budget merges in part; the rest next call
      const losers = group.losers.slice(0, deleteRoom());
      if (losers.length === 0 && group.losers.length > 0) return stopped();
      if (losers.length > 0) {
        counts.groups += 1;
        counts.deleted += losers.length;
      }
      for (const loser of losers) removed.add(loser._id);
      if (dryRun) continue;
      await patchKeeper(ctx, group.keeper._id, losers, gate);
      for (const loser of losers) {
        await deleteMemory(ctx, loser.userId, loser.memoryId);
      }
      spent += 2 + losers.length * DELETE_COST;
      worked = true;
      if (losers.length < group.losers.length) return stopped();
    }

    return {
      ...counts,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
