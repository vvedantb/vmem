import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import {
  internalAction,
  internalMutation,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { auditLog, ResourceTypes } from "./auditLog";
import { decideDreamCheck } from "./lib/dreamTriggerDecision";
import { resolveSystemOneApiKey } from "./lib/systemOneKey";
import {
  clusterNearDuplicateMemories,
  pickClusterKeeper,
} from "../engine/memory/clusters";
import {
  clusterSourceKey,
  judgeDreamMergeClusters,
  type JevMergeGateDecision,
  type JevMergeGateOutcome,
} from "../engine/memory/jevMergeGate";
import { isVisibleStatus } from "../engine/memory/scope";
import { collectScopedMemories } from "./memoryStore/helpers";
import {
  hasOverlappingPendingProposal,
  insertProposedUpdate,
} from "./proposedUpdateStore";
import { resolveProposedUpdate } from "./proposedUpdateApi";
import type { MemoryWithTags } from "@vmem/sdk";

export interface DreamRunResult {
  proposalsCreated: number;
  memoriesMaterialized: number;
  clustersScanned: number;
  reweighted: number;
  jevSkipped: number;
  jevApproved: number;
  jevRejected: number;
  failOpen: number;
  reason: "ok" | "no-key" | "no-recent-memories" | "rate-limited";
}

const MANUAL_RATE_LIMIT_MS = 60 * 60 * 1000;
const DEFAULT_MERGE_CLUSTERS = 8;

const jevMergeOutcomeValidator = v.union(
  v.literal("approve"),
  v.literal("reject"),
  v.literal("abstain"),
  v.literal("fail-open"),
);

const clusterGateValidator = v.object({
  sourceMemoryIds: v.array(v.string()),
  outcome: jevMergeOutcomeValidator,
  keeperId: v.string(),
  safeToAutoAccept: v.boolean(),
  mergeNoul: v.optional(v.number()),
  keeperConfidence: v.optional(v.number()),
  autoAcceptNoul: v.optional(v.number()),
});

function emptyDreamResult(reason: DreamRunResult["reason"]): DreamRunResult {
  return {
    proposalsCreated: 0,
    memoriesMaterialized: 0,
    clustersScanned: 0,
    reweighted: 0,
    jevSkipped: 0,
    jevApproved: 0,
    jevRejected: 0,
    failOpen: 0,
    reason,
  };
}

function addDreamResults(
  target: DreamRunResult,
  next: DreamRunResult,
): DreamRunResult {
  return {
    proposalsCreated: target.proposalsCreated + next.proposalsCreated,
    memoriesMaterialized:
      target.memoriesMaterialized + next.memoriesMaterialized,
    clustersScanned: target.clustersScanned + next.clustersScanned,
    reweighted: target.reweighted + next.reweighted,
    jevSkipped: target.jevSkipped + next.jevSkipped,
    jevApproved: target.jevApproved + next.jevApproved,
    jevRejected: target.jevRejected + next.jevRejected,
    failOpen: target.failOpen + next.failOpen,
    reason: target.reason === "ok" ? next.reason : target.reason,
  };
}

function isRateLimited(lastRunAt: number | null | undefined): boolean {
  return (
    typeof lastRunAt === "number" &&
    Date.now() - lastRunAt < MANUAL_RATE_LIMIT_MS
  );
}

function gateBySourceIds(
  gates: readonly JevMergeGateDecision[] | undefined,
): Map<string, JevMergeGateDecision> {
  const map = new Map<string, JevMergeGateDecision>();
  if (gates === undefined) return map;
  for (const gate of gates) {
    const key = clusterSourceKey(gate.sourceMemoryIds);
    if (!map.has(key)) map.set(key, gate);
  }
  return map;
}

function resolveClusterKeeper(
  cluster: MemoryWithTags[],
  gate: JevMergeGateDecision | undefined,
): MemoryWithTags {
  const heuristic = pickClusterKeeper(cluster);
  if (gate === undefined || gate.outcome !== "approve") return heuristic;
  const override = cluster.find((memory) => memory.id === gate.keeperId);
  return override ?? heuristic;
}

function recordGateOutcome(
  result: DreamRunResult,
  outcome: JevMergeGateOutcome,
): void {
  switch (outcome) {
    case "approve":
      result.jevApproved += 1;
      return;
    case "reject":
      result.jevRejected += 1;
      return;
    case "abstain":
      result.jevSkipped += 1;
      return;
    case "fail-open":
      result.failOpen += 1;
  }
}

function shouldAutoAccept(args: {
  autoAccept: boolean;
  gate: JevMergeGateDecision | undefined;
}): boolean {
  if (!args.autoAccept) return false;
  if (args.gate === undefined || args.gate.outcome === "fail-open") {
    return true;
  }
  return args.gate.safeToAutoAccept;
}

async function insertClusterProposal(
  ctx: Parameters<typeof insertProposedUpdate>[0],
  args: {
    clerkId: string;
    profileId: string;
    autoAccept: boolean;
    cluster: { memories: MemoryWithTags[]; score: number };
    gate: JevMergeGateDecision | undefined;
  },
): Promise<"proposal" | "materialized"> {
  const keeper = resolveClusterKeeper(args.cluster.memories, args.gate);
  const ids = args.cluster.memories.map((memory) => memory.id);
  const proposal = await insertProposedUpdate(ctx, {
    userId: args.clerkId,
    profileId: args.profileId,
    memoryId: keeper.id,
    proposedTitle: keeper.title,
    proposedContent: keeper.content,
    reason:
      "These memories are near-duplicate records of the same information; approving replaces them with this consolidation.",
    kind: "merge",
    sourceMemoryIds: ids,
    confidence: args.cluster.score,
    source: "dream-mode",
    memorySnapshot: { title: keeper.title, content: keeper.content },
    sourceMemorySnapshots: args.cluster.memories.map((memory) => ({
      id: memory.id,
      title: memory.title,
      content: memory.content,
    })),
  });

  if (shouldAutoAccept({ autoAccept: args.autoAccept, gate: args.gate })) {
    const resolved = await resolveProposedUpdate(ctx, {
      clerkId: args.clerkId,
      proposalId: proposal.id,
      action: "approve",
    });
    if (resolved?.status === "approved") return "materialized";
  }
  return "proposal";
}

export const runDreamPassInternal = internalMutation({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
    kind: v.union(v.literal("personal"), v.literal("team")),
    autoAccept: v.boolean(),
    maxClusters: v.optional(v.number()),
    clusterGates: v.optional(v.array(clusterGateValidator)),
  },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const memories =
      args.kind === "team"
        ? await collectScopedMemories(ctx, {
            kind: "team",
            profileId: args.profileId,
          })
        : await collectScopedMemories(ctx, {
            kind: "personal",
            userId: args.clerkId,
            profileId: args.profileId,
          });
    const visible = memories.filter((memory) => isVisibleStatus(memory.status));
    if (visible.length === 0) return emptyDreamResult("no-recent-memories");

    const clusters = clusterNearDuplicateMemories(visible, {
      limit: args.maxClusters ?? DEFAULT_MERGE_CLUSTERS,
    });
    const result = emptyDreamResult("ok");
    result.clustersScanned = clusters.length;
    const gates = gateBySourceIds(args.clusterGates);

    for (const cluster of clusters) {
      const ids = cluster.memories.map((memory) => memory.id);
      const overlapping = await hasOverlappingPendingProposal(ctx, {
        userId: args.clerkId,
        profileId: args.profileId,
        sourceMemoryIds: ids,
      });
      if (overlapping) continue;

      const gate = gates.get(clusterSourceKey(ids));
      const outcome: JevMergeGateOutcome = gate?.outcome ?? "fail-open";
      recordGateOutcome(result, outcome);
      if (outcome === "reject" || outcome === "abstain") continue;

      const inserted = await insertClusterProposal(ctx, {
        clerkId: args.clerkId,
        profileId: args.profileId,
        autoAccept: args.autoAccept,
        cluster,
        gate,
      });
      if (inserted === "materialized") result.memoriesMaterialized += 1;
      else result.proposalsCreated += 1;
    }

    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (profileId) {
      const profile = await ctx.db.get(profileId);
      if (profile) {
        await ctx.db.patch(profileId, { lastDreamRunAt: Date.now() });
      }
    }

    return result;
  },
});

