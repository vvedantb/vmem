import { ConvexError, v, type Infer, type ObjectType } from "convex/values";
import {
  judgeDuplicateGroup,
  type JevDuplicateVerdict,
} from "../engine/memory/dream/jevDuplicate";
import {
  aiEligibleRows,
  buildCandidateGroups,
  buildDeterministicGroups,
  deterministicReason,
  deterministicStats,
  entityEdges,
  NEIGHBOUR_MIN_SCORE,
  pickCandidateGroups,
  planTitle,
  PLAN_LOSER_TITLES,
  reusePriorVerdicts,
  SAMPLE_AI_GROUPS,
  SAMPLE_DETERMINISTIC_GROUPS,
  toPlanRow,
  type CandidateEdge,
  type DeterministicGroup,
  type PlanRow,
} from "../engine/memory/dream/plan";
import { planTagMerges } from "../engine/memory/dream/tagConsolidate";
import {
  DREAM_DAILY_BUDGET_USD,
  emptyDreamCounts,
} from "../engine/memory/dream/nightly";
import { SYSTEMONE_DEFAULT_MODEL } from "../engine/llm/systemOneClient";
import { isVisibleStatus } from "../engine/memory/scope";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { authMutation, authQuery, getUserByClerkId } from "./auth";
import { dreamSpentTodayUsd, mergeGroup, proposeDreamChange } from "./dream";
import { userFacingError } from "./lib/userFacingError";
import { resolveSystemOneApiKey } from "./lib/systemOneKey";
import { scheduleLog } from "./lib/openRouter/shared";
import {
  memoryDocIdsForEmbeddings,
  memoryReadScopeFromArgs,
  paginateScopedDocs,
} from "./memoryStore/helpers";
import { collectTagCounts } from "./tagConsolidate";
import { walkPages } from "./memoryStore/walk";
import { dreamSettingsOf, getSettingsDoc } from "./userSettings";
import {
  dreamPlanGroupFields,
  dreamPlanGroupInputFields,
  dreamRunFields,
  memoryStatusValidator,
} from "./validators";

// One-off duplicate cleanup (dreaming plan §3b). planInternal is a dry run:
// it pages the whole profile, buckets rows by exact hash and browse key
// (rules A/B), then finds candidate groups (rule J, vector neighbours / shared
// entity) over every eligible row, 50 embeddings at a time. Jev judges each
// candidate group in scheduled chunks, up to JEV_MAX_CALLS per scan; the scan
// is partial past that. The next scan reuses the verdicts of the last plan
// for groups with the same members, so it continues with the unjudged ones.
// Memories are untouched; the plan lives in dreamPlanGroups. applyInternal
// merges the A/B groups with undo and turns Jev-flagged groups into inbox
// proposals.

const PAGE_SIZE = 200;
// rules A/B hold every slim row (about 0.5 KB) at once in a 64 MiB action
const MAX_PLAN_ROWS = 50_000;
const GROUP_WRITE_CHUNK = 100;
const EMBEDDING_BATCH = 50;
const MENTION_BATCH = 100;
// the row itself plus about four neighbours
const NEIGHBOUR_LIMIT = 5;
// Jev calls per scan, default and ceiling
const JEV_MAX_CALLS = 500;
// earlier cleanup runs of the profile searched for a plan to continue
const PRIOR_PLAN_LOOKBACK = 20;
const PRIOR_GROUP_PAGE = 500;
const JUDGE_CHUNK = 10;
const JUDGE_CONTENT_CHARS = 600;
const APPLY_GROUPS = 100;
const APPLY_ROW_BUDGET = 1_000;
const PLAN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// web "Scan for duplicates": at most one cleanup start per hour
const WEB_DRY_RUN_GAP_MS = 60 * 60 * 1000;
const PURGE_BATCH = 500;
const SAMPLE_TAG_GROUPS = 20;

type MemoryId = Id<"memories">;
type RunId = Id<"dreamRuns">;
type CleanupCounts = NonNullable<Doc<"dreamRuns">["cleanup"]>;
type SampleItem = NonNullable<Doc<"dreamRuns">["sample"]>[number];
type StopReason = NonNullable<CleanupCounts["aiStopReason"]>;

const stopReasonValidator = v.union(
  v.literal("no_key"),
  v.literal("cap"),
  v.literal("budget"),
);

const planRowValidator = v.object({
  _id: v.id("memories"),
  memoryId: v.string(),
  title: v.string(),
  contentLength: v.number(),
  contentHash: v.string(),
  url: v.optional(v.string()),
  source: v.string(),
  sourceType: v.optional(v.string()),
  status: memoryStatusValidator,
  createdAt: v.number(),
});

const pageMetaValidator = {
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(
      v.null(),
      v.literal("SplitRecommended"),
      v.literal("SplitRequired"),
    ),
  ),
};

const planGroupInputValidator = v.object(dreamPlanGroupInputFields);
type PlanGroupInput = Infer<typeof planGroupInputValidator>;

const runRowValidator = v.object({
  _id: v.id("dreamRuns"),
  _creationTime: v.number(),
  ...dreamRunFields,
});

function emptyCleanup(): CleanupCounts {
  return {
    scannedRows: 0,
    exactGroups: 0,
    keyGroups: 0,
    bothGroups: 0,
    groups: 0,
    rowsToSuppress: 0,
    aiCandidates: 0,
    aiNotDuplicate: 0,
    aiErrors: 0,
    aiSkipped: 0,
    aiCostUnknown: 0,
    skippedChanged: 0,
  };
}

function toPlanGroup(group: DeterministicGroup<MemoryId>): PlanGroupInput {
  return {
    tier: "deterministic",
    seq: 0,
    rules: group.rules,
    memberIds: [group.keeperId, ...group.loserIds],
    keeperId: group.keeperId,
    loserIds: group.loserIds,
    ...(group.sourceKey === undefined ? {} : { sourceKey: group.sourceKey }),
    keeperTitle: group.keeperTitle,
    loserTitles: group.loserTitles,
    reason: deterministicReason(group.rules),
  };
}

