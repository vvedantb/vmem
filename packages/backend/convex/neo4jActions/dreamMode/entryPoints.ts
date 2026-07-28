"use node";

import type { GenericActionCtx } from "convex/server";
import { internalAction } from "../../_generated/server";
import type { DataModel, Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { decideDreamCheck } from "../../lib/dreamTriggerDecision";
import {
  accumulateDreamResult,
  dreamDepthValidator,
  emptyDreamResult,
  pickAggregateReason,
  type DreamRunResult,
} from "./runProfile";

const MANUAL_RATE_LIMIT_MS = 60 * 60 * 1000;

type DreamActionCtx = GenericActionCtx<DataModel>;

function isRateLimited(lastRunAt: number | null | undefined): boolean {
  return (
    typeof lastRunAt === "number" &&
    Date.now() - lastRunAt < MANUAL_RATE_LIMIT_MS
  );
}

// resolve clerkId for a scheduled dream actor. returns no-key result on miss
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

// notify after an *unattended* run (cron) that actually produced something
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

    // derived memories need a real clerkId owner: clerkId-scoped subsystems (openRouter auth, memory events, embedding budgets) require one
    // team access is profileId-routed, so ownership does not gate reads. resolve the current team owner, not profile.userId (ownership can change after team creation)
    let ownerUserId = profile.userId;
    if (profile.teamId !== undefined) {
      const resolvedOwner = await ctx.runQuery(
        internal.teams.getOwnerUserIdInternal,
        { teamId: profile.teamId },
      );
      if (resolvedOwner !== null) ownerUserId = resolvedOwner;
    }

    return runScheduledAndNotify(
      ctx,
      ownerUserId,
      `owner of ${args.profileId}`,
      (clerkId) =>
        ctx.runAction(
          internal.neo4jActions.dreamMode.runDreamForProfileInternal,
          { clerkId, profileId: args.profileId },
        ),
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
    const aggregate = emptyDreamResult("ok");
    const profileResults: DreamRunResult[] = [];

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
      profileResults.push(result);
      accumulateDreamResult(aggregate, result);
    }
    aggregate.reason = pickAggregateReason(profileResults);

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