async function runDreamPassForProfile(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    profileId: string;
    kind: "personal" | "team";
    autoAccept: boolean;
    apiKey: string | undefined;
  },
): Promise<DreamRunResult> {
  const memories =
    args.kind === "team"
      ? await ctx.runQuery(
          internal.memoryStore.functions.collectScopedMemoriesInternal,
          { kind: "team", profileId: args.profileId },
        )
      : await ctx.runQuery(
          internal.memoryStore.functions.collectScopedMemoriesInternal,
          {
            kind: "personal",
            userId: args.clerkId,
            profileId: args.profileId,
          },
        );
  const visible = memories.filter((memory) => isVisibleStatus(memory.status));
  if (visible.length === 0) return emptyDreamResult("no-recent-memories");

  const clusters = clusterNearDuplicateMemories(visible, {
    limit: DEFAULT_MERGE_CLUSTERS,
  });
  const clusterGates = await judgeDreamMergeClusters({
    clusters: clusters.map((cluster) => ({
      memories: cluster.memories,
      heuristicKeeperId: pickClusterKeeper(cluster.memories).id,
    })),
    autoAccept: args.autoAccept,
    apiKey: args.apiKey,
  });
  return ctx.runMutation(internal.dreamMode.runDreamPassInternal, {
    clerkId: args.clerkId,
    profileId: args.profileId,
    kind: args.kind,
    autoAccept: args.autoAccept,
    clusterGates,
  });
}