const SAMPLE_MAX_IDS = 20;

function deterministicSample(group: DeterministicGroup<MemoryId>): SampleItem {
  return {
    rule: group.rules.includes("exact") ? "exact" : "key",
    rules: group.rules,
    keeperId: group.keeperId,
    keeperTitle: group.keeperTitle,
    loserTitles: group.loserTitles,
    count: group.loserIds.length + 1,
    memoryIds: [group.keeperId, ...group.loserIds].slice(0, SAMPLE_MAX_IDS),
    reason: deterministicReason(group.rules),
  };
}

async function insertRun(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    profileId: Id<"profiles">;
    dryRun: boolean;
    planRunId?: RunId;
  },
): Promise<RunId> {
  return await ctx.db.insert("dreamRuns", {
    userId: args.userId,
    profileId: args.profileId,
    trigger: "backfill",
    dryRun: args.dryRun,
    status: "running",
    startedAt: Date.now(),
    counts: emptyDreamCounts(),
    aiCalls: 0,
    costUsd: 0,
    cleanup: emptyCleanup(),
    ...(args.planRunId === undefined ? {} : { planRunId: args.planRunId }),
  });
}

async function requireRun(ctx: MutationCtx, runId: RunId) {
  const run = await ctx.db.get(runId);
  if (!run) throw new Error("Dream run not found");
  return run;
}

// ---------------------------------------------------------------- dry run

// clerk id and scope kind for the profile the plan reads
export const planContextInternal = internalQuery({
  args: { userId: v.id("users"), profileId: v.id("profiles") },
  returns: v.object({
    clerkId: v.string(),
    kind: v.union(v.literal("personal"), v.literal("team")),
  }),
  handler: async (ctx, args) => {
    const [user, profile] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db.get(args.profileId),
    ]);
    if (!user?.clerkId || !profile) throw new Error("Profile not found");
    const kind: "personal" | "team" =
      profile.teamId === undefined ? "personal" : "team";
    if (kind === "personal" && profile.userId !== args.userId) {
      throw new Error("Profile not found");
    }
    return { clerkId: user.clerkId, kind };
  },
});

// one page of slim visible rows (no content) for the planner
export const pagePlanRowsInternal = internalQuery({
  args: {
    kind: v.union(v.literal("personal"), v.literal("team")),
    userId: v.string(),
    profileId: v.string(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  returns: v.object({ rows: v.array(planRowValidator), ...pageMetaValidator }),
  handler: async (ctx, args) => {
    const scope = memoryReadScopeFromArgs(args);
    if (scope === null) throw new Error("Bad plan scope");
    const page = await paginateScopedDocs(ctx, scope, {
      numItems: args.numItems,
      cursor: args.cursor,
    });
    return {
      rows: page.page
        .filter((doc) => isVisibleStatus(doc.status))
        .map(toPlanRow),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      splitCursor: page.splitCursor,
      pageStatus: page.pageStatus,
    };
  },
});

export const embeddingsForInternal = internalQuery({
  args: { ids: v.array(v.id("memories")) },
  returns: v.array(
    v.object({
      embeddingId: v.id("memoryEmbeddings"),
      memoryDocId: v.id("memories"),
      embedding: v.array(v.float64()),
    }),
  ),
  handler: async (ctx, args) => {
    const out: {
      embeddingId: Id<"memoryEmbeddings">;
      memoryDocId: MemoryId;
      embedding: number[];
    }[] = [];
    for (const id of args.ids) {
      const row = await ctx.db
        .query("memoryEmbeddings")
        .withIndex("by_memory_doc", (q) => q.eq("memoryDocId", id))
        .first();
      if (row) {
        out.push({
          embeddingId: row._id,
          memoryDocId: id,
          embedding: row.embedding,
        });
      }
    }
    return out;
  },
});

// memory doc ids behind vector hits from the slim embeddingRefs rows; the
// search already filters by profile and callers keep only eligible rows
export const embeddingOwnersInternal = internalQuery({
  args: { ids: v.array(v.id("memoryEmbeddings")) },
  returns: v.array(
    v.object({
      embeddingId: v.id("memoryEmbeddings"),
      memoryDocId: v.id("memories"),
    }),
  ),
  handler: async (ctx, args) => {
    const owners = await memoryDocIdsForEmbeddings(ctx, args.ids);
    return args.ids.flatMap((embeddingId, i) => {
      const memoryDocId = owners[i] ?? null;
      return memoryDocId === null ? [] : [{ embeddingId, memoryDocId }];
    });
  },
});

export const mentionsForInternal = internalQuery({
  args: { memoryIds: v.array(v.string()) },
  returns: v.array(
    v.object({ memoryId: v.string(), entityId: v.id("memoryEntities") }),
  ),
  handler: async (ctx, args) => {
    const out: { memoryId: string; entityId: Id<"memoryEntities"> }[] = [];
    for (const memoryId of args.memoryIds) {
      const rows = await ctx.db
        .query("memoryEntityMentions")
        .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
        .collect();
      for (const row of rows) out.push({ memoryId, entityId: row.entityId });
    }
    return out;
  },
});

export const startPlanRunInternal = internalMutation({
  args: { userId: v.id("users"), profileId: v.id("profiles") },
  returns: v.id("dreamRuns"),
  handler: async (ctx, args) => await insertRun(ctx, { ...args, dryRun: true }),
});

export const insertPlanGroupsInternal = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    groups: v.array(planGroupInputValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const group of args.groups) {
      await ctx.db.insert("dreamPlanGroups", {
        ...group,
        runId: args.runId,
        createdAt: now,
      });
    }
    return null;
  },
});

export const recordScanInternal = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    cleanup: dreamRunFields.cleanup,
    sample: dreamRunFields.sample,
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRun(ctx, args.runId);
    await ctx.db.patch(args.runId, {
      cleanup: args.cleanup,
      sample: args.sample,
      ...(args.error === undefined ? {} : { error: args.error }),
    });
    return null;
  },
});

