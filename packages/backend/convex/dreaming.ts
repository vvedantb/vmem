import { v, type Infer } from "convex/values";
import type { DreamCandidateKind } from "../engine/memory/dream/candidates";
import { judgeDuplicateGroup } from "../engine/memory/dream/jevDuplicate";
import {
  buildDreamJudgePrompt,
  DREAM_JUDGE_ROLE,
  parseDreamJudgeReply,
  type DreamJudgePair,
} from "../engine/memory/dream/judge";
import {
  DREAM_UNDO_WINDOW_MS,
  snapshotRow,
} from "../engine/memory/dream/merge";
import {
  addDreamCounts,
  aiCallStop,
  changedRows,
  dreamPairAction,
  fullAiAllowance,
  sameSourceFamily,
  spendAiCall,
  type DreamAiAllowance,
  DECAY_IDLE_MS,
  DREAM_BATCH_ROWS,
  DREAM_FIRST_WINDOW_MS,
  DREAM_MAX_DECAY_ACTIONS,
  DREAM_MAX_SCAN_ROWS,
  DREAM_PEER_LIMIT,
  emptyDreamCounts,
  isDecayCandidate,
  type DreamCounts,
} from "../engine/memory/dream/nightly";
import {
  buildDeterministicGroups,
  deterministicReason,
  sourceKeyOf,
  toPlanRow,
} from "../engine/memory/dream/plan";
import {
  isVisibleStatus,
  memoryMatchesScope,
  type MemoryReadScope,
} from "../engine/memory/scope";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { auditLog, ResourceTypes } from "./auditLog";
import { authAction } from "./auth";
import {
  dreamSpentTodayUsd,
  mergeGroup,
  patchDreamFields,
  proposeDreamChange,
  runScope,
  supersedeRow,
} from "./dream";
import { readOpenRouterApiKey } from "./lib/openRouterKey";
import { callJsonChatWithUsage } from "./lib/openRouter/jsonChat";
import { LLM_MODEL, scheduleLog } from "./lib/openRouter/shared";
import { runGetOwnerUserIdInternal } from "./teams/auth";
import { dreamSettingsOf, getSettingsDoc } from "./userSettings";
import {
  dreamCandidateFields,
  dreamRunFields,
  memoryStatusValidator,
} from "./validators";

// Nightly dreaming (plan §3c). Per profile, in bounded batches: exact and
// source-key dedupe over the rows changed since the last run, then the AI
// judge over the open write-time candidates (near-dup: Jev; maybe-conflict:
// Qwen, thinking off), expire, decay (personal profiles only), log. Every
// change is a dreamActions row with undo. Manual "Run now" runs the same pass.

const MANUAL_RATE_LIMIT_MS = 60 * 60 * 1000;
// recent runs read to find the last window
const LAST_RUN_LOOKBACK = 50;

type MemoryId = Id<"memories">;
type RunId = Id<"dreamRuns">;
type Trigger = "nightly" | "manual";

// global kill switch: nightly and manual dreaming both stop
function dreamDisabled(): boolean {
  return process.env.DREAM_DISABLED === "1";
}

const kindValidator = v.union(v.literal("personal"), v.literal("team"));
const triggerValidator = v.union(v.literal("nightly"), v.literal("manual"));

export const dreamResultValidator = v.object({
  reason: v.union(
    v.literal("ok"),
    v.literal("disabled"),
    v.literal("off"),
    v.literal("rate-limited"),
    v.literal("no-user"),
  ),
  // one dreamRuns row per profile dreamt
  runIds: v.array(v.id("dreamRuns")),
  counts: dreamRunFields.counts,
  failed: v.number(),
});
export type DreamResult = Infer<typeof dreamResultValidator>;

function result(
  reason: DreamResult["reason"],
  rest: Partial<Omit<DreamResult, "reason">> = {},
): DreamResult {
  return {
    reason,
    runIds: rest.runIds ?? [],
    counts: rest.counts ?? emptyDreamCounts(),
    failed: rest.failed ?? 0,
  };
}

async function requireRun(ctx: MutationCtx, runId: RunId) {
  const run = await ctx.db.get(runId);
  if (!run?.profileId) throw new Error("Dream run not found");
  return { ...run, profileId: run.profileId };
}

async function addCounts(
  ctx: MutationCtx,
  run: Doc<"dreamRuns">,
  delta: Partial<DreamCounts>,
): Promise<void> {
  await ctx.db.patch(run._id, { counts: addDreamCounts(run.counts, delta) });
}

// ------------------------------------------------------------------ plan