async function runDreamForClerk(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    userId: Id<"users">;
    profileId?: Id<"profiles">;
    rateLimit: boolean;
    notify: boolean;
  },
): Promise<DreamRunResult> {
  const config = await ctx.runQuery(
    internal.userSettings.getDreamConfigInternal,
    {
      userId: args.userId,
    },
  );
  if (args.rateLimit && isRateLimited(config.lastDreamRunAt)) {
    return emptyDreamResult("rate-limited");
  }

  const autoAccept = config.dreamModeAutoAccept;
  const apiKey = await resolveSystemOneApiKey(ctx, args.clerkId);
  let aggregate = emptyDreamResult("ok");

  if (args.profileId !== undefined) {
    const profile = await ctx.runQuery(internal.profiles.getByIdInternal, {
      profileId: args.profileId,
    });
    if (!profile) return emptyDreamResult("no-recent-memories");
    const kind = profile.teamId === undefined ? "personal" : "team";
    aggregate = await runDreamPassForProfile(ctx, {
      clerkId: args.clerkId,
      profileId: args.profileId,
      kind,
      autoAccept,
      apiKey,
    });
  } else {
    const profiles = await ctx.runQuery(
      internal.profiles.listPersonalByUserIdInternal,
      { userId: args.userId },
    );
    if (profiles.length === 0) return emptyDreamResult("no-recent-memories");
    let anyMemories = false;
    for (const profile of profiles) {
      const pass = await runDreamPassForProfile(ctx, {
        clerkId: args.clerkId,
        profileId: profile._id,
        kind: "personal",
        autoAccept,
        apiKey,
      });
      if (pass.reason !== "no-recent-memories") anyMemories = true;
      aggregate = addDreamResults(aggregate, { ...pass, reason: "ok" });
    }
    if (!anyMemories) aggregate.reason = "no-recent-memories";
  }

  console.info("[dream-mode] jev merge gate", {
    reason: aggregate.reason,
    clustersScanned: aggregate.clustersScanned,
    jevApproved: aggregate.jevApproved,
    jevRejected: aggregate.jevRejected,
    jevSkipped: aggregate.jevSkipped,
    failOpen: aggregate.failOpen,
    keyed: apiKey !== undefined,
  });

  await ctx.runMutation(internal.userSettings.setLastDreamRunAtInternal, {
    userId: args.userId,
    timestamp: Date.now(),
  });

  if (
    args.notify &&
    (aggregate.proposalsCreated > 0 || aggregate.memoriesMaterialized > 0)
  ) {
    const parts: string[] = [];
    if (aggregate.proposalsCreated > 0) {
      parts.push(
        `${String(aggregate.proposalsCreated)} proposal${aggregate.proposalsCreated === 1 ? "" : "s"} to review`,
      );
    }
    if (aggregate.memoriesMaterialized > 0) {
      parts.push(
        `${String(aggregate.memoriesMaterialized)} new memor${aggregate.memoriesMaterialized === 1 ? "y" : "ies"}`,
      );
    }
    await ctx.runMutation(internal.notifications.pushInternal, {
      userId: args.userId,
      title: "Dream Mode finished",
      description: `${parts.join(" and ")}. Open the Inbox to review.`,
      type: "info",
    });
  }

  return aggregate;
}