/**
 * The plan a new scan continues: the profile's newest earlier dry run that
 * finished with candidate groups. Apply runs and scans without an AI pass
 * are passed over, so verdicts carry across them.
 */
export const priorPlanInternal = internalQuery({
  args: { runId: v.id("dreamRuns") },
  returns: v.union(v.id("dreamRuns"), v.null()),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run?.profileId) return null;
    const earlier = await ctx.db
      .query("dreamRuns")
      .withIndex("by_user_trigger_started", (q) =>
        q
          .eq("userId", run.userId)
          .eq("trigger", "backfill")
          .lte("startedAt", run.startedAt),
      )
      .order("desc")
      .filter((q) => q.eq(q.field("profileId"), run.profileId))
      .take(PRIOR_PLAN_LOOKBACK);
    const plan = earlier.find(
      (prior) =>
        prior._creationTime < run._creationTime &&
        prior.dryRun &&
        (prior.status === "ok" || prior.status === "partial") &&
        (prior.cleanup?.aiCandidates ?? 0) > 0,
    );
    return plan?._id ?? null;
  },
});

// what a new scan copies from an earlier plan's AI group
const priorAiGroupValidator = v.object({
  memberIds: v.array(v.id("memories")),
  aiStatus: dreamPlanGroupInputFields.aiStatus,
  keeperId: v.optional(v.id("memories")),
  loserIds: v.array(v.id("memories")),
  keeperTitle: v.string(),
  loserTitles: v.array(v.string()),
  reason: v.string(),
  aiConfidence: v.optional(v.number()),
});

// one page of a plan's AI groups, in plan order
export const priorAiGroupsInternal = internalQuery({
  args: { runId: v.id("dreamRuns"), afterSeq: v.number() },
  returns: v.object({
    groups: v.array(priorAiGroupValidator),
    lastSeq: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("dreamPlanGroups")
      .withIndex("by_run_tier_seq", (q) =>
        q.eq("runId", args.runId).eq("tier", "ai").gt("seq", args.afterSeq),
      )
      .take(PRIOR_GROUP_PAGE);
    return {
      groups: rows.map((row) => ({
        memberIds: row.memberIds,
        aiStatus: row.aiStatus,
        keeperId: row.keeperId,
        loserIds: row.loserIds,
        keeperTitle: row.keeperTitle,
        loserTitles: row.loserTitles,
        reason: row.reason,
        aiConfidence: row.aiConfidence,
      })),
      lastSeq: rows.at(-1)?.seq ?? args.afterSeq,
      isDone: rows.length < PRIOR_GROUP_PAGE,
    };
  },
});

async function priorAiGroups(
  ctx: ActionCtx,
  runId: RunId,
): Promise<Infer<typeof priorAiGroupValidator>[]> {
  const planId = await ctx.runQuery(internal.dreamCleanup.priorPlanInternal, {
    runId,
  });
  const groups: Infer<typeof priorAiGroupValidator>[] = [];
  if (planId === null) return groups;
  let afterSeq = -1;
  for (;;) {
    const page = await ctx.runQuery(
      internal.dreamCleanup.priorAiGroupsInternal,
      { runId: planId, afterSeq },
    );
    groups.push(...page.groups);
    if (page.isDone) return groups;
    afterSeq = page.lastSeq;
  }
}

async function chunked<T>(
  items: readonly T[],
  size: number,
  each: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await each(items.slice(i, i + size));
  }
}

async function scanRows(
  ctx: ActionCtx,
  scope: { kind: "personal" | "team"; userId: string; profileId: string },
): Promise<{ rows: PlanRow<MemoryId>[]; truncated: boolean }> {
  const rows: PlanRow<MemoryId>[] = [];
  let truncated = false;
  await walkPages(
    async ({ cursor, numItems }) => {
      const page = await ctx.runQuery(
        internal.dreamCleanup.pagePlanRowsInternal,
        { ...scope, cursor, numItems },
      );
      return { ...page, items: page.rows };
    },
    (items) => {
      for (const row of items) {
        if (rows.length >= MAX_PLAN_ROWS) {
          truncated = true;
          return false;
        }
        rows.push(row);
      }
      return undefined;
    },
    PAGE_SIZE,
  );
  return { rows, truncated };
}

// the rule J input: an eligible row without the fields rules A/B needed
type EligibleRow = { _id: MemoryId; memoryId: string; title: string };

// rule J candidate edges: vector neighbours at cosine >= 0.90 and rows that
// share a narrow entity, both only between eligible rows. Each embedding is
// read once; hits resolve through the slim embeddingRefs rows.
async function candidateEdges(
  ctx: ActionCtx,
  profileId: string,
  rows: readonly EligibleRow[],
): Promise<CandidateEdge<MemoryId>[]> {
  const eligible = new Set(rows.map((row) => row._id));
  const edges: CandidateEdge<MemoryId>[] = [];
  await chunked(rows, EMBEDDING_BATCH, async (chunk) => {
    const embeddings = await ctx.runQuery(
      internal.dreamCleanup.embeddingsForInternal,
      { ids: chunk.map((row) => row._id) },
    );
    const hits = await Promise.all(
      embeddings.map(async (row) => ({
        from: row.memoryDocId,
        hits: (
          await ctx.vectorSearch("memoryEmbeddings", "by_embedding", {
            vector: row.embedding,
            limit: NEIGHBOUR_LIMIT,
            filter: (q) => q.eq("profileId", profileId),
          })
        ).filter(
          (hit) =>
            hit._id !== row.embeddingId && hit._score >= NEIGHBOUR_MIN_SCORE,
        ),
      })),
    );
    const hitIds = [
      ...new Set(hits.flatMap((row) => row.hits.map((h) => h._id))),
    ];
    if (hitIds.length === 0) return;
    const owners = await ctx.runQuery(
      internal.dreamCleanup.embeddingOwnersInternal,
      { ids: hitIds },
    );
    const ownerOf = new Map(
      owners.map((owner) => [owner.embeddingId, owner.memoryDocId]),
    );
    for (const row of hits) {
      for (const hit of row.hits) {
        const to = ownerOf.get(hit._id);
        if (to === undefined || to === row.from || !eligible.has(to)) continue;
        edges.push({ a: row.from, b: to, score: hit._score });
      }
    }
  });

  const docIdOf = new Map(rows.map((row) => [row.memoryId, row._id]));
  const mentions: { rowId: MemoryId; entityId: string }[] = [];
  await chunked(rows, MENTION_BATCH, async (chunk) => {
    const found = await ctx.runQuery(
      internal.dreamCleanup.mentionsForInternal,
      {
        memoryIds: chunk.map((row) => row.memoryId),
      },
    );
    for (const mention of found) {
      const rowId = docIdOf.get(mention.memoryId);
      if (rowId) mentions.push({ rowId, entityId: mention.entityId });
    }
  });
  return [...edges, ...entityEdges(mentions)];
}