/**
 * What to dream for one user: personal profiles, plus team profiles where the
 * user is the team's owner (the owner's settings apply). Null when the user
 * row is gone.
 */
export const userPlanInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      clerkId: v.string(),
      automatic: v.boolean(),
      decay: v.boolean(),
      useAi: v.boolean(),
      autoAccept: v.boolean(),
      lastDreamRunAt: v.union(v.number(), v.null()),
      profiles: v.array(
        v.object({ profileId: v.id("profiles"), kind: kindValidator }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.clerkId) return null;
    const personal = (
      await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect()
    ).filter((profile) => profile.teamId === undefined);
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const profiles: { profileId: Id<"profiles">; kind: "personal" | "team" }[] =
      personal.map((profile) => ({ profileId: profile._id, kind: "personal" }));
    for (const membership of memberships) {
      if (membership.role !== "owner") continue;
      const owner = await runGetOwnerUserIdInternal(ctx, {
        teamId: membership.teamId,
      });
      // a team with two owners is dreamt once, by its first owner
      if (owner !== args.userId) continue;
      const teamProfiles = await ctx.db
        .query("profiles")
        .withIndex("by_team", (q) => q.eq("teamId", membership.teamId))
        .collect();
      for (const profile of teamProfiles) {
        profiles.push({ profileId: profile._id, kind: "team" });
      }
    }
    return {
      clerkId: user.clerkId,
      ...dreamSettingsOf(await getSettingsDoc(ctx, args.userId)),
      profiles,
    };
  },
});

/**
 * The newest finished nightly / manual run of this profile, and whether an
 * applied (not dry run) one-off cleanup finished for it.
 */
async function runHistory(
  ctx: MutationCtx,
  userId: Id<"users">,
  profileId: Id<"profiles">,
): Promise<{ previous: Doc<"dreamRuns"> | null; cleanedUp: boolean }> {
  const runs = (
    await ctx.db
      .query("dreamRuns")
      .withIndex("by_user_started", (q) => q.eq("userId", userId))
      .order("desc")
      .take(LAST_RUN_LOOKBACK)
  ).filter((run) => run.profileId === profileId);
  const previous =
    runs.find(
      (run) =>
        run.trigger !== "backfill" &&
        (run.status === "ok" || run.status === "partial") &&
        run.windowThrough !== undefined,
    ) ?? null;
  const cleanedUp = runs.some(
    (run) => run.trigger === "backfill" && !run.dryRun && run.status === "ok",
  );
  return { previous, cleanedUp };
}

