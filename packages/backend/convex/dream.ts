import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v, type Infer, type ObjectType } from "convex/values";
import {
  DREAM_UNDO_WINDOW_MS,
  mergeKeeperPatch,
  mergeLoserPatch,
  resolvePinnedKeeper,
  restorePatch,
  snapshotRow,
} from "../engine/memory/dream/merge";
import { startOfUtcDay } from "../engine/memory/dream/nightly";
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
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { authMutation, authQuery } from "./auth";
import { deleteMemory, linkMemories, sameTags } from "./memoryStore/helpers";
import {
  hasOverlappingPendingProposal,
  insertProposedUpdate,
} from "./proposedUpdateStore";
import { trackMemoryChange } from "./memoryStore/stats";
import { dreamActionFields, dreamRunFields } from "./validators";

// dreaming log: merge with a before-snapshot, undo inside 30 days, purge the
// log 90 days after that. Duplicates a merge hid ("dream" or "dream-ai") are
// deleted once their undo window has passed.

const RETENTION_AFTER_UNDO_MS = 90 * 24 * 60 * 60 * 1000;
const PURGE_BATCH = 500;
const SWEEP_BATCH = 100;
const UNDO_RUN_BATCH = 50;
const LIST_RUNS_TAKE = 20;
const HISTORY_TAKE = 10;
const MERGED_FROM_ACTIONS = 20;
const MERGED_FROM_ROWS = 100;

const runRowValidator = v.object({
  _id: v.id("dreamRuns"),
  _creationTime: v.number(),
  ...dreamRunFields,
});

// keeperTitle: the Dreaming page names each action by the row it kept (the
// first row for archive / expire)
const actionRowValidator = v.object({
  _id: v.id("dreamActions"),
  _creationTime: v.number(),
  ...dreamActionFields,
  keeperTitle: v.union(v.string(), v.null()),
});

