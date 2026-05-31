"use node";

import { internalAction, type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { v } from "convex/values";
import {
  computeContentHash,
  computeSurprisalScore,
  createSynthesisProposal,
  fetchAnomalyCluster,
  findRecentMemoriesForDream,
  hasOverlappingPendingProposal,
  materializeSynthesisAsMemory,
} from "../../../src/neo4j/memoryService";
import { getDriver } from "../../../src/neo4j/driver";
import { callJsonChat, generateEmbedding } from "../../lib/openRouter";
import {
  buildDreamSynthesisPrompt,
  parseDreamSynthesisResponse,
  type DreamClusterMember,
  type ParsedSynthesis,
} from "../../../src/neo4j/dreamPrompt";
import { tryUserAndApiKeyByClerkId } from "../../lib/envVars";

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
export const MANUAL_RATE_LIMIT_MS = 60 * 60 * 1000;

export interface DreamRunResult {
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
  const rawText = await callJsonChat(ctx, {
    apiKey,
    userId,
    profileId,
    feature: "dream-synthesis",
    role: "You are a memory-graph synthesis system.",
    prompt,
    temperature: 0.2,
  });

  if (rawText === null) return null;

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

    const driver = getDriver();

    // 1. Recent memories with embeddings.
    const sinceMs = Date.now() - RECENT_WINDOW_MS;
    const recent = await findRecentMemoriesForDream(driver, {
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
      const surprisal = await computeSurprisalScore(driver, {
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
        const cluster = await fetchAnomalyCluster(driver, {
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
        const overlaps = await hasOverlappingPendingProposal(driver, {
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
          const { id: newMemoryId } = await materializeSynthesisAsMemory(
            driver,
            {
              userId: args.clerkId,
              profileId: args.profileId,
              title: synthesis.title,
              content: synthesis.content,
              embedding,
              contentHash,
              sourceMemoryIds: synthesis.sourceMemoryIds,
              confidence: synthesis.confidence,
            },
          );
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
          const proposal = await createSynthesisProposal(driver, {
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