export const startProfileRunInternal = internalMutation({
  args: {
    userId: v.id("users"),
    profileId: v.id("profiles"),
    trigger: triggerValidator,
    decay: v.boolean(),
  },
  returns: v.object({
    runId: v.id("dreamRuns"),
    windowFrom: v.number(),
    until: v.number(),
    decayFrom: v.union(v.number(), v.null()),
    decayUntil: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { previous, cleanedUp } = await runHistory(
      ctx,
      args.userId,
      args.profileId,
    );
    const runId = await ctx.db.insert("dreamRuns", {
      userId: args.userId,
      profileId: args.profileId,
      trigger: args.trigger,
      dryRun: false,
      status: "running",
      startedAt: now,
      counts: emptyDreamCounts(),
      aiCalls: 0,
      costUsd: 0,
    });
    return {
      runId,
      windowFrom: previous?.windowThrough ?? now - DREAM_FIRST_WINDOW_MS,
      until: now,
      decayFrom:
        args.decay && (previous !== null || cleanedUp)
          ? (previous?.decayThrough ?? 0)
          : null,
      decayUntil: now - DECAY_IDLE_MS,
    };
  },
});

// --------------------------------------------------------- steps 1 and 2

async function visiblePeers(
  ctx: MutationCtx,
  scope: MemoryReadScope,
  doc: Doc<"memories">,
): Promise<Doc<"memories">[]> {
  const byHash = await ctx.db
    .query("memories")
    .withIndex("by_user_profile_hash", (q) =>
      q
        .eq("userId", doc.userId)
        .eq("profileId", doc.profileId)
        .eq("contentHash", doc.contentHash),
    )
    .take(DREAM_PEER_LIMIT);
  // rows keyed by a new extension (externalId) or by an earlier merge
  const key = sourceKeyOf(doc);
  const byKey =
    key === undefined
      ? []
      : await ctx.db
          .query("memories")
          .withIndex("by_user_source", (q) =>
            q
              .eq("userId", doc.userId)
              .eq("sourceType", doc.sourceType ?? doc.source)
              .eq("sourceId", key),
          )
          .take(DREAM_PEER_LIMIT);
  return [...byHash, ...byKey].filter(
    (peer) => isVisibleStatus(peer.status) && memoryMatchesScope(peer, scope),
  );
}

/**
 * One page of the change window. Each visible row pulls in its exact-hash
 * and source-key peers, the batch is bucketed like the one-off cleanup
 * (rules A and B; old rows with no stored key meet through the recomputed
 * browse key), and each group merges into its keeper with undo.
 */
export const dedupeBatchInternal = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    from: v.number(),
    until: v.number(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  returns: v.object({
    scanned: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
    lastUpdatedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const scope = await runScope(ctx, run);
    const query =
      scope.kind === "team"
        ? ctx.db
            .query("memories")
            .withIndex("by_profile_updated", (q) =>
              q
                .eq("profileId", scope.profileId)
                .gte("updatedAt", args.from)
                .lte("updatedAt", args.until),
            )
        : ctx.db
            .query("memories")
            .withIndex("by_user_updated", (q) =>
              q
                .eq("userId", scope.userId)
                .gte("updatedAt", args.from)
                .lte("updatedAt", args.until),
            );
    const page = await query.paginate({
      cursor: args.cursor,
      numItems: args.numItems,
    });
    const rows = new Map<MemoryId, Doc<"memories">>();
    for (const doc of page.page) {
      if (!isVisibleStatus(doc.status) || !memoryMatchesScope(doc, scope)) {
        continue;
      }
      rows.set(doc._id, doc);
      for (const peer of await visiblePeers(ctx, scope, doc)) {
        rows.set(peer._id, peer);
      }
    }
    const delta = { exactMerged: 0, keyMerged: 0 };
    const groups = buildDeterministicGroups([...rows.values()].map(toPlanRow));
    for (const group of groups) {
      const actionId = await mergeGroup(ctx, {
        runId: run._id,
        keeperId: group.keeperId,
        loserIds: group.loserIds,
        reason: deterministicReason(group.rules),
        ...(group.sourceKey === undefined
          ? {}
          : { sourceKey: group.sourceKey }),
      });
      if (actionId === null) continue;
      if (group.rules.includes("exact")) delta.exactMerged += 1;
      else delta.keyMerged += 1;
    }
    await addCounts(ctx, run, delta);
    return {
      scanned: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      lastUpdatedAt: page.page[page.page.length - 1]?.updatedAt ?? null,
    };
  },
});

// ------------------------------------------------- steps 3 and 4 (AI)

const JUDGE_CONTENT_CHARS = 600;

const judgeMemberValidator = v.object({
  _id: v.id("memories"),
  title: v.string(),
  content: v.string(),
  status: memoryStatusValidator,
  source: v.string(),
  createdAt: v.number(),
});
type JudgeMember = Infer<typeof judgeMemberValidator>;

/**
 * Up to `limit` open candidates of one kind for the run's profile, oldest
 * first, plus today's dream spend. A pair whose rows are gone, hidden or out
 * of scope is dropped here, without a call.
 */
export const openCandidatesInternal = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    kind: dreamCandidateFields.kind,
    limit: v.number(),
  },
  returns: v.object({
    spentTodayUsd: v.number(),
    candidates: v.array(
      v.object({
        _id: v.id("dreamCandidates"),
        members: v.array(judgeMemberValidator),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const scope = await runScope(ctx, run);
    const rows = await ctx.db
      .query("dreamCandidates")
      .withIndex("by_profile_kind_status_created", (q) =>
        q
          .eq("profileId", run.profileId)
          .eq("kind", args.kind)
          .eq("status", "open"),
      )
      .take(args.limit);
    const candidates = [];
    for (const row of rows) {
      const docs = [
        await ctx.db.get(row.memoryId),
        await ctx.db.get(row.neighborId),
      ];
      const members = docs.flatMap((doc) =>
        doc && isVisibleStatus(doc.status) && memoryMatchesScope(doc, scope)
          ? [
              {
                _id: doc._id,
                title: doc.title,
                content: doc.content.slice(0, JUDGE_CONTENT_CHARS),
                status: doc.status,
                source: doc.source,
                createdAt: doc.createdAt,
              },
            ]
          : [],
      );
      if (members.length < 2) {
        await ctx.db.patch(row._id, { status: "dropped" });
        continue;
      }
      candidates.push({ _id: row._id, members });
    }
    return { spentTodayUsd: await dreamSpentTodayUsd(ctx), candidates };
  },
});

// one judged pair, as both judges report it. "none": not a duplicate, or
// the call failed
const judgedVerdictValidator = v.object({
  relation: v.union(
    v.literal("duplicate"),
    v.literal("update"),
    v.literal("contradiction"),
    v.literal("unrelated"),
    v.literal("none"),
  ),
  keeperId: v.optional(v.id("memories")),
  otherIds: v.array(v.id("memories")),
  confidence: v.number(),
  reason: v.string(),
  model: v.string(),
});
type JudgedVerdict = Infer<typeof judgedVerdictValidator>;

async function visibleDocs(
  ctx: MutationCtx,
  scope: MemoryReadScope,
  ids: readonly MemoryId[],
): Promise<Doc<"memories">[] | null> {
  const docs: Doc<"memories">[] = [];
  for (const id of ids) {
    const doc = await ctx.db.get(id);
    if (
      !doc ||
      !isVisibleStatus(doc.status) ||
      !memoryMatchesScope(doc, scope)
    ) {
      return null;
    }
    docs.push(doc);
  }
  return docs;
}

/**
 * Applies one verdict (dreamPairAction): an auto-accepted merge or
 * supersede with undo, else an inbox proposal; "unrelated" drops the
 * candidate. Rows changed by an earlier pair tonight are left alone. Adds
 * the call and its cost to the run.
 */
export const recordJudgedInternal = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    candidateId: v.id("dreamCandidates"),
    verdict: judgedVerdictValidator,
    costUsd: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const { verdict } = args;
    const delta: Partial<DreamCounts> = {};
    const docs =
      verdict.keeperId === undefined
        ? null
        : await visibleDocs(ctx, await runScope(ctx, run), [
            verdict.keeperId,
            ...verdict.otherIds,
          ]);
    const [keeperDoc, ...others] = docs ?? [];
    const settings = dreamSettingsOf(await getSettingsDoc(ctx, run.userId));
    const action = dreamPairAction({
      relation: verdict.relation,
      confidence: verdict.confidence,
      autoAccept: settings.autoAccept,
      sameFamily:
        keeperDoc !== undefined &&
        others.every((doc) => sameSourceFamily(keeperDoc, doc)),
    });
    const user = await ctx.db.get(run.userId);
    if (
      keeperDoc !== undefined &&
      others.length > 0 &&
      user?.clerkId !== undefined &&
      (action.kind === "merge" ||
        action.kind === "supersede" ||
        action.kind === "contradiction")
    ) {
      const ai = {
        relation: verdict.relation,
        confidence: verdict.confidence,
        model: verdict.model,
      };
      delta.aiFlagged = 1;
      if (action.kind === "merge" && action.apply) {
        const actionId = await mergeGroup(ctx, {
          runId: run._id,
          keeperId: keeperDoc._id,
          loserIds: others.map((doc) => doc._id),
          reason: verdict.reason,
          ai,
        });
        if (actionId !== null) delta.nearDupMerged = 1;
      } else if (action.kind === "supersede" && action.apply) {
        const [older] = others;
        const actionId =
          older === undefined
            ? null
            : await supersedeRow(ctx, {
                runId: run._id,
                keeperId: keeperDoc._id,
                olderId: older._id,
                reason: verdict.reason,
                ai,
              });
        if (actionId !== null) delta.superseded = 1;
      } else {
        const proposed = await proposeDreamChange(ctx, {
          clerkId: user.clerkId,
          profileId: run.profileId,
          runId: run._id,
          kind:
            action.kind === "merge"
              ? "merge"
              : action.kind === "supersede"
                ? "update"
                : "contradiction",
          keeper: keeperDoc,
          others,
          reason: verdict.reason,
          confidence: verdict.confidence,
        });
        if (proposed) delta.proposals = 1;
      }
    }
    const candidate = await ctx.db.get(args.candidateId);
    if (candidate) {
      await ctx.db.patch(candidate._id, {
        status: action.kind === "drop" ? "dropped" : "judged",
      });
    }
    await ctx.db.patch(run._id, {
      counts: addDreamCounts(run.counts, delta),
      aiCalls: run.aiCalls + 1,
      costUsd: run.costUsd + (args.costUsd ?? 0),
    });
    return null;
  },
});