function clampCalls(value: number | undefined): number {
  const calls = Math.floor(value ?? JEV_MAX_CALLS);
  return Math.max(0, Math.min(JEV_MAX_CALLS, calls));
}

const planArgs = {
  userId: v.id("users"),
  profileId: v.id("profiles"),
  // Jev calls for this run: default and at most 500
  jevMaxCalls: v.optional(v.number()),
  // past the call cap, judge an even spread of the unjudged groups instead
  // of the top ones
  jevSample: v.optional(v.boolean()),
};

/**
 * Dry run. Writes the plan (dreamPlanGroups) and the run summary, never a
 * memory. Rule J needs AI_GATEWAY_API_KEY and jevMaxCalls above 0; otherwise
 * J is skipped and no embedding is read.
 */
export const planInternal = internalAction({
  args: { ...planArgs, runId: v.optional(v.id("dreamRuns")) },
  returns: v.id("dreamRuns"),
  handler: async (ctx, args): Promise<RunId> => {
    const context = await ctx.runQuery(
      internal.dreamCleanup.planContextInternal,
      { userId: args.userId, profileId: args.profileId },
    );
    const runId =
      args.runId ??
      (await ctx.runMutation(internal.dreamCleanup.startPlanRunInternal, {
        userId: args.userId,
        profileId: args.profileId,
      }));
    try {
      await planRun(ctx, {
        ...args,
        runId,
        scope: {
          kind: context.kind,
          userId: context.clerkId,
          profileId: args.profileId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "plan failed";
      await ctx.runMutation(internal.dream.failRunInternal, {
        runId,
        error: message,
      });
      throw error;
    }
    return runId;
  },
});

async function planRun(
  ctx: ActionCtx,
  args: {
    runId: RunId;
    scope: { kind: "personal" | "team"; userId: string; profileId: string };
    jevMaxCalls?: number;
    jevSample?: boolean;
  },
): Promise<void> {
  const scan = await planDeterministic(ctx, args);
  const cleanup = scan.cleanup;
  const calls = clampCalls(args.jevMaxCalls);
  const apiKey = resolveSystemOneApiKey();
  let queued = 0;
  if (apiKey === undefined) {
    cleanup.aiStopReason = "no_key";
  } else if (calls > 0) {
    const ai = await planAiGroups(ctx, {
      runId: args.runId,
      profileId: args.scope.profileId,
      rows: scan.eligible,
      calls,
      spread: args.jevSample ?? false,
    });
    queued = ai.queued;
    cleanup.aiCandidates = ai.candidates;
    cleanup.aiSkipped = ai.candidates - ai.reused - ai.queued;
    if (cleanup.aiSkipped > 0) cleanup.aiStopReason = "cap";
  }

  // deterministic host-name tag groups; the merge itself runs on apply
  const { tagCounts } = await collectTagCounts(ctx, args.scope.profileId);
  const tagSample = planTagMerges(tagCounts.keys())
    .slice(0, SAMPLE_TAG_GROUPS)
    .map(
      (merge): SampleItem => ({
        rule: "tag",
        keeperTitle: merge.keeper,
        loserTitles: merge.losers,
        count: merge.losers.reduce((n, t) => n + (tagCounts.get(t) ?? 0), 0),
        memoryIds: [],
        reason: "Host-name tag spellings",
      }),
    );

  await ctx.runMutation(internal.dreamCleanup.recordScanInternal, {
    runId: args.runId,
    cleanup,
    sample: [...scan.sample, ...tagSample],
    ...(scan.truncated
      ? { error: `scan stopped at ${String(MAX_PLAN_ROWS)} rows` }
      : {}),
  });
  if (queued > 0) {
    await ctx.scheduler.runAfter(0, internal.dreamCleanup.judgeInternal, {
      runId: args.runId,
      afterSeq: -1,
    });
  } else {
    await ctx.runMutation(internal.dreamCleanup.finishPlanInternal, {
      runId: args.runId,
    });
  }
}

async function insertPlanGroups(
  ctx: ActionCtx,
  runId: RunId,
  groups: readonly PlanGroupInput[],
): Promise<void> {
  await chunked(groups, GROUP_WRITE_CHUNK, async (chunk) => {
    await ctx.runMutation(internal.dreamCleanup.insertPlanGroupsInternal, {
      runId,
      groups: chunk,
    });
  });
}

// Rules A/B over every visible row. Returns only what rule J needs, so the
// full rows are not held during the vector pass.
async function planDeterministic(
  ctx: ActionCtx,
  args: {
    runId: RunId;
    scope: { kind: "personal" | "team"; userId: string; profileId: string };
  },
): Promise<{
  eligible: EligibleRow[];
  cleanup: CleanupCounts;
  sample: SampleItem[];
  truncated: boolean;
}> {
  const { rows, truncated } = await scanRows(ctx, args.scope);
  const groups = buildDeterministicGroups(rows);
  await insertPlanGroups(
    ctx,
    args.runId,
    groups.map((group, seq) => ({ ...toPlanGroup(group), seq })),
  );
  return {
    eligible: aiEligibleRows(rows, groups).map((row) => ({
      _id: row._id,
      memoryId: row.memoryId,
      title: planTitle(row.title),
    })),
    cleanup: {
      ...emptyCleanup(),
      ...deterministicStats(groups),
      scannedRows: rows.length,
    },
    sample: groups
      .slice(0, SAMPLE_DETERMINISTIC_GROUPS)
      .map(deterministicSample),
    truncated,
  };
}

/**
 * Rule J over every eligible row. A candidate group that the prior plan
 * already judged keeps its verdict; the others queue for Jev, up to `calls`.
 * Queued groups come first (seq 0..), reused verdicts after them, so the
 * judge chain stops at the first group that is not pending.
 */
async function planAiGroups(
  ctx: ActionCtx,
  args: {
    runId: RunId;
    profileId: string;
    rows: readonly EligibleRow[];
    calls: number;
    spread: boolean;
  },
): Promise<{ candidates: number; reused: number; queued: number }> {
  const candidates = buildCandidateGroups(
    await candidateEdges(ctx, args.profileId, args.rows),
  );
  const { reused, unjudged } = reusePriorVerdicts(
    candidates,
    await priorAiGroups(ctx, args.runId),
  );
  const queued = pickCandidateGroups(unjudged, args.calls, args.spread);
  const titleOf = new Map(args.rows.map((row) => [row._id, row.title]));
  const title = (id: MemoryId | undefined) => (id && titleOf.get(id)) ?? "";
  await insertPlanGroups(ctx, args.runId, [
    ...queued.map(
      (group, seq): PlanGroupInput => ({
        tier: "ai",
        seq,
        rules: ["jev"],
        memberIds: group.memberIds,
        loserIds: [],
        keeperTitle: title(group.memberIds[0]),
        loserTitles: group.memberIds.slice(1, PLAN_LOSER_TITLES + 1).map(title),
        reason: "Jev candidate",
        aiStatus: "pending",
        score: group.score,
      }),
    ),
    ...reused.map(
      ({ group, verdict }, i): PlanGroupInput => ({
        ...verdict,
        tier: "ai",
        seq: queued.length + i,
        rules: ["jev"],
        score: group.score,
      }),
    ),
  ]);
  return {
    candidates: candidates.length,
    reused: reused.length,
    queued: queued.length,
  };
}

// ------------------------------------------------------------ Jev pass

const judgeMemberValidator = v.object({
  _id: v.id("memories"),
  title: v.string(),
  content: v.string(),
  status: memoryStatusValidator,
  createdAt: v.number(),
});

// Next pending AI groups with their visible members, plus today's dream
// spend. Pending groups lead the plan, so `done` once a page runs short or
// reaches a reused verdict.
export const pendingAiGroupsInternal = internalQuery({
  args: { runId: v.id("dreamRuns"), afterSeq: v.number(), limit: v.number() },
  returns: v.object({
    userId: v.id("users"),
    profileId: v.optional(v.id("profiles")),
    spentTodayUsd: v.number(),
    groups: v.array(
      v.object({
        _id: v.id("dreamPlanGroups"),
        seq: v.number(),
        members: v.array(judgeMemberValidator),
      }),
    ),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Dream run not found");
    const rows = await ctx.db
      .query("dreamPlanGroups")
      .withIndex("by_run_tier_seq", (q) =>
        q.eq("runId", args.runId).eq("tier", "ai").gt("seq", args.afterSeq),
      )
      .take(args.limit);
    const pending = rows.filter((row) => row.aiStatus === "pending");
    const groups = [];
    for (const row of pending) {
      const members = [];
      for (const id of row.memberIds) {
        const doc = await ctx.db.get(id);
        if (!doc || !isVisibleStatus(doc.status)) continue;
        members.push({
          _id: doc._id,
          title: doc.title,
          content: doc.content.slice(0, JUDGE_CONTENT_CHARS),
          status: doc.status,
          createdAt: doc.createdAt,
        });
      }
      groups.push({ _id: row._id, seq: row.seq, members });
    }
    return {
      userId: run.userId,
      profileId: run.profileId,
      spentTodayUsd: await dreamSpentTodayUsd(ctx),
      groups,
      done: rows.length < args.limit || pending.length < rows.length,
    };
  },
});

const verdictValidator = v.union(
  v.object({
    status: v.literal("flagged"),
    keeperId: v.id("memories"),
    removeIds: v.array(v.id("memories")),
    reason: v.string(),
    confidence: v.number(),
  }),
  v.object({
    status: v.literal("not_duplicate"),
    reason: v.string(),
    confidence: v.optional(v.number()),
  }),
  v.object({ status: v.literal("error"), reason: v.string() }),
);

export const recordVerdictInternal = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    groupId: v.id("dreamPlanGroups"),
    verdict: verdictValidator,
    // false when the group was dropped without a call (rows changed)
    called: v.boolean(),
    costUsd: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const group = await ctx.db.get(args.groupId);
    if (!group || group.runId !== args.runId) {
      throw new Error("Plan group not found");
    }
    const verdict = args.verdict;
    if (verdict.status === "flagged") {
      const titleOf = async (id: MemoryId) =>
        planTitle((await ctx.db.get(id))?.title ?? "");
      await ctx.db.patch(group._id, {
        aiStatus: "flagged",
        keeperId: verdict.keeperId,
        loserIds: verdict.removeIds,
        keeperTitle: await titleOf(verdict.keeperId),
        loserTitles: await Promise.all(
          verdict.removeIds.slice(0, PLAN_LOSER_TITLES).map(titleOf),
        ),
        reason: verdict.reason,
        aiConfidence: verdict.confidence,
      });
    } else {
      await ctx.db.patch(group._id, {
        aiStatus: verdict.status,
        reason: verdict.reason,
        ...(verdict.status === "not_duplicate" &&
        verdict.confidence !== undefined
          ? { aiConfidence: verdict.confidence }
          : {}),
      });
    }
    if (!args.called) return null;
    const cleanup = run.cleanup ?? emptyCleanup();
    await ctx.db.patch(run._id, {
      aiCalls: run.aiCalls + 1,
      costUsd: run.costUsd + (args.costUsd ?? 0),
      cleanup: {
        ...cleanup,
        aiCostUnknown:
          cleanup.aiCostUnknown + (args.costUsd === undefined ? 1 : 0),
      },
    });
    return null;
  },
});

// maps Jev's string ids back to the group's typed ids
function typedVerdict(
  verdict: JevDuplicateVerdict,
  members: readonly { _id: MemoryId }[],
): Infer<typeof verdictValidator> {
  if (verdict.status !== "flagged") return verdict;
  const idOf = (id: string) => members.find((m) => m._id === id)?._id;
  const keeperId = idOf(verdict.keeperId);
  if (keeperId === undefined) {
    return { status: "error", reason: "keeper not in group" };
  }
  const removeIds = verdict.removeIds.flatMap((id) => {
    const typed = idOf(id);
    return typed === undefined ? [] : [typed];
  });
  return { ...verdict, keeperId, removeIds };
}

/**
 * Judges up to 10 pending groups, then schedules the next chunk. Stops on a
 * missing key or once today's dream spend reaches the budget; whatever is
 * still pending then counts as skipped.
 */
export const judgeInternal = internalAction({
  args: { runId: v.id("dreamRuns"), afterSeq: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const apiKey = resolveSystemOneApiKey();
    const batch = await ctx.runQuery(
      internal.dreamCleanup.pendingAiGroupsInternal,
      { runId: args.runId, afterSeq: args.afterSeq, limit: JUDGE_CHUNK },
    );
    let stop: StopReason | undefined =
      apiKey === undefined ? "no_key" : undefined;
    let spent = batch.spentTodayUsd;
    let lastSeq = args.afterSeq;
    for (const group of batch.groups) {
      if (apiKey === undefined) break;
      if (spent >= DREAM_DAILY_BUDGET_USD) {
        stop = "budget";
        break;
      }
      lastSeq = group.seq;
      if (group.members.length < 2) {
        await ctx.runMutation(internal.dreamCleanup.recordVerdictInternal, {
          runId: args.runId,
          groupId: group._id,
          verdict: { status: "not_duplicate", reason: "Rows changed" },
          called: false,
        });
        continue;
      }
      const result = await judgeDuplicateGroup({
        members: group.members.map((member) => ({
          ...member,
          id: member._id,
        })),
        apiKey,
      });
      spent += result.costUsd ?? 0;
      await scheduleLog(ctx, {
        userId: batch.userId,
        profileId: batch.profileId,
        feature: "dream",
        endpoint: "chat",
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costUsd: result.costUsd,
        ...(result.verdict.status === "error"
          ? { errorMessage: result.verdict.reason }
          : {}),
      });
      await ctx.runMutation(internal.dreamCleanup.recordVerdictInternal, {
        runId: args.runId,
        groupId: group._id,
        verdict: typedVerdict(result.verdict, group.members),
        called: true,
        costUsd: result.costUsd,
      });
    }
    if (stop === undefined && !batch.done) {
      await ctx.scheduler.runAfter(0, internal.dreamCleanup.judgeInternal, {
        runId: args.runId,
        afterSeq: lastSeq,
      });
      return null;
    }
    await ctx.runMutation(internal.dreamCleanup.finishPlanInternal, {
      runId: args.runId,
      ...(stop === undefined ? {} : { stop }),
    });
    return null;
  },
});

/**
 * Closes the dry run: verdict counts (reused verdicts included), sample = top
 * deterministic groups plus the first 50 Jev-flagged groups (apply reads the
 * plan, not the sample), status "partial" when anything was capped, failed or
 * left unjudged.
 */
export const finishPlanInternal = internalMutation({
  args: { runId: v.id("dreamRuns"), stop: v.optional(stopReasonValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const aiGroups = await ctx.db
      .query("dreamPlanGroups")
      .withIndex("by_run_tier_seq", (q) =>
        q.eq("runId", args.runId).eq("tier", "ai"),
      )
      .collect();
    const count = (status: Doc<"dreamPlanGroups">["aiStatus"]) =>
      aiGroups.filter((group) => group.aiStatus === status).length;
    const flagged = aiGroups.filter((group) => group.aiStatus === "flagged");
    const base = run.cleanup ?? emptyCleanup();
    const cleanup: CleanupCounts = {
      ...base,
      aiNotDuplicate: count("not_duplicate"),
      aiErrors: count("error"),
      aiSkipped: base.aiSkipped + count("pending"),
      ...(args.stop === undefined && base.aiStopReason === undefined
        ? {}
        : { aiStopReason: args.stop ?? base.aiStopReason }),
    };
    const aiSample = flagged
      .flatMap((group): SampleItem[] =>
        group.keeperId === undefined
          ? []
          : [
              {
                rule: "near_dup",
                rules: ["jev"],
                keeperId: group.keeperId,
                keeperTitle: group.keeperTitle,
                loserTitles: group.loserTitles,
                count: group.loserIds.length + 1,
                memoryIds: [group.keeperId, ...group.loserIds],
                reason: group.reason,
              },
            ],
      )
      .slice(0, SAMPLE_AI_GROUPS);
    const partial =
      run.error !== undefined ||
      cleanup.aiErrors > 0 ||
      cleanup.aiSkipped > 0 ||
      cleanup.aiStopReason === "budget";
    await ctx.db.patch(run._id, {
      status: partial ? "partial" : "ok",
      finishedAt: Date.now(),
      cleanup,
      counts: { ...run.counts, aiFlagged: flagged.length },
      sample: [...(run.sample ?? []), ...aiSample],
    });
    return null;
  },
});

// ---------------------------------------------------------------- apply

const tierValidator = dreamPlanGroupFields.tier;

async function groupStillVisible(
  ctx: MutationCtx,
  ids: readonly MemoryId[],
): Promise<boolean> {
  for (const id of ids) {
    const doc = await ctx.db.get(id);
    if (!doc || !isVisibleStatus(doc.status)) return false;
  }
  return true;
}

async function proposeAiMerge(
  ctx: MutationCtx,
  args: {
    clerkId: string;
    profileId: string;
    applyRunId: RunId;
    group: Doc<"dreamPlanGroups">;
    keeperId: MemoryId;
  },
): Promise<boolean> {
  const keeper = await ctx.db.get(args.keeperId);
  if (!keeper) return false;
  const others: Doc<"memories">[] = [];
  for (const id of args.group.loserIds) {
    const doc = await ctx.db.get(id);
    if (doc) others.push(doc);
  }
  return await proposeDreamChange(ctx, {
    clerkId: args.clerkId,
    profileId: args.profileId,
    runId: args.applyRunId,
    kind: "merge",
    keeper,
    others,
    reason: args.group.reason,
    ...(args.group.aiConfidence === undefined
      ? {}
      : { confidence: args.group.aiConfidence }),
  });
}

const applyArgs = {
  runId: v.id("dreamRuns"),
  includeAi: v.optional(v.boolean()),
  // Jev-flagged groups always become proposals, even with auto-accept on
  aiAsProposals: v.optional(v.boolean()),
  // set by the chain itself
  applyRunId: v.optional(v.id("dreamRuns")),
  tier: v.optional(tierValidator),
  afterSeq: v.optional(v.number()),
};

/**
 * Applies a dry-run plan. Deterministic groups merge through dream.applyMerge
 * (undoable), 100 groups per mutation, self-rescheduling. With includeAi the
 * Jev-flagged groups then become inbox merge proposals, or merge at once
 * (suppressedBy "dream-ai") when dreamModeAutoAccept is on and aiAsProposals
 * is not set. A group is skipped when any of its rows is gone or no longer
 * visible. The last batch schedules tag consolidation (tagConsolidate.ts) for
 * the profile. Returns the apply run.
 */
async function applyPlanBatch(
  ctx: MutationCtx,
  args: ObjectType<typeof applyArgs>,
): Promise<RunId> {
  const plan = await requireRun(ctx, args.runId);
  if (!plan.dryRun || plan.trigger !== "backfill" || !plan.profileId) {
    throw new Error("Not a cleanup dry run");
  }
  if (plan.status !== "ok" && plan.status !== "partial") {
    throw new Error("Dry run has not finished");
  }
  const profileId = plan.profileId;
  const applyRunId =
    args.applyRunId ??
    (await insertRun(ctx, {
      userId: plan.userId,
      profileId,
      dryRun: false,
      planRunId: plan._id,
    }));
  const applyRun = await requireRun(ctx, applyRunId);
  const tier = args.tier ?? "deterministic";
  const afterSeq = args.afterSeq ?? -1;
  const user = await ctx.db.get(plan.userId);
  if (!user?.clerkId) throw new Error("Dream run user not found");
  const autoAccept =
    (await getSettingsDoc(ctx, plan.userId))?.dreamModeAutoAccept ?? false;

  const groups = await ctx.db
    .query("dreamPlanGroups")
    .withIndex("by_run_tier_seq", (q) =>
      q.eq("runId", plan._id).eq("tier", tier).gt("seq", afterSeq),
    )
    .take(APPLY_GROUPS);
  const counts = { ...applyRun.counts };
  const cleanup = applyRun.cleanup ?? emptyCleanup();
  let lastSeq = afterSeq;
  let rows = 0;
  let more = groups.length === APPLY_GROUPS;
  for (const group of groups) {
    if (rows >= APPLY_ROW_BUDGET) {
      more = true;
      break;
    }
    lastSeq = group.seq;
    const keeperId = group.keeperId;
    if (keeperId === undefined) continue;
    if (tier === "ai" && group.aiStatus !== "flagged") continue;
    rows += group.loserIds.length + 1;
    if (!(await groupStillVisible(ctx, [keeperId, ...group.loserIds]))) {
      cleanup.skippedChanged += 1;
      continue;
    }
    if (tier === "ai" && (!autoAccept || args.aiAsProposals === true)) {
      const proposed = await proposeAiMerge(ctx, {
        clerkId: user.clerkId,
        profileId,
        applyRunId,
        group,
        keeperId,
      });
      if (proposed) counts.proposals += 1;
      continue;
    }
    const actionId = await mergeGroup(ctx, {
      runId: applyRunId,
      keeperId,
      loserIds: group.loserIds,
      reason: group.reason,
      ...(group.sourceKey === undefined ? {} : { sourceKey: group.sourceKey }),
      ...(tier === "ai"
        ? {
            ai: {
              relation: "duplicate",
              confidence: group.aiConfidence ?? 0,
              model: SYSTEMONE_DEFAULT_MODEL,
            },
          }
        : {}),
    });
    if (actionId === null) continue;
    if (tier === "ai") counts.nearDupMerged += 1;
    else if (group.rules.includes("exact")) counts.exactMerged += 1;
    else counts.keyMerged += 1;
  }

  const next: { tier: "deterministic" | "ai"; afterSeq: number } | null = more
    ? { tier, afterSeq: lastSeq }
    : tier === "deterministic" && args.includeAi === true
      ? { tier: "ai", afterSeq: -1 }
      : null;
  await ctx.db.patch(applyRunId, {
    counts,
    cleanup,
    ...(next === null ? { status: "ok", finishedAt: Date.now() } : {}),
  });
  if (next === null) {
    // last batch: the same tag merge as nightly dreaming (it needs an action)
    await ctx.scheduler.runAfter(
      0,
      internal.tagConsolidate.consolidateProfileTagsInternal,
      { profileId, runId: applyRunId, userId: plan.userId },
    );
  } else {
    await ctx.scheduler.runAfter(0, internal.dreamCleanup.applyInternal, {
      runId: plan._id,
      includeAi: args.includeAi,
      aiAsProposals: args.aiAsProposals,
      applyRunId,
      ...next,
    });
  }
  return applyRunId;
}

export const applyInternal = internalMutation({
  args: applyArgs,
  returns: v.id("dreamRuns"),
  handler: async (ctx, args) => await applyPlanBatch(ctx, args),
});

// ------------------------------------------------------- CLI entry points

/**
 * Starts a dry run for one user; returns the run id at once (the plan runs
 * in the background). Defaults to the user's default personal profile.
 * jevMaxCalls defaults to 500, the ceiling; pass less for a smaller run.
 *   npx convex run dreamCleanup:dryRunForUser '{"clerkUserId":"user_…","jevMaxCalls":20}'
 */
export const dryRunForUser = internalMutation({
  args: {
    clerkUserId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    profileId: v.optional(v.id("profiles")),
    jevMaxCalls: v.optional(v.number()),
    jevSample: v.optional(v.boolean()),
  },
  returns: v.id("dreamRuns"),
  handler: async (ctx, args) => {
    const user =
      args.userId !== undefined
        ? await ctx.db.get(args.userId)
        : args.clerkUserId !== undefined
          ? await getUserByClerkId(ctx, args.clerkUserId)
          : null;
    if (!user) throw new Error("User not found");
    const profileId =
      args.profileId ?? (await defaultPersonalProfile(ctx, user._id));
    if (!profileId) throw new Error("No personal profile");
    return await startPlan(ctx, {
      userId: user._id,
      profileId,
      ...(args.jevMaxCalls === undefined
        ? {}
        : { jevMaxCalls: args.jevMaxCalls }),
      ...(args.jevSample === undefined ? {} : { jevSample: args.jevSample }),
    });
  },
});

// inserts the dry-run row and schedules the plan in the background
async function startPlan(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    profileId: Id<"profiles">;
    jevMaxCalls?: number;
    jevSample?: boolean;
  },
): Promise<RunId> {
  const runId = await insertRun(ctx, {
    userId: args.userId,
    profileId: args.profileId,
    dryRun: true,
  });
  await ctx.scheduler.runAfter(0, internal.dreamCleanup.planInternal, {
    ...args,
    runId,
  });
  return runId;
}

async function defaultPersonalProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"profiles"> | null> {
  const profiles = (
    await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  ).filter((profile) => profile.teamId === undefined);
  const chosen =
    profiles.find((profile) => profile.isDefault) ??
    [...profiles].sort((a, b) => a.createdAt - b.createdAt)[0];
  return chosen?._id ?? null;
}

/**
 * Counts and the bounded sample (ids, 80-char titles, reasons) of one run;
 * never memory contents.
 *   npx convex run dreamCleanup:getRunSummary '{"runId":"…"}'
 */
export const getRunSummary = internalQuery({
  args: { runId: v.id("dreamRuns") },
  returns: v.union(
    v.null(),
    v.object({
      run: runRowValidator,
      costPerCallUsd: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const priced = run.aiCalls - (run.cleanup?.aiCostUnknown ?? 0);
    return {
      run,
      costPerCallUsd: priced > 0 ? run.costUsd / priced : null,
    };
  },
});

// ---------------------------------------------------------------- web

// newest one-off cleanup run (dry run or apply) of one profile
async function latestCleanupRun(
  ctx: QueryCtx,
  userId: Id<"users">,
  profileId: Id<"profiles">,
): Promise<Doc<"dreamRuns"> | null> {
  return await ctx.db
    .query("dreamRuns")
    .withIndex("by_user_trigger_started", (q) =>
      q.eq("userId", userId).eq("trigger", "backfill"),
    )
    .order("desc")
    .filter((q) => q.eq(q.field("profileId"), profileId))
    .first();
}

// the cleanup card: a finished dry run here is a plan not yet applied
export const latestForProfile = authQuery({
  args: { profileId: v.id("profiles") },
  returns: v.union(runRowValidator, v.null()),
  handler: async (ctx, args) =>
    await latestCleanupRun(ctx, ctx.userId, args.profileId),
});

/**
 * "Scan for duplicates" on the Dreaming page: a dry run over every memory of
 * the caller's own personal profile. Jev runs only when dreamModeUseAi is on,
 * up to 500 calls; a later scan continues with the groups left unjudged.
 * Refused while a cleanup runs and within an hour of the last one.
 */
export const startDryRun = authMutation({
  args: { profileId: v.id("profiles") },
  returns: v.id("dreamRuns"),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (
      !profile ||
      profile.userId !== ctx.userId ||
      profile.teamId !== undefined
    ) {
      userFacingError("Profile not found");
    }
    const latest = await latestCleanupRun(ctx, ctx.userId, profile._id);
    if (latest?.status === "running") {
      userFacingError("A cleanup is already running");
    }
    if (latest && Date.now() - latest.startedAt < WEB_DRY_RUN_GAP_MS) {
      throw new ConvexError({
        message: "A cleanup ran in the last hour. Try again later.",
        nextAllowedAt: latest.startedAt + WEB_DRY_RUN_GAP_MS,
      });
    }
    const { useAi } = dreamSettingsOf(await getSettingsDoc(ctx, ctx.userId));
    return await startPlan(ctx, {
      userId: ctx.userId,
      profileId: profile._id,
      ...(useAi ? {} : { jevMaxCalls: 0 }),
    });
  },
});

/**
 * "Clean up" on the cleanup card: applies the caller's own dry run when it is
 * still the profile's latest cleanup run (not yet applied). Deterministic
 * groups merge with undo; Jev-flagged groups go to the inbox as proposals.
 */
export const applyCleanup = authMutation({
  args: { runId: v.id("dreamRuns") },
  returns: v.id("dreamRuns"),
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.runId);
    if (!plan || plan.userId !== ctx.userId || !plan.profileId) {
      userFacingError("Dream run not found");
    }
    const latest = await latestCleanupRun(ctx, ctx.userId, plan.profileId);
    if (latest?._id !== plan._id) {
      userFacingError("This cleanup was already applied");
    }
    return await applyPlanBatch(ctx, {
      runId: plan._id,
      includeAi: true,
      aiAsProposals: true,
    });
  },
});

// hourly: drops plan groups 30 days after their dry run
export const purgeOldPlanGroups = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("dreamPlanGroups")
      .withIndex("by_created", (q) =>
        q.lt("createdAt", Date.now() - PLAN_RETENTION_MS),
      )
      .take(PURGE_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.dreamCleanup.purgeOldPlanGroups,
        {},
      );
    }
    return rows.length;
  },
});
