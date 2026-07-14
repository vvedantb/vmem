"use node";

import type { GenericActionCtx } from "convex/server";
import { internalAction } from "../../_generated/server";
import type { DataModel, Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { decideDreamCheck } from "../../lib/dreamTriggerDecision";
import { dreamDepthValidator, type DreamRunResult } from "./runProfile";

const MANUAL_RATE_LIMIT_MS = 60 * 60 * 1000;

type DreamActionCtx = GenericActionCtx<DataModel>;

function emptyDreamResult(reason: DreamRunResult["reason"]): DreamRunResult {
  return {
    proposalsCreated: 0,
    memoriesMaterialized: 0,
    clustersScanned: 0,
    reweighted: 0,
    reason,
  };
}

function isRateLimited(lastRunAt: number | null | undefined): boolean {
  return (
    typeof lastRunAt === "number" &&
    Date.now() - lastRunAt < MANUAL_RATE_LIMIT_MS
  );
}

/** Resolve clerkId for a scheduled dream actor; returns no-key result on miss. */
async function withClerkId(
  ctx: DreamActionCtx,
  userId: Id<"users">,
  warnContext: string,
  run: (clerkId: string) => Promise<DreamRunResult>,
): Promise<DreamRunResult> {
  const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
    userId,
  });
  if (!clerkId) {
    console.warn(`[dream] scheduled run: no clerkId for ${warnContext}`);
    return emptyDreamResult("no-key");
  }
  return run(clerkId);
}

/**
 * Notify after an *unattended* run (cron) that actually produced something.
 * Manual runs already report back through the UI, and a silent "found nothing"
 * run is not worth an inbox row.
 */
async function notifyScheduledDreamResult(
  ctx: DreamActionCtx,
  userId: Id<"users">,
  result: DreamRunResult,
): Promise<void> {
  const { proposalsCreated, memoriesMaterialized } = result;
  if (proposalsCreated === 0 && memoriesMaterialized === 0) return;

  const parts: string[] = [];
  if (proposalsCreated > 0) {
    parts.push(
      `${String(proposalsCreated)} proposal${proposalsCreated === 1 ? "" : "s"} to review`,
    );
  }
  if (memoriesMaterialized > 0) {
    parts.push(
      `${String(memoriesMaterialized)} new memor${memoriesMaterialized === 1 ? "y" : "ies"}`,
    );
  }

  await ctx.runMutation(internal.notifications.pushInternal, {
    userId,
    title: "Dream Mode finished",
    description: `${parts.join(" and ")}. Open the Inbox to review.`,
    type: "info",
  });
}

async function runScheduledAndNotify(
  ctx: DreamActionCtx,
  userId: Id<"users">,
  warnContext: string,
  run: (clerkId: string) => Promise<DreamRunResult>,
): Promise<DreamRunResult> {
  return withClerkId(ctx, userId, warnContext, async (clerkId) => {
    const result = await run(clerkId);
    await notifyScheduledDreamResult(ctx, userId, result);
    return result;
  });
}

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
        internal.neo4jActions.dreamMode.maybeRunDreamInternal,
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
    console.log(
      `[dream] dynamic trigger fired: user=${inputs.userId} depth=${decision.depth} newMemories=${String(inputs.state.newMemoryCount)}`,
    );
    await ctx.runAction(
      internal.neo4jActions.dreamMode.runDreamForUserInternal,
      { clerkId: args.clerkId, userId: inputs.userId, depth: decision.depth },
    );
    return null;
  },
});

export const runDreamForProfileById = internalAction({
  args: {
    profileId: v.id("profiles"),
  },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const profile = await ctx.runQuery(internal.profiles.getByIdInternal, {
      profileId: args.profileId,
    });
    if (!profile) {
      console.warn(
        `[dream] scheduled run: profile ${args.profileId} not found`,
      );
      return emptyDreamResult("no-recent-memories");
    }

    return runScheduledAndNotify(
      ctx,
      profile.userId,
      `owner of ${args.profileId}`,
      (clerkId) =>
        ctx.runAction(
          internal.neo4jActions.dreamMode.runDreamForProfileInternal,
          { clerkId, profileId: args.profileId },
        ),
    );
  },
});