function memberIdOf(
  members: readonly JudgeMember[],
  id: string,
): MemoryId | undefined {
  return members.find((member) => member._id === id)?._id;
}

interface JudgeCall {
  apiKey: string;
  userId: Id<"users">;
  profileId: Id<"profiles">;
  members: JudgeMember[];
}

// step 3: the shared Jev duplicate judge (also used by the one-off cleanup)
async function judgeNearDup(
  ctx: ActionCtx,
  call: JudgeCall,
): Promise<{ verdict: JudgedVerdict; costUsd?: number }> {
  const result = await judgeDuplicateGroup({
    members: call.members.map((member) => ({ ...member, id: member._id })),
    apiKey: call.apiKey,
    tag: "dream-nightly",
  });
  await scheduleLog(ctx, {
    userId: call.userId,
    profileId: call.profileId,
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
  const { verdict } = result;
  const keeperId =
    verdict.status === "flagged"
      ? memberIdOf(call.members, verdict.keeperId)
      : undefined;
  if (verdict.status !== "flagged" || keeperId === undefined) {
    return {
      costUsd: result.costUsd,
      verdict: {
        relation: "none",
        otherIds: [],
        confidence: verdict.status === "error" ? 0 : verdict.confidence,
        reason: verdict.reason,
        model: result.model,
      },
    };
  }
  return {
    costUsd: result.costUsd,
    verdict: {
      relation: "duplicate",
      keeperId,
      otherIds: verdict.removeIds.flatMap((id) => {
        const typed = memberIdOf(call.members, id);
        return typed === undefined ? [] : [typed];
      }),
      confidence: verdict.confidence,
      reason: verdict.reason,
      model: result.model,
    },
  };
}

// step 4: one Qwen call (feature "dream", thinking off), logged by the chat
// helper
async function judgeConflict(
  ctx: ActionCtx,
  call: JudgeCall,
): Promise<{ verdict: JudgedVerdict; costUsd?: number }> {
  const [a, b] = call.members;
  const none = (reason: string): JudgedVerdict => ({
    relation: "none",
    otherIds: [],
    confidence: 0,
    reason,
    model: LLM_MODEL,
  });
  if (a === undefined || b === undefined) return { verdict: none("no pair") };
  const toJudge = (member: JudgeMember) => ({ ...member, id: member._id });
  const pair: DreamJudgePair = [toJudge(a), toJudge(b)];
  const reply = await callJsonChatWithUsage(ctx, {
    apiKey: call.apiKey,
    userId: call.userId,
    profileId: call.profileId,
    feature: "dream",
    role: DREAM_JUDGE_ROLE,
    prompt: buildDreamJudgePrompt(pair),
    thinking: "off",
  });
  const verdict = parseDreamJudgeReply(pair, reply.content);
  const costUsd = reply.costUsd;
  if (verdict.status === "error")
    return { verdict: none(verdict.reason), costUsd };
  if (verdict.status === "unrelated") {
    return {
      costUsd,
      verdict: {
        relation: "unrelated",
        otherIds: [],
        confidence: verdict.confidence,
        reason: verdict.reason,
        model: LLM_MODEL,
      },
    };
  }
  const keeperId = memberIdOf(call.members, verdict.keeperId);
  const otherId = memberIdOf(call.members, verdict.otherId);
  if (keeperId === undefined || otherId === undefined) {
    return { verdict: none("keeper not in pair"), costUsd };
  }
  return {
    costUsd,
    verdict: {
      relation: verdict.relation,
      keeperId,
      otherIds: [otherId],
      confidence: verdict.confidence,
      reason: verdict.reason,
      model: LLM_MODEL,
    },
  };
}

// one user's night: the key, and the calls left. One object is shared by
// all of the user's profiles, so a failed profile still spends its calls.
interface DreamAi {
  apiKey: string;
  allowance: DreamAiAllowance;
}

/**
 * Steps 3 (near_dup → Jev) and 4 (maybe_conflict → Qwen) for one profile.
 * Each call spends from `ai.allowance`; calls stop at the per-kind cap, the
 * per-user cap or the global daily budget. True when candidates were left
 * unjudged.
 */
async function runAiDreamSteps(
  ctx: ActionCtx,
  args: {
    runId: RunId;
    userId: Id<"users">;
    profileId: Id<"profiles">;
    ai: DreamAi;
  },
): Promise<boolean> {
  const { ai } = args;
  let stopped = false;
  const kinds: DreamCandidateKind[] = ["near_dup", "maybe_conflict"];
  for (const kind of kinds) {
    const limit = Math.min(ai.allowance.byKind[kind], ai.allowance.total);
    if (limit <= 0) continue;
    const batch = await ctx.runMutation(
      internal.dreaming.openCandidatesInternal,
      { runId: args.runId, kind, limit },
    );
    let spent = batch.spentTodayUsd;
    for (const candidate of batch.candidates) {
      if (aiCallStop(ai.allowance, kind, spent) !== null) {
        stopped = true;
        break;
      }
      ai.allowance = spendAiCall(ai.allowance, kind);
      const call = {
        apiKey: ai.apiKey,
        userId: args.userId,
        profileId: args.profileId,
        members: candidate.members,
      };
      const judged =
        kind === "near_dup"
          ? await judgeNearDup(ctx, call)
          : await judgeConflict(ctx, call);
      spent += judged.costUsd ?? 0;
      await ctx.runMutation(internal.dreaming.recordJudgedInternal, {
        runId: args.runId,
        candidateId: candidate._id,
        verdict: judged.verdict,
        ...(judged.costUsd === undefined ? {} : { costUsd: judged.costUsd }),
      });
    }
  }
  return stopped;
}

// ------------------------------------------------------- steps 5 and 6

// one undoable action for a batch of status changes
async function logStatusAction(
  ctx: MutationCtx,
  run: Doc<"dreamRuns">,
  kind: "expire" | "archive",
  docs: readonly Doc<"memories">[],
  reason: string,
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("dreamActions", {
    runId: run._id,
    userId: run.userId,
    ...(run.profileId === undefined ? {} : { profileId: run.profileId }),
    kind,
    memoryIds: docs.map((doc) => doc._id),
    before: docs.map((doc) => snapshotRow(doc)),
    created: { linkIds: [], mentionIds: [] },
    reason,
    undoExpiresAt: now + DREAM_UNDO_WINDOW_MS,
    createdAt: now,
  });
}

/**
 * Step 5: active rows of the profile whose expiresAt has passed become
 * "expired". Pinned rows are left alone. Expired rows leave the index range,
 * so the next batch reads the next ones.
 */
export const expireBatchInternal = internalMutation({
  args: { runId: v.id("dreamRuns"), numItems: v.number() },
  returns: v.object({ scanned: v.number() }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const scope = await runScope(ctx, run);
    const now = Date.now();
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_profile_status_expires", (q) =>
        q
          .eq("profileId", run.profileId)
          .eq("status", "active")
          .gte("expiresAt", 0)
          .lt("expiresAt", now),
      )
      .take(args.numItems);
    const expired = rows.filter((doc) => memoryMatchesScope(doc, scope));
    for (const doc of expired) {
      await patchDreamFields(ctx, doc, { status: "expired" });
    }
    if (expired.length > 0) {
      await logStatusAction(ctx, run, "expire", expired, "Expired");
      await addCounts(ctx, run, { expired: expired.length });
    }
    return { scanned: rows.length };
  },
});

async function usageHits(ctx: MutationCtx, memoryId: string): Promise<number> {
  const usage = await ctx.db
    .query("memoryUsage")
    .withIndex("by_memory_id", (q) => q.eq("memoryId", memoryId))
    .first();
  if (!usage) return 0;
  return usage.retrieveHits + usage.searchHits + usage.contextPackHits;
}

/**
 * Step 6: one page of active rows whose lastVisitAt falls in [from, until);
 * the rows that pass isDecayCandidate are suppressed (suppressedBy
 * "dream-decay"). Stops early once archiveLeft rows were archived;
 * lastVisitAt then marks where the next run resumes.
 */
export const decayBatchInternal = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    from: v.number(),
    until: v.number(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
    archiveLeft: v.number(),
  },
  returns: v.object({
    scanned: v.number(),
    archived: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
    lastVisitAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const scope = await runScope(ctx, run);
    const now = Date.now();
    const page = await ctx.db
      .query("memories")
      .withIndex("by_profile_status_last_visit", (q) =>
        q
          .eq("profileId", run.profileId)
          .eq("status", "active")
          .gte("lastVisitAt", args.from)
          .lt("lastVisitAt", args.until),
      )
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    const archived: Doc<"memories">[] = [];
    let scanned = 0;
    let lastVisitAt: number | null = null;
    for (const doc of page.page) {
      if (archived.length >= args.archiveLeft) break;
      scanned += 1;
      lastVisitAt = doc.lastVisitAt;
      if (!memoryMatchesScope(doc, scope)) continue;
      if (!isDecayCandidate(doc, await usageHits(ctx, doc.memoryId), now)) {
        continue;
      }
      await patchDreamFields(ctx, doc, {
        status: "suppressed",
        suppressedBy: "dream-decay",
        suppressedRunId: run._id,
        suppressedAt: now,
      });
      archived.push(doc);
    }
    if (archived.length > 0) {
      await logStatusAction(
        ctx,
        run,
        "archive",
        archived,
        "Stale: not visited for 30 days and never used",
      );
      await addCounts(ctx, run, { archived: archived.length });
    }
    return {
      scanned,
      archived: archived.length,
      isDone: page.isDone && scanned === page.page.length,
      continueCursor: page.continueCursor,
      lastVisitAt,
    };
  },
});