// personal runs see the owner's rows (and legacy rows with no profile), team
// runs every row of the shared profile
export async function runScope(
  ctx: QueryCtx,
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

// today's (UTC) dream AI spend, all users: the daily budget guard of the
// nightly AI steps and the one-off cleanup
export async function dreamSpentTodayUsd(ctx: QueryCtx): Promise<number> {
  const logs = await ctx.db
    .query("openRouterLogs")
    .withIndex("by_feature_createdAt", (q) =>
      q.eq("feature", "dream").gte("createdAt", startOfUtcDay(Date.now())),
    )
    .collect();
  return logs.reduce((sum, log) => sum + (log.costUsd ?? 0), 0);
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

// patches a row and keeps searchableText and the stat counters (tags and
// visibility) in step
export async function patchDreamFields(
  ctx: MutationCtx,
  doc: Doc<"memories">,
  patch: Partial<WithoutSystemFields<Doc<"memories">>>,
): Promise<void> {
  const tags = patch.tags;
  const tagsChanged = tags !== undefined && !sameTags(doc.tags, tags);
  const statusChanged =
    patch.status !== undefined && patch.status !== doc.status;
  await ctx.db.patch(doc._id, {
    ...patch,
    ...(tagsChanged
      ? { searchableText: buildSearchableText(doc.title, doc.content, tags) }
      : {}),
  });
  if (!tagsChanged && !statusChanged) return;
  const updated = await ctx.db.get(doc._id);
  await trackMemoryChange(ctx, doc, updated);
}

const mergeArgs = {
  runId: v.id("dreamRuns"),
  keeperId: v.id("memories"),
  loserIds: v.array(v.id("memories")),
  reason: v.string(),
  // browse key / external id written to the keeper's sourceId
  sourceKey: v.optional(v.string()),
  ai: dreamActionFields.ai,
};

/**
 * Merges losers into the keeper and logs one undoable action. A pinned row is
 * never suppressed: a pinned loser becomes the keeper, two pinned rows skip
 * the group. Rows that are not active or pinned are left out. Returns null
 * when nothing was merged.
 */
export async function mergeGroup(
  ctx: MutationCtx,
  args: ObjectType<typeof mergeArgs>,
): Promise<Id<"dreamActions"> | null> {
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
    await patchDreamFields(
      ctx,
      loser,
      mergeLoserPatch(
        keeper._id,
        run._id,
        args.ai === undefined ? "dream" : "dream-ai",
        now,
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
}

/**
 * An AI-judged update: the older row is suppressed (suppressedBy "dream-ai",
 * mergedInto the newer row) and linked to it, with undo. The newer row is not
 * changed. Returns null when the older row is pinned or no longer active, or
 * the newer one is hidden.
 */
export async function supersedeRow(
  ctx: MutationCtx,
  args: {
    runId: Id<"dreamRuns">;
    keeperId: Id<"memories">;
    olderId: Id<"memories">;
    reason: string;
    ai: NonNullable<ObjectType<typeof mergeArgs>["ai"]>;
  },
): Promise<Id<"dreamActions"> | null> {
  const run = await ctx.db.get(args.runId);
  if (!run) throw new Error("Dream run not found");
  const scope = await runScope(ctx, run);
  const keeper = await loadInScope(ctx, scope, args.keeperId);
  const older = await loadInScope(ctx, scope, args.olderId);
  if (
    keeper._id === older._id ||
    !isVisibleStatus(keeper.status) ||
    older.status !== "active"
  ) {
    return null;
  }
  const now = Date.now();
  const before = [snapshotRow(older)];
  await patchDreamFields(
    ctx,
    older,
    mergeLoserPatch(keeper._id, run._id, "dream-ai", now),
  );
  const linkId = await addUpdatesLink(ctx, older, keeper);
  return await ctx.db.insert("dreamActions", {
    runId: run._id,
    userId: run.userId,
    ...(run.profileId === undefined ? {} : { profileId: run.profileId }),
    kind: "supersede",
    keeperId: keeper._id,
    memoryIds: [older._id],
    before,
    created: { linkIds: linkId ? [linkId] : [], mentionIds: [] },
    reason: args.reason,
    ai: args.ai,
    undoExpiresAt: now + DREAM_UNDO_WINDOW_MS,
    createdAt: now,
  });
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Inbox proposal for an AI-judged pair or group, skipped (false) when a
 * pending proposal already covers one of the rows. "merge": keep `keeper`,
 * hide `others`. "update": `others[0]` is the older row the newer `keeper`
 * replaces. Approving either runs under `runId` with undo. "contradiction":
 * the user keeps one row in the inbox (no dream run).
 */
export async function proposeDreamChange(
  ctx: MutationCtx,
  args: {
    clerkId: string;
    profileId: string;
    runId: Id<"dreamRuns">;
    kind: "merge" | "update" | "contradiction";
    keeper: Doc<"memories">;
    others: readonly Doc<"memories">[];
    reason: string;
    confidence?: number;
  },
): Promise<boolean> {
  const { keeper, others } = args;
  const older = others[0];
  const docs = [keeper, ...others];
  const sourceMemoryIds = docs.map((doc) => doc.memoryId);
  if (
    older === undefined ||
    (await hasOverlappingPendingProposal(ctx, {
      userId: args.clerkId,
      profileId: args.profileId,
      sourceMemoryIds,
    }))
  ) {
    return false;
  }
  const target = args.kind === "update" ? older : keeper;
  const reason =
    args.kind === "merge"
      ? `${args.reason}. Keeps this memory and hides ${plural(others.length, "duplicate")} (undo for 30 days).`
      : args.kind === "update"
        ? `${args.reason}. Hides the older memory in favour of the newer one (undo for 30 days).`
        : args.reason;
  await insertProposedUpdate(ctx, {
    userId: args.clerkId,
    profileId: args.profileId,
    memoryId: target.memoryId,
    proposedTitle: keeper.title,
    proposedContent: keeper.content,
    reason,
    kind: args.kind,
    sourceMemoryIds:
      args.kind === "update"
        ? [older.memoryId, keeper.memoryId]
        : sourceMemoryIds,
    ...(args.confidence === undefined ? {} : { confidence: args.confidence }),
    source: "dream-mode",
    memorySnapshot: { title: target.title, content: target.content },
    sourceMemorySnapshots: docs.map((doc) => ({
      id: doc.memoryId,
      title: doc.title,
      content: doc.content,
    })),
    ...(args.kind === "contradiction" ? {} : { dreamRunId: args.runId }),
  });
  return true;
}

/**
 * Inbox proposal for a skill Dream drafted (see skillDraft.ts). Nothing is
 * published: approving creates the skill (proposedUpdateApi), rejecting
 * drops it. `memoryId` is the newest source; the sources are not changed.
 */
export async function proposeDreamSkill(
  ctx: MutationCtx,
  args: {
    clerkId: string;
    profileId: string;
    runId: Id<"dreamRuns">;
    skill: { name: string; description: string; instructions: string };
    sources: readonly Doc<"memories">[];
  },
): Promise<boolean> {
  const [newest] = [...args.sources].sort((a, b) => b.createdAt - a.createdAt);
  if (newest === undefined) return false;
  await insertProposedUpdate(ctx, {
    userId: args.clerkId,
    profileId: args.profileId,
    memoryId: newest.memoryId,
    proposedTitle: args.skill.name,
    proposedContent: args.skill.instructions,
    reason: `Drafted from ${String(args.sources.length)} ${args.sources.length === 1 ? "memory" : "memories"} that record what worked (and what failed). Not active until you approve it.`,
    kind: "skill",
    skill: args.skill,
    sourceMemoryIds: args.sources.map((doc) => doc.memoryId),
    source: "dream-mode",
    sourceMemorySnapshots: args.sources.map((doc) => ({
      id: doc.memoryId,
      title: doc.title,
      content: doc.content,
    })),
    dreamRunId: args.runId,
  });
  return true;
}

export const applyMerge = internalMutation({
  args: mergeArgs,
  returns: v.union(v.id("dreamActions"), v.null()),
  handler: async (ctx, args) => await mergeGroup(ctx, args),
});

const UNDO_ROWS_GONE =
  "This dream action can no longer be undone: the hidden memories were permanently deleted after the 30-day undo window.";

// undo writes the hidden rows back, so it refuses (and changes nothing) once
// one of them was deleted
async function assertHiddenRowsExist(
  ctx: MutationCtx,
  action: Doc<"dreamActions">,
): Promise<void> {
  for (const id of action.memoryIds) {
    if ((await ctx.db.get(id)) === null) throw new ConvexError(UNDO_ROWS_GONE);
  }
}

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
  await assertHiddenRowsExist(ctx, action);
  await undoOne(ctx, action, Date.now());
}

function openActionsOfRun(ctx: MutationCtx, runId: Id<"dreamRuns">) {
  return ctx.db
    .query("dreamActions")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .order("desc")
    .filter((q) => q.eq(q.field("undoneAt"), undefined));
}

// newest first, so a row changed by two actions ends on the oldest snapshot.
// The first call checks every open action of the run before it changes
// anything; it undoes one batch and schedules the rest.
async function undoRunBatch(
  ctx: MutationCtx,
  runId: Id<"dreamRuns">,
  options: { userId?: Id<"users">; checked?: boolean },
): Promise<number> {
  const run = await ctx.db.get(runId);
  if (!run || (options.userId !== undefined && run.userId !== options.userId)) {
    throw new Error("Dream run not found");
  }
  if (options.checked !== true) {
    for await (const action of openActionsOfRun(ctx, runId)) {
      await assertHiddenRowsExist(ctx, action);
    }
  }
  const actions = await openActionsOfRun(ctx, runId).take(UNDO_RUN_BATCH);
  const now = Date.now();
  for (const action of actions) await undoOne(ctx, action, now);
  if (actions.length === UNDO_RUN_BATCH) {
    await ctx.scheduler.runAfter(0, internal.dream.undoRunInternal, {
      runId,
      checked: true,
    });
  }
  return actions.length;
}

export const failRunInternal = internalMutation({
  args: { runId: v.id("dreamRuns"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
      finishedAt: Date.now(),
    });
    return null;
  },
});

export const undoActionInternal = internalMutation({
  args: { actionId: v.id("dreamActions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await undoActionById(ctx, args.actionId);
    return null;
  },
});

// checked: the first batch already checked the whole run
export const undoRunInternal = internalMutation({
  args: { runId: v.id("dreamRuns"), checked: v.optional(v.boolean()) },
  returns: v.number(),
  handler: async (ctx, args) =>
    await undoRunBatch(ctx, args.runId, { checked: args.checked }),
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
  handler: async (ctx, args) =>
    await undoRunBatch(ctx, args.runId, { userId: ctx.userId }),
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
    const result = await ctx.db
      .query("dreamActions")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .paginate(args.paginationOpts);
    const page = [];
    for (const action of result.page) {
      const shownId = action.keeperId ?? action.memoryIds[0];
      const shown = shownId ? await ctx.db.get(shownId) : null;
      page.push({ ...action, keeperTitle: shown?.title ?? null });
    }
    return { ...result, page };
  },
});

// memories list moon icon: rows created after this wait for the next run.
// Successful = a finished non-dry run ("ok" or "partial") of this profile.
export const lastSuccessfulRunAt = authQuery({
  args: { profileId: v.id("profiles") },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("dreamRuns")
      .withIndex("by_user_started", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .filter((q) =>
        q.and(
          q.eq(q.field("profileId"), args.profileId),
          q.eq(q.field("dryRun"), false),
          q.or(
            q.eq(q.field("status"), "ok"),
            q.eq(q.field("status"), "partial"),
          ),
        ),
      )
      .first();
    return run?.finishedAt ?? null;
  },
});

const mergedFromValidator = v.object({
  // rows hidden into this memory by actions not yet undone
  total: v.number(),
  groups: v.array(
    v.object({
      actionId: v.id("dreamActions"),
      kind: dreamActionFields.kind,
      createdAt: v.number(),
      undoExpiresAt: v.number(),
      rows: v.array(v.object({ id: v.string(), title: v.string() })),
    }),
  ),
});

/**
 * Memory detail "Merged from N memories": the caller's open dream actions
 * that kept this memory, newest first, each with the rows it still hides
 * (mergedInto = this). At most 100 rows are listed; `total` counts them all.
 */
export const mergedFrom = authQuery({
  args: { memoryId: v.string() },
  returns: mergedFromValidator,
  handler: async (ctx, args) => {
    const keeper = await ctx.db
      .query("memories")
      .withIndex("by_memory_id", (q) => q.eq("memoryId", args.memoryId))
      .first();
    if (!keeper) return { total: 0, groups: [] };
    const actions = await ctx.db
      .query("dreamActions")
      .withIndex("by_keeper", (q) => q.eq("keeperId", keeper._id))
      .order("desc")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), ctx.userId),
          q.eq(q.field("undoneAt"), undefined),
        ),
      )
      .take(MERGED_FROM_ACTIONS);
    let total = 0;
    let budget = MERGED_FROM_ROWS;
    const groups: Infer<typeof mergedFromValidator>["groups"] = [];
    for (const action of actions) {
      total += action.memoryIds.length;
      const rows: { id: string; title: string }[] = [];
      for (const id of action.memoryIds.slice(0, budget)) {
        const doc = await ctx.db.get(id);
        if (doc?.mergedInto === keeper._id) {
          rows.push({ id: doc.memoryId, title: doc.title });
        }
      }
      budget = Math.max(0, budget - action.memoryIds.length);
      groups.push({
        actionId: action._id,
        kind: action.kind,
        createdAt: action.createdAt,
        undoExpiresAt: action.undoExpiresAt,
        rows,
      });
    }
    return { total, groups };
  },
});

