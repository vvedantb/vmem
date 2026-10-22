import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import {
  DREAM_UNDO_WINDOW_MS,
  mergeKeeperPatch,
  mergeLoserPatch,
  resolvePinnedKeeper,
  restorePatch,
  snapshotRow,
} from "../engine/memory/dream/merge";
import {
  isVisibleStatus,
  memoryMatchesScope,
  type MemoryReadScope,
} from "../engine/memory/scope";
import { buildSearchableText } from "../engine/memory/searchableText";
import { UPDATES_LINK_REASON } from "../engine/memory/supersede";
import { internal } from "./_generated/api";
import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { authMutation, authQuery } from "./auth";
import { linkMemories, sameTags } from "./memoryStore/helpers";
import { trackMemoryChange } from "./memoryStore/stats";
import { dreamActionFields, dreamRunFields } from "./validators";

// dreaming log: merge with a before-snapshot, undo inside 30 days, purge the
// log 90 days after that. Memories are never hard-deleted here.

const RETENTION_AFTER_UNDO_MS = 90 * 24 * 60 * 60 * 1000;
const PURGE_BATCH = 500;
const UNDO_RUN_BATCH = 50;
const LIST_RUNS_TAKE = 20;

const runRowValidator = v.object({
  _id: v.id("dreamRuns"),
  _creationTime: v.number(),
  ...dreamRunFields,
});

const actionRowValidator = v.object({
  _id: v.id("dreamActions"),
  _creationTime: v.number(),
  ...dreamActionFields,
});

// personal runs see the owner's rows (and legacy rows with no profile), team
// runs every row of the shared profile
async function runScope(
  ctx: MutationCtx,
  run: Doc<"dreamRuns">,
): Promise<MemoryReadScope> {
  const profile = run.profileId ? await ctx.db.get(run.profileId) : null;
  if (run.profileId && profile?.teamId) {
    return { kind: "team", profileId: run.profileId };
  }
  const user = await ctx.db.get(run.userId);
  if (!user?.clerkId) throw new Error("Dream run user not found");
  return { kind: "personal", userId: user.clerkId, profileId: run.profileId };
}

async function loadInScope(
  ctx: MutationCtx,
  scope: MemoryReadScope,
  id: Id<"memories">,
): Promise<Doc<"memories">> {
  const doc = await ctx.db.get(id);
  if (!doc || !memoryMatchesScope(doc, scope)) {
    throw new Error("Memory not in dream run scope");
  }
  return doc;
}

// the UPDATES link loser -> keeper, as supersedeMemories adds it. Returns the
// row id only when this call inserted it.
async function addUpdatesLink(
  ctx: MutationCtx,
  loser: Doc<"memories">,
  keeper: Doc<"memories">,
): Promise<Id<"memoryLinks"> | null> {
  const [sourceId, targetId] =
    loser.memoryId < keeper.memoryId
      ? [loser.memoryId, keeper.memoryId]
      : [keeper.memoryId, loser.memoryId];
  const findLink = () =>
    ctx.db
      .query("memoryLinks")
      .withIndex("by_source_target", (q) =>
        q.eq("sourceId", sourceId).eq("targetId", targetId),
      )
      .first();
  if (await findLink()) return null;
  await linkMemories(ctx, {
    userId: loser.userId,
    profileId: loser.profileId ?? keeper.profileId,
    memoryIdA: loser.memoryId,
    memoryIdB: keeper.memoryId,
    reason: UPDATES_LINK_REASON,
  });
  return (await findLink())?._id ?? null;
}

// copies each entity mention the keeper lacks from the losers
async function copyMentions(
  ctx: MutationCtx,
  keeper: Doc<"memories">,
  losers: readonly Doc<"memories">[],
  now: number,
): Promise<Id<"memoryEntityMentions">[]> {
  const mentionsOf = (memoryId: string) =>
    ctx.db
      .query("memoryEntityMentions")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .collect();
  const have = new Set(
    (await mentionsOf(keeper.memoryId)).map((row) => row.entityId),
  );
  const created: Id<"memoryEntityMentions">[] = [];
  for (const loser of losers) {
    for (const mention of await mentionsOf(loser.memoryId)) {
      if (have.has(mention.entityId)) continue;
      have.add(mention.entityId);
      created.push(
        await ctx.db.insert("memoryEntityMentions", {
          userId: keeper.userId,
          ...(keeper.profileId === undefined
            ? {}
            : { profileId: keeper.profileId }),
          memoryId: keeper.memoryId,
          entityId: mention.entityId,
          normalizedName: mention.normalizedName,
          createdAt: now,
        }),
      );
    }
  }
  return created;
}

// patches a row and keeps searchableText and the tag counters in step
async function patchDreamFields(
  ctx: MutationCtx,
  doc: Doc<"memories">,
  patch: Partial<WithoutSystemFields<Doc<"memories">>>,
): Promise<void> {
  const tags = patch.tags;
  const tagsChanged = tags !== undefined && !sameTags(doc.tags, tags);
  await ctx.db.patch(doc._id, {
    ...patch,
    ...(tagsChanged
      ? { searchableText: buildSearchableText(doc.title, doc.content, tags) }
      : {}),
  });
  if (!tagsChanged) return;
  const updated = await ctx.db.get(doc._id);
  await trackMemoryChange(ctx, doc, updated);
}

/**
 * Merges losers into the keeper and logs one undoable action. A pinned row is
 * never suppressed: a pinned loser becomes the keeper, two pinned rows skip
 * the group. Rows that are not active or pinned are left out. Returns null
 * when nothing was merged.
 */