// --------------------------------------------------------------- step 7

export const finishProfileRunInternal = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    windowThrough: v.number(),
    decayThrough: v.optional(v.number()),
    truncated: v.boolean(),
  },
  returns: dreamRunFields.counts,
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    await ctx.db.patch(run._id, {
      status: args.truncated ? "partial" : "ok",
      finishedAt: Date.now(),
      windowThrough: args.windowThrough,
      ...(args.decayThrough === undefined
        ? {}
        : { decayThrough: args.decayThrough }),
      ...(args.truncated
        ? { error: "stopped at a nightly limit; the next run resumes" }
        : {}),
    });
    return run.counts;
  },
});

// ---------------------------------------------------------- orchestration

async function dreamProfile(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    profileId: Id<"profiles">;
    kind: "personal" | "team";
    trigger: Trigger;
    decay: boolean;
    // null: no key or dreamModeUseAi off, so the AI steps are skipped
    ai: DreamAi | null;
  },
): Promise<{ runId: RunId; counts: DreamCounts }> {
  const start = await ctx.runMutation(
    internal.dreaming.startProfileRunInternal,
    {
      userId: args.userId,
      profileId: args.profileId,
      trigger: args.trigger,
      // team decay is off: shared rows are not one person's history
      decay: args.decay && args.kind === "personal",
    },
  );
  const { runId } = start;
  try {
    let budget = DREAM_MAX_SCAN_ROWS;
    let truncated = false;

    // steps 1 + 2: exact and source-key dedupe over the change window
    let windowThrough = start.until;
    let cursor: string | null = null;
    for (;;) {
      const page: {
        scanned: number;
        isDone: boolean;
        continueCursor: string;
        lastUpdatedAt: number | null;
      } = await ctx.runMutation(internal.dreaming.dedupeBatchInternal, {
        runId,
        from: start.windowFrom,
        until: start.until,
        cursor,
        numItems: Math.min(DREAM_BATCH_ROWS, budget),
      });
      budget -= page.scanned;
      if (page.isDone) break;
      if (budget <= 0) {
        // resume here next run; rows sharing this updatedAt are read again
        windowThrough = page.lastUpdatedAt ?? start.windowFrom;
        truncated = true;
        break;
      }
      cursor = page.continueCursor;
    }

    // AI judge over the write-time candidates; no key, no AI merge
    if (args.ai !== null) {
      const stopped = await runAiDreamSteps(ctx, {
        runId,
        userId: args.userId,
        profileId: args.profileId,
        ai: args.ai,
      });
      if (stopped) truncated = true;
    }

    // step 5: expire
    while (budget > 0) {
      const numItems = Math.min(DREAM_BATCH_ROWS, budget);
      const batch = await ctx.runMutation(
        internal.dreaming.expireBatchInternal,
        { runId, numItems },
      );
      budget -= batch.scanned;
      if (batch.scanned < numItems) break;
      if (budget <= 0) truncated = true;
    }

    // step 6: decay
    let decayThrough: number | undefined;
    if (start.decayFrom !== null) {
      let archiveLeft = DREAM_MAX_DECAY_ACTIONS;
      let decayCursor: string | null = null;
      let lastSeen: number | null = null;
      let stopped = false;
      for (;;) {
        if (budget <= 0 || archiveLeft <= 0) {
          stopped = true;
          break;
        }
        const page: {
          scanned: number;
          archived: number;
          isDone: boolean;
          continueCursor: string;
          lastVisitAt: number | null;
        } = await ctx.runMutation(internal.dreaming.decayBatchInternal, {
          runId,
          from: start.decayFrom,
          until: start.decayUntil,
          cursor: decayCursor,
          numItems: Math.min(DREAM_BATCH_ROWS, budget),
          archiveLeft,
        });
        budget -= page.scanned;
        archiveLeft -= page.archived;
        if (page.lastVisitAt !== null) lastSeen = page.lastVisitAt;
        if (page.isDone) break;
        decayCursor = page.continueCursor;
      }
      // stopped early: the next run resumes at the last row read
      decayThrough = stopped ? (lastSeen ?? start.decayFrom) : start.decayUntil;
      if (stopped) truncated = true;
    }

    const counts = await ctx.runMutation(
      internal.dreaming.finishProfileRunInternal,
      {
        runId,
        windowThrough,
        truncated,
        ...(decayThrough === undefined ? {} : { decayThrough }),
      },
    );
    return { runId, counts };
  } catch (error) {
    await ctx.runMutation(internal.dream.failRunInternal, {
      runId,
      error: error instanceof Error ? error.message : "dream run failed",
    });
    throw error;
  }
}

