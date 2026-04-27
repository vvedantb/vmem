"use node";

import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import {
  MemoryService,
  computeContentHash,
} from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { callOpenRouterChat, generateEmbedding } from "../lib/openRouter";
import {
  buildDreamSynthesisPrompt,
  parseDreamSynthesisResponse,
  type DreamClusterMember,
  type ParsedSynthesis,
} from "../../src/neo4j/dreamPrompt";
import { tryUserAndApiKeyByClerkId } from "../lib/envVars";

const LLM_MODEL = "qwen/qwen3-235b-a22b-2507";

/**
 * Hard caps for one Dream Mode pass. Keeps cost predictable per user/day:
 *   - 1 vector query per recent memory (cheap, indexed)
 *   - 1 LLM call per anomaly cluster (~5–10 calls/run/user typical)
 */
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // last 7 days
const RECENT_MEMORY_LIMIT = 100;
const SURPRISAL_NEIGHBORS = 5;
const TOP_ANOMALY_COUNT = 10;
const MAX_CLUSTER_SIZE = 8;
const CONFIDENCE_FLOOR = 0.6;
const DEDUP_OVERLAP_THRESHOLD = 0.5;

/** Manual button rate-limit: at most one run per profile per hour. */
const MANUAL_RATE_LIMIT_MS = 60 * 60 * 1000;

interface DreamRunResult {
  proposalsCreated: number;
  memoriesMaterialized: number;
  clustersScanned: number;
  reason: "ok" | "no-key" | "no-recent-memories" | "rate-limited";
}

