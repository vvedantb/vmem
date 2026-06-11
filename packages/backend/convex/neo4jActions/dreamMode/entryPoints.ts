"use node";

import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { decideDreamCheck } from "../../lib/dreamTriggerDecision";
import {
  dreamDepthValidator,
  MANUAL_RATE_LIMIT_MS,
  type DreamRunResult,
} from "./runProfile";

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Dreaming check — scheduled (debounced) by memory writes via
// `lib/dreamTriggerInvalidate.ts`. Decides via the pure `decideDreamCheck`:
//   - user still writing → reschedule for the rest of the quiet window
//   - quiet + enough new memories (or a big pile-up) → consume the trigger
//     and run a user-wide dream pass at the decided depth
//   - guards fail (gap/cap/automatic off) → stand down; the counter
//     persists and the next write re-arms the check
// ─────────────────────────────────────────────────────────────────────────────

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
      return {
        proposalsCreated: 0,
        memoriesMaterialized: 0,
        clustersScanned: 0,
        reweighted: 0,
        reason: "no-recent-memories",
      };
    }
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: profile.userId,
    });
    if (!clerkId) {
      console.warn(
        `[dream] scheduled run: no clerkId for owner of ${args.profileId}`,
      );
      return {
        proposalsCreated: 0,
        memoriesMaterialized: 0,
        clustersScanned: 0,
        reweighted: 0,
        reason: "no-key",
      };
    }

    return await ctx.runAction(
      internal.neo4jActions.dreamMode.runDreamForProfileInternal,
      {
        clerkId,
        profileId: args.profileId,
      },
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Manual button entry — wired to the "Run Dream Mode" button on /proposals.
// Rate-limited: at most one run per profile per hour.
// ─────────────────────────────────────────────────────────────────────────────

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

    const lastRun = profile.lastDreamRunAt;
    if (typeof lastRun === "number") {
      const elapsed = Date.now() - lastRun;
      if (elapsed < MANUAL_RATE_LIMIT_MS) {
        return {
          proposalsCreated: 0,
          memoriesMaterialized: 0,
          clustersScanned: 0,
          reweighted: 0,
          reason: "rate-limited",
        };
      }
    }

    return await ctx.runAction(
      internal.neo4jActions.dreamMode.runDreamForProfileInternal,
      {
        clerkId: args.clerkId,
        profileId: args.profileId,
      },
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// User-wide orchestrator (Dream Mode V2)
//
// Personal profiles no longer carry their own schedule / auto-accept config —
// the user owns those settings on `userSettings`. This wrapper iterates every
// personal profile the user has, runs the per-profile pass on each, and
// aggregates the result. `lastDreamRunAt` is stamped on `userSettings` so the
// manual-button rate-limit applies user-wide (not per-profile, which would
// otherwise let users bypass the limit by having many profiles).
// ─────────────────────────────────────────────────────────────────────────────

export const runDreamForUserInternal = internalAction({
  args: {
    clerkId: v.string(),
    userId: v.id("users"),
    forceProposals: v.optional(v.boolean()),
    /** How deep to dream — set by the dynamic trigger. Default "standard". */
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

/**
 * Cron entrypoint — wired by `dreamSchedule.setDreamSchedule`. The cron
 * registration only carries `userId`; we resolve the clerkId at fire time.
 */
export const runDreamForUserById = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: args.userId,
    });
    if (!clerkId) {
      console.warn(`[dream] scheduled run: no clerkId for user ${args.userId}`);
      return {
        proposalsCreated: 0,
        memoriesMaterialized: 0,
        clustersScanned: 0,
        reweighted: 0,
        reason: "no-key",
      };
    }
    return await ctx.runAction(
      internal.neo4jActions.dreamMode.runDreamForUserInternal,
      { clerkId, userId: args.userId },
    );
  },
});

/**
 * Manual button entry — "Start Dreaming". Rate-limited to one run per hour
 * per user (not per profile — see comment on the user-wide orchestrator).
 */
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
    if (typeof config.lastDreamRunAt === "number") {
      const elapsed = Date.now() - config.lastDreamRunAt;
      if (elapsed < MANUAL_RATE_LIMIT_MS) {
        return {
          proposalsCreated: 0,
          memoriesMaterialized: 0,
          clustersScanned: 0,
          reweighted: 0,
          reason: "rate-limited",
        };
      }
    }
    return await ctx.runAction(
      internal.neo4jActions.dreamMode.runDreamForUserInternal,
      { clerkId: args.clerkId, userId: args.userId },
    );
  },
});