const historyRowValidator = v.object({
  runId: v.id("dreamRuns"),
  profileId: v.union(v.id("profiles"), v.null()),
  trigger: dreamRunFields.trigger,
  dryRun: v.boolean(),
  status: dreamRunFields.status,
  startedAt: v.string(),
  finishedAt: v.union(v.string(), v.null()),
  counts: dreamRunFields.counts,
  aiCalls: v.number(),
  costUsd: v.number(),
});

// MCP dream_history: the last 10 runs, counts only (no titles or samples)
export const historyInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(historyRowValidator),
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("dreamRuns")
      .withIndex("by_user_started", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(HISTORY_TAKE);
    return runs.map((run) => ({
      runId: run._id,
      profileId: run.profileId ?? null,
      trigger: run.trigger,
      dryRun: run.dryRun,
      status: run.status,
      startedAt: new Date(run.startedAt).toISOString(),
      finishedAt:
        run.finishedAt === undefined
          ? null
          : new Date(run.finishedAt).toISOString(),
      counts: run.counts,
      aiCalls: run.aiCalls,
      costUsd: run.costUsd,
    }));
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

// rows hidden before suppressedAt existed use their run's finish time, which
// is never earlier than the merge
async function hiddenBefore(
  ctx: MutationCtx,
  doc: Doc<"memories">,
  cutoff: number,
): Promise<boolean> {
  if (doc.suppressedAt !== undefined) return doc.suppressedAt < cutoff;
  const run = doc.suppressedRunId
    ? await ctx.db.get(doc.suppressedRunId)
    : null;
  return run?.finishedAt !== undefined && run.finishedAt < cutoff;
}

// hourly: permanently deletes duplicates a dream merge hid ("dream", then
// "dream-ai") once the 30-day undo window has passed, with their links,
// mentions, embedding, usage and counters. Archived stale rows ("dream-decay")
// are never deleted. 100 rows a batch, then the next page or the next kind.
export const sweepExpiredDuplicates = internalMutation({
  args: {
    suppressedBy: v.optional(
      v.union(v.literal("dream"), v.literal("dream-ai")),
    ),
    cursor: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - DREAM_UNDO_WINDOW_MS;
    const suppressedBy = args.suppressedBy ?? "dream";
    const page = await ctx.db
      .query("memories")
      .withIndex("by_suppressed_by_at", (q) =>
        q.eq("suppressedBy", suppressedBy).lt("suppressedAt", cutoff),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: SWEEP_BATCH });
    let deleted = 0;
    for (const doc of page.page) {
      if (doc.status !== "suppressed") continue;
      if (!(await hiddenBefore(ctx, doc, cutoff))) continue;
      if (await deleteMemory(ctx, doc.userId, doc.memoryId)) deleted += 1;
    }
    // one paginated query per function: the next kind runs as its own call
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.dream.sweepExpiredDuplicates, {
        suppressedBy,
        cursor: page.continueCursor,
      });
    } else if (suppressedBy === "dream") {
      await ctx.scheduler.runAfter(0, internal.dream.sweepExpiredDuplicates, {
        suppressedBy: "dream-ai",
      });
    }
    return deleted;
  },
});