async function callSynthesisLLM(
  ctx: ActionCtx,
  apiKey: string,
  userId: Id<"users">,
  profileId: Id<"profiles">,
  cluster: DreamClusterMember[],
): Promise<ParsedSynthesis | null> {
  const prompt = buildDreamSynthesisPrompt(cluster);
  const { content: rawText, ok } = await callOpenRouterChat(ctx, {
    apiKey,
    userId,
    profileId,
    feature: "dream-synthesis",
    model: LLM_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a memory-graph synthesis system. Respond with ONLY valid JSON. No thinking, no markdown.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  if (!ok || rawText === null) return null;

  return parseDreamSynthesisResponse(
    rawText,
    cluster.map((m) => m.id),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-profile orchestrator
//
// One pass over a single profile:
//   1. Fetch recent memories with embeddings (last 7d, capped)
//   2. Score each by surprisal (1 - mean cosine similarity to k-NN)
//   3. Take top N anomalies, fetch each one's 1-hop graph cluster
//   4. Send each cluster to the LLM for synthesis
//   5. Filter out skip / low-confidence / duplicate-of-pending proposals
//   6. Branch on profile.dreamModeAutoAccept:
//        - true  → materialize as :Memory directly
//        - false → file as :ProposedUpdate (default)
//   7. Stamp lastDreamRunAt regardless of result for rate-limit accounting
// ─────────────────────────────────────────────────────────────────────────────

export const runDreamForProfileInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.id("profiles"),
    /** When true, skip the dreamModeAutoAccept toggle and always file proposals. Used for testing. */
    forceProposals: v.optional(v.boolean()),
    /**
     * When set, used instead of `profile.dreamModeAutoAccept`. The user-level
     * wrapper passes the user's `userSettings.dreamModeAutoAccept` here so
     * personal profiles (which no longer carry their own dream-mode fields
     * after the user-wide migration) can still respect the user's choice.
     */
    autoAcceptOverride: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const result: DreamRunResult = {
      proposalsCreated: 0,
      memoriesMaterialized: 0,
      clustersScanned: 0,
      reason: "ok",
    };

    // Resolve API key — graceful skip if user hasn't configured one.
    const auth = await tryUserAndApiKeyByClerkId(
      ctx,
      args.clerkId,
      "OPENROUTER_API_KEY",
    );
    if (!auth) {
      console.log(
        `[dream] No OPENROUTER_API_KEY for ${args.clerkId}, skipping`,
      );
      result.reason = "no-key";
      return result;
    }

    // Resolve profile config (autoAccept).
    const profile = await ctx.runQuery(internal.profiles.getByIdInternal, {
      profileId: args.profileId,
    });
    if (!profile) {
      console.warn(`[dream] profile ${args.profileId} not found`);
      return result;
    }
    const autoAccept =
      args.forceProposals === true
        ? false
        : args.autoAcceptOverride !== undefined
          ? args.autoAcceptOverride
          : profile.dreamModeAutoAccept === true;

    const service = new MemoryService(getDriver());

    // 1. Recent memories with embeddings.
    const sinceMs = Date.now() - RECENT_WINDOW_MS;
    const recent = await service.findRecentMemoriesForDream({
      userId: args.clerkId,
      profileId: args.profileId,
      sinceMs,
      limit: RECENT_MEMORY_LIMIT,
    });
    if (recent.length === 0) {
      console.log(`[dream] no recent memories for profile ${args.profileId}`);
      result.reason = "no-recent-memories";
      // Still stamp lastDreamRunAt so manual button rate-limit applies.
      await ctx.runMutation(internal.profiles.setLastDreamRunAtInternal, {
        profileId: args.profileId,
        timestamp: Date.now(),
      });
      return result;
    }

    // 2. Surprisal scoring — vector queries are cheap, do all of them.
    const scored: Array<{ id: string; surprisal: number }> = [];
    for (const m of recent) {
      const surprisal = await service.computeSurprisalScore({
        userId: args.clerkId,
        memoryId: m.id,
        embedding: m.embedding,
        k: SURPRISAL_NEIGHBORS,
      });
      if (surprisal !== null) {
        scored.push({ id: m.id, surprisal });
      }
    }
    scored.sort((a, b) => b.surprisal - a.surprisal);
    const topAnomalies = scored.slice(0, TOP_ANOMALY_COUNT);
    console.log(
      `[dream] profile=${args.profileId} recent=${String(recent.length)} scored=${String(scored.length)} top=${String(topAnomalies.length)}`,
    );

    // 3-7. Cluster + LLM + dedup + materialize/propose.
    for (const anomaly of topAnomalies) {
      try {
        const cluster = await service.fetchAnomalyCluster({
          userId: args.clerkId,
          anomalyId: anomaly.id,
          maxClusterSize: MAX_CLUSTER_SIZE,
        });
        if (cluster.length < 2) continue; // need at least one neighbor

        result.clustersScanned += 1;

        const synthesis = await callSynthesisLLM(
          ctx,
          auth.apiKey,
          auth.userId,
          args.profileId,
          cluster,
        );
        if (!synthesis) continue;
        if (synthesis.type === "skip") continue;
        if (synthesis.confidence < CONFIDENCE_FLOOR) continue;
        if (synthesis.sourceMemoryIds.length === 0) continue;

        // Dedup against pending dream-mode proposals.
        const overlaps = await service.hasOverlappingPendingProposal({
          userId: args.clerkId,
          sourceMemoryIds: synthesis.sourceMemoryIds,
          overlapThreshold: DEDUP_OVERLAP_THRESHOLD,
        });
        if (overlaps) {
          console.log(
            `[dream] dedup skip — overlapping pending proposal for ${synthesis.title}`,
          );
          continue;
        }

        // Materializable kinds. Contradictions and anomalies are flags —
        // they go to the proposals queue regardless of auto-accept and the
        // user dismisses them by hand (no new memory ever gets created).
        const isMaterializable =
          synthesis.type === "insight" || synthesis.type === "connection";

        if (autoAccept && isMaterializable) {
          // Auto-accept path: materialize as :Memory + :DERIVED_FROM.
          let embedding: number[] | null = null;
          try {
            embedding = await generateEmbedding({
              ctx,
              apiKey: auth.apiKey,
              userId: auth.userId,
              profileId: args.profileId,
              feature: "dream-materialize",
              text: `${synthesis.title}\n\n${synthesis.content}`,
            });
          } catch (e) {
            console.warn(
              `[dream] embedding failed for materialized memory, continuing without`,
              e,
            );
          }
          const contentHash = computeContentHash(
            synthesis.title,
            synthesis.content,
          );
          const { id: newMemoryId } =
            await service.materializeSynthesisAsMemory({
              userId: args.clerkId,
              profileId: args.profileId,
              title: synthesis.title,
              content: synthesis.content,
              embedding,
              contentHash,
              sourceMemoryIds: synthesis.sourceMemoryIds,
              confidence: synthesis.confidence,
            });
          result.memoriesMaterialized += 1;

          // Run the same enrichment pipeline regular memories get — tags,
          // entities, RELATES_TO edges. Without this, materialized
          // memories sit as orphan nodes with only DERIVED_FROM edges,
          // which made them useless in graph view.
          await ctx.scheduler.runAfter(
            0,
            internal.neo4jActions.enrichment.enrichMemoryInternal,
            {
              clerkId: args.clerkId,
              memoryId: newMemoryId,
              title: synthesis.title,
              content: synthesis.content,
              profileId: args.profileId,
            },
          );

          await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
            clerkId: args.clerkId,
            eventType: "dream_synthesis_materialized",
            memoryId: newMemoryId,
            payload: JSON.stringify({
              kind: synthesis.type,
              sourceMemoryIds: synthesis.sourceMemoryIds,
              confidence: synthesis.confidence,
            }),
          });
        } else {
          // Default path: file a synthesis :ProposedUpdate.
          const proposal = await service.createSynthesisProposal({
            userId: args.clerkId,
            kind: synthesis.type,
            proposedTitle: synthesis.title,
            proposedContent: synthesis.content,
            reason: synthesis.reason,
            sourceMemoryIds: synthesis.sourceMemoryIds,
            confidence: synthesis.confidence,
          });
          result.proposalsCreated += 1;

          await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
            clerkId: args.clerkId,
            eventType: "dream_synthesis_proposed",
            memoryId: proposal.id,
            payload: JSON.stringify({
              kind: synthesis.type,
              sourceMemoryIds: synthesis.sourceMemoryIds,
              confidence: synthesis.confidence,
            }),
          });
        }
      } catch (e) {
        console.error(`[dream] cluster failed for anomaly ${anomaly.id}`, e);
      }
    }

    // Stamp lastDreamRunAt for rate-limit accounting.
    await ctx.runMutation(internal.profiles.setLastDreamRunAtInternal, {
      profileId: args.profileId,
      timestamp: Date.now(),
    });

    console.log(
      `[dream] profile=${args.profileId} done: proposals=${String(result.proposalsCreated)} materialized=${String(result.memoriesMaterialized)} clusters=${String(result.clustersScanned)}`,
    );
    return result;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-profile cron entry point — wired to dynamically-registered crons via
// `@convex-dev/crons`. Each user-scheduled profile gets its own cron whose
// args are just `{ profileId }`; we resolve the owner's clerkId at fire
// time so a clerkId rotation doesn't leave a stale cron pointing at the
// wrong identity.
// ─────────────────────────────────────────────────────────────────────────────

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
  },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const aggregate: DreamRunResult = {
      proposalsCreated: 0,
      memoriesMaterialized: 0,
      clustersScanned: 0,
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
        },
      );
      aggregate.proposalsCreated += result.proposalsCreated;
      aggregate.memoriesMaterialized += result.memoriesMaterialized;
      aggregate.clustersScanned += result.clustersScanned;
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