export const applyMerge = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    keeperId: v.id("memories"),
    loserIds: v.array(v.id("memories")),
    reason: v.string(),
    // browse key / external id written to the keeper's sourceId
    sourceKey: v.optional(v.string()),
    ai: dreamActionFields.ai,
  },
  returns: v.union(v.id("dreamActions"), v.null()),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Dream run not found");
    const scope = await runScope(ctx, run);
    const chosen = await loadInScope(ctx, scope, args.keeperId);
    if (!isVisibleStatus(chosen.status)) return null;
    const losers: Doc<"memories">[] = [];
    for (const id of new Set(args.loserIds)) {
      if (id === chosen._id) continue;
      const doc = await loadInScope(ctx, scope, id);
      if (isVisibleStatus(doc.status)) losers.push(doc);
    }
    if (losers.length === 0) return null;
    const group = resolvePinnedKeeper(chosen, losers);
    if (!group) return null;
    const { keeper, losers: groupLosers } = group;

    const now = Date.now();
    const before = [keeper, ...groupLosers].map((doc) => snapshotRow(doc));
    await patchDreamFields(
      ctx,
      keeper,
      mergeKeeperPatch(keeper, groupLosers, args.sourceKey),
    );
    const linkIds: Id<"memoryLinks">[] = [];
    for (const loser of groupLosers) {
      await ctx.db.patch(
        loser._id,
        mergeLoserPatch(
          keeper._id,
          run._id,
          args.ai === undefined ? "dream" : "dream-ai",
        ),
      );
      const linkId = await addUpdatesLink(ctx, loser, keeper);
      if (linkId) linkIds.push(linkId);
    }
    const mentionIds = await copyMentions(ctx, keeper, groupLosers, now);
    return await ctx.db.insert("dreamActions", {
      runId: run._id,
      userId: run.userId,
      ...(run.profileId === undefined ? {} : { profileId: run.profileId }),
      kind: "merge",
      keeperId: keeper._id,
      memoryIds: groupLosers.map((doc) => doc._id),
      before,
      created: { linkIds, mentionIds },
      reason: args.reason,
      ...(args.ai === undefined ? {} : { ai: args.ai }),
      undoExpiresAt: now + DREAM_UNDO_WINDOW_MS,
      createdAt: now,
    });
  },
});

// writes every snapshot back and removes the link and mention rows the action
// added. Throws once undone or after the window.
async function undoOne(
  ctx: MutationCtx,
  action: Doc<"dreamActions">,
  now: number,
): Promise<void> {
  if (action.undoneAt !== undefined) throw new Error("Already undone");
  if (now > action.undoExpiresAt) throw new Error("Undo window has passed");
  for (const snapshot of action.before) {
    const doc = await ctx.db.get(snapshot.memoryId);
    if (doc) await patchDreamFields(ctx, doc, restorePatch(snapshot));
  }
  for (const id of [...action.created.linkIds, ...action.created.mentionIds]) {
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  }
  await ctx.db.patch(action._id, { undoneAt: now });
}

async function undoActionById(
  ctx: MutationCtx,
  actionId: Id<"dreamActions">,
  userId?: Id<"users">,
): Promise<void> {
  const action = await ctx.db.get(actionId);
  if (!action || (userId !== undefined && action.userId !== userId)) {
    throw new Error("Dream action not found");
  }
  await undoOne(ctx, action, Date.now());
}

// newest first, so a row changed by two actions ends on the oldest snapshot.
// Undoes one batch and schedules the rest.
async function undoRunBatch(
  ctx: MutationCtx,
  runId: Id<"dreamRuns">,
  userId?: Id<"users">,
): Promise<number> {
  const run = await ctx.db.get(runId);
  if (!run || (userId !== undefined && run.userId !== userId)) {
    throw new Error("Dream run not found");
  }
  const actions = await ctx.db
    .query("dreamActions")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .order("desc")
    .filter((q) => q.eq(q.field("undoneAt"), undefined))
    .take(UNDO_RUN_BATCH);
  const now = Date.now();
  for (const action of actions) await undoOne(ctx, action, now);
  if (actions.length === UNDO_RUN_BATCH) {
    await ctx.scheduler.runAfter(0, internal.dream.undoRunInternal, { runId });
  }
  return actions.length;
}

export const undoActionInternal = internalMutation({
  args: { actionId: v.id("dreamActions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await undoActionById(ctx, args.actionId);
    return null;
  },
});

export const undoRunInternal = internalMutation({
  args: { runId: v.id("dreamRuns") },
  returns: v.number(),
  handler: async (ctx, args) => await undoRunBatch(ctx, args.runId),
});

export const undoAction = authMutation({
  args: { actionId: v.id("dreamActions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await undoActionById(ctx, args.actionId, ctx.userId);
    return null;
  },
});

// undoes the first batch now; the rest runs in the background
export const undoRun = authMutation({
  args: { runId: v.id("dreamRuns") },
  returns: v.number(),
  handler: async (ctx, args) => await undoRunBatch(ctx, args.runId, ctx.userId),
});

export const listRuns = authQuery({
  args: {},
  returns: v.array(runRowValidator),
  handler: async (ctx) =>
    await ctx.db
      .query("dreamRuns")
      .withIndex("by_user_started", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(LIST_RUNS_TAKE),
});

export const listActions = authQuery({
  args: {
    runId: v.id("dreamRuns"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(actionRowValidator),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.userId !== ctx.userId) {
      throw new Error("Dream run not found");
    }
    return await ctx.db
      .query("dreamActions")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .paginate(args.paginationOpts);
  },
});

// hourly: drops log rows 90 days after their undo window closed
export const purgeExpiredActions = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_AFTER_UNDO_MS;
    const rows = await ctx.db
      .query("dreamActions")
      .withIndex("by_undo_expires", (q) => q.lt("undoExpiresAt", cutoff))
      .take(PURGE_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.dream.purgeExpiredActions, {});
    }
    return rows.length;
  },
});