function describeCounts(counts: DreamCounts): string {
  const merged = counts.exactMerged + counts.keyMerged + counts.nearDupMerged;
  const parts: string[] = [];
  if (merged > 0) {
    parts.push(
      `merged ${String(merged)} duplicate group${merged === 1 ? "" : "s"}`,
    );
  }
  if (counts.superseded > 0) {
    parts.push(`replaced ${String(counts.superseded)} outdated`);
  }
  if (counts.proposals > 0) {
    parts.push(
      `queued ${String(counts.proposals)} proposal${counts.proposals === 1 ? "" : "s"} for review in Dreaming`,
    );
  }
  if (counts.expired > 0) parts.push(`expired ${String(counts.expired)}`);
  if (counts.archived > 0) {
    parts.push(`archived ${String(counts.archived)} stale`);
  }
  return parts.join(", ");
}

/**
 * Dreams every profile of one user (see userPlanInternal). Nightly runs need
 * dreamModeAutomatic; manual runs are limited to one per hour. One failed
 * profile is logged and does not stop the others.
 */
export async function runDreamForUser(
  ctx: ActionCtx,
  args: { userId: Id<"users">; trigger: Trigger },
): Promise<DreamResult> {
  if (dreamDisabled()) return result("disabled");
  const plan = await ctx.runQuery(internal.dreaming.userPlanInternal, {
    userId: args.userId,
  });
  if (plan === null) return result("no-user");
  if (args.trigger === "nightly" && !plan.automatic) return result("off");
  if (
    args.trigger === "manual" &&
    plan.lastDreamRunAt !== null &&
    Date.now() - plan.lastDreamRunAt < MANUAL_RATE_LIMIT_MS
  ) {
    return result("rate-limited");
  }

  const runIds: RunId[] = [];
  let counts = emptyDreamCounts();
  let failed = 0;
  // one AI allowance per user per night, shared by all profiles
  const apiKey = readOpenRouterApiKey();
  const ai: DreamAi | null =
    apiKey !== undefined && plan.useAi
      ? { apiKey, allowance: fullAiAllowance() }
      : null;
  for (const profile of plan.profiles) {
    try {
      const run = await dreamProfile(ctx, {
        userId: args.userId,
        profileId: profile.profileId,
        kind: profile.kind,
        trigger: args.trigger,
        decay: plan.decay,
        ai,
      });
      runIds.push(run.runId);
      counts = addDreamCounts(counts, run.counts);
    } catch (error) {
      failed += 1;
      console.error("[dreaming]", args.userId, profile.profileId, error);
    }
  }

  if (runIds.length > 0) {
    await ctx.runMutation(internal.userSettings.setLastDreamRunAtInternal, {
      userId: args.userId,
      timestamp: Date.now(),
    });
  }
  if (args.trigger === "nightly" && changedRows(counts) > 0) {
    await ctx.runMutation(internal.notifications.pushInternal, {
      userId: args.userId,
      title: "Dream Mode finished",
      description: `Dream Mode ${describeCounts(counts)}. Each change can be undone for 30 days.`,
      type: "info",
    });
  }
  return result("ok", { runIds, counts, failed });
}

// "Run Dream Mode now": the Dreaming page button and the MCP dream_run tool. Rate
// limited, no notification, audited.
export async function runManualDream(
  ctx: ActionCtx,
  args: { userId: Id<"users"> },
): Promise<DreamResult> {
  const outcome = await runDreamForUser(ctx, {
    userId: args.userId,
    trigger: "manual",
  });
  await auditLog.log(ctx, {
    action: "dream_mode.manual_run",
    actorId: args.userId,
    resourceType: ResourceTypes.USER,
    resourceId: args.userId,
    metadata: {
      reason: outcome.reason,
      runIds: outcome.runIds,
      failed: outcome.failed,
      ...outcome.counts,
    },
    severity: "info",
  });
  return outcome;
}

export const runNow = authAction({
  args: {},
  returns: dreamResultValidator,
  handler: async (ctx): Promise<DreamResult> =>
    await runManualDream(ctx, { userId: ctx.userId }),
});