export const runDreamForUser = authAction({
  args: {},
  handler: async (ctx): Promise<DreamRunResult> => {
    const clerkId = await requireClerkId(ctx);
    const result = await runDreamForClerk(ctx, {
      clerkId,
      userId: ctx.userId,
      rateLimit: true,
      notify: false,
    });
    await auditLog.log(ctx, {
      action: "dream_mode.manual_run",
      actorId: ctx.userId,
      resourceType: ResourceTypes.USER,
      resourceId: ctx.userId,
      metadata: {
        reason: result.reason,
        proposalsCreated: result.proposalsCreated,
        memoriesMaterialized: result.memoriesMaterialized,
        clustersScanned: result.clustersScanned,
        reweighted: result.reweighted,
        jevSkipped: result.jevSkipped,
        jevApproved: result.jevApproved,
        jevRejected: result.jevRejected,
        failOpen: result.failOpen,
      },
      severity: "info",
    });
    return result;
  },
});

export const runDreamForUserById = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: args.userId,
    });
    if (!clerkId) return emptyDreamResult("no-key");
    return runDreamForClerk(ctx, {
      clerkId,
      userId: args.userId,
      rateLimit: false,
      notify: true,
    });
  },
});

export const runDreamForProfileById = internalAction({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const profile = await ctx.runQuery(internal.profiles.getByIdInternal, {
      profileId: args.profileId,
    });
    if (!profile) return emptyDreamResult("no-recent-memories");
    let ownerUserId = profile.userId;
    if (profile.teamId !== undefined) {
      const resolvedOwner = await ctx.runQuery(
        internal.teams.getOwnerUserIdInternal,
        { teamId: profile.teamId },
      );
      if (resolvedOwner !== null) ownerUserId = resolvedOwner;
    }
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: ownerUserId,
    });
    if (!clerkId) return emptyDreamResult("no-key");
    return runDreamForClerk(ctx, {
      clerkId,
      userId: ownerUserId,
      profileId: args.profileId,
      rateLimit: false,
      notify: true,
    });
  },
});

export const maybeRunDreamInternal = internalAction({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const inputs = await ctx.runQuery(
      internal.dreamTrigger.getDecisionInputsInternal,
      { clerkId: args.clerkId },
    );
    if (!inputs) return null;

    const decision = decideDreamCheck(
      inputs.state,
      inputs.automaticEnabled,
      Date.now(),
    );

    if (decision.action === "reschedule") {
      await ctx.scheduler.runAfter(
        decision.delayMs,
        internal.dreamMode.maybeRunDreamInternal,
        { clerkId: args.clerkId },
      );
      return null;
    }

    if (decision.action === "stop") {
      await ctx.runMutation(internal.dreamTrigger.clearPendingInternal, {
        userId: inputs.userId,
      });
      return null;
    }

    await ctx.runMutation(internal.dreamTrigger.consumeRunInternal, {
      userId: inputs.userId,
    });
    await ctx.runAction(internal.dreamMode.runDreamForUserById, {
      userId: inputs.userId,
    });
    return null;
  },
});