export const runDreamForActiveProfile = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.id("profiles"),
  },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const profile = await ctx.runQuery(internal.profiles.getByIdInternal, {
      profileId: args.profileId,
    });
    if (!profile) {
      throw new Error("Profile not found");
    }

    if (isRateLimited(profile.lastDreamRunAt)) {
      return emptyDreamResult("rate-limited");
    }

    return ctx.runAction(
      internal.neo4jActions.dreamMode.runDreamForProfileInternal,
      {
        clerkId: args.clerkId,
        profileId: args.profileId,
      },
    );
  },
});

export const runDreamForUserInternal = internalAction({
  args: {
    clerkId: v.string(),
    userId: v.id("users"),
    forceProposals: v.optional(v.boolean()),
    depth: v.optional(dreamDepthValidator),
  },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const aggregate: DreamRunResult = {
      proposalsCreated: 0,
      memoriesMaterialized: 0,
      clustersScanned: 0,
      reweighted: 0,
      reason: "ok",
    };

    const personalProfiles = await ctx.runQuery(
      internal.profiles.listPersonalByUserIdInternal,
      { userId: args.userId },
    );
    if (personalProfiles.length === 0) {
      aggregate.reason = "no-recent-memories";
      await ctx.runMutation(internal.userSettings.setLastDreamRunAtInternal, {
        userId: args.userId,
        timestamp: Date.now(),
      });
      return aggregate;
    }

    const config = await ctx.runQuery(
      internal.userSettings.getDreamConfigInternal,
      { userId: args.userId },
    );

    let nonOkReason: DreamRunResult["reason"] | null = null;
    let okSeen = false;
    for (const profile of personalProfiles) {
      const result = await ctx.runAction(
        internal.neo4jActions.dreamMode.runDreamForProfileInternal,
        {
          clerkId: args.clerkId,
          profileId: profile._id,
          forceProposals: args.forceProposals,
          autoAcceptOverride: config.dreamModeAutoAccept,
          depth: args.depth,
        },
      );
      aggregate.proposalsCreated += result.proposalsCreated;
      aggregate.memoriesMaterialized += result.memoriesMaterialized;
      aggregate.clustersScanned += result.clustersScanned;
      aggregate.reweighted += result.reweighted;
      if (result.reason === "ok") {
        okSeen = true;
      } else if (nonOkReason === null) {
        nonOkReason = result.reason;
      }
    }
    aggregate.reason = okSeen ? "ok" : (nonOkReason ?? "ok");

    await ctx.runMutation(internal.userSettings.setLastDreamRunAtInternal, {
      userId: args.userId,
      timestamp: Date.now(),
    });

    console.log(
      `[dream] user=${args.userId} done: profiles=${String(personalProfiles.length)} proposals=${String(aggregate.proposalsCreated)} materialized=${String(aggregate.memoriesMaterialized)} clusters=${String(aggregate.clustersScanned)}`,
    );
    return aggregate;
  },
});

export const runDreamForUserById = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<DreamRunResult> =>
    runScheduledAndNotify(ctx, args.userId, `user ${args.userId}`, (clerkId) =>
      ctx.runAction(internal.neo4jActions.dreamMode.runDreamForUserInternal, {
        clerkId,
        userId: args.userId,
      }),
    ),
});

export const runDreamForActiveUser = internalAction({
  args: {
    clerkId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const config = await ctx.runQuery(
      internal.userSettings.getDreamConfigInternal,
      { userId: args.userId },
    );
    if (isRateLimited(config.lastDreamRunAt)) {
      return emptyDreamResult("rate-limited");
    }
    return ctx.runAction(
      internal.neo4jActions.dreamMode.runDreamForUserInternal,
      { clerkId: args.clerkId, userId: args.userId },
    );
  },
});
