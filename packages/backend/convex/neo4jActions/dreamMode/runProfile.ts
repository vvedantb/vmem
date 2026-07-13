"use node";

import { internalAction, type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { v } from "convex/values";
import { computeContentHash } from "../../../engine/neo4j/memory/mappers";
import {
  applyConfidenceAdjustments,
  computeSurprisalScores,
  fetchAnomalyCluster,
  fetchPortraitEvidence,
  findMergeCandidates,
  findRecentMemoriesForDream,
  materializeSynthesisAsMemory,
} from "../../../engine/neo4j/memory/dreamMode";
import {
  buildPortraitUpdatePrompt,
  parsePortraitResponse,
  type ParsedPortrait,
} from "../../../engine/neo4j/portraitPrompt";
import { scheduleContextPromptInvalidation } from "../_memories/shared";
import {
  createSynthesisProposal,
  hasOverlappingPendingProposal,
} from "../../../engine/neo4j/memory/proposals";
import { getDriver } from "../../../engine/neo4j/driver";
import { callJsonChat, generateEmbedding } from "../../lib/openRouter";
import { postMaterializeEmbedAndEnrich } from "../_memories/postMaterialize";
import {
  buildDreamSynthesisPrompt,
  buildMergeSynthesisPrompt,
  parseDreamSynthesisResponse,
  parseMergeSynthesisResponse,
  type DreamClusterMember,
  type ParsedSynthesis,
} from "../../../engine/neo4j/dreamPrompt";
import { tryUserAndApiKeyByClerkId } from "../../lib/envVars";
import type { DreamDepth } from "../../lib/dreamTriggerDecision";

/**
 * Hard caps for one Dream Mode pass. Keeps cost predictable per user/day:
 *   - 1 vector query per recent memory (cheap, indexed)
 *   - 1 LLM call per anomaly cluster (~5–10 calls/run/user typical)
 */
const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // never dreamt: last 7 days
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // dreamt long ago: cap at 30d
const RECENT_MEMORY_LIMIT = 100;
const SURPRISAL_NEIGHBORS = 5;
const MAX_CLUSTER_SIZE = 8;
const CONFIDENCE_FLOOR = 0.6;
const DEDUP_OVERLAP_THRESHOLD = 0.5;
/** Cosine floor for two memories to count as near-duplicate merge candidates. */
const MERGE_SIM_THRESHOLD = 0.88;
/** Merge clusters cap at fewer members than anomaly clusters — a "merge"
 *  of 8 memories is a rewrite, not a consolidation. */
const MAX_MERGE_CLUSTER_SIZE = 5;
/** Reweighting can move a memory's confidence at most this far per dream. */
const REWEIGHT_MAX_DELTA = 0.2;
/** Portrait refreshes when the run changed anything, or at least this often. */
const PORTRAIT_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** Evidence memories the portrait prompt sees per refresh. */
const PORTRAIT_EVIDENCE_LIMIT = 30;

/** Convex validator for the depth arg (single definition, reused by the
 *  user-wide wrapper in entryPoints.ts). */
export const dreamDepthValidator = v.union(
  v.literal("light"),
  v.literal("standard"),
  v.literal("deep"),
);

/**
 * Dynamic Dreaming — how deep one pass goes. Depth is decided by the
 * trigger from how much new context piled up (see `depthForCount`);
 * manual button and daily cron run "standard".
 */
const DEPTH_PARAMS: Record<
  DreamDepth,
  { topAnomalies: number; mergeClusters: number }
> = {
  light: { topAnomalies: 5, mergeClusters: 2 },
  standard: { topAnomalies: 10, mergeClusters: 4 },
  deep: { topAnomalies: 15, mergeClusters: 6 },
};

/** Manual button rate-limit: at most one run per profile per hour. */
export const MANUAL_RATE_LIMIT_MS = 60 * 60 * 1000;

export interface DreamRunResult {
  proposalsCreated: number;
  memoriesMaterialized: number;
  clustersScanned: number;
  /** Memories whose confidence the reconsolidation pass adjusted. */
  reweighted: number;
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

type SynthesisProposalKind =
  | "insight"
  | "connection"
  | "contradiction"
  | "anomaly"
  | "merge";

/**
 * Dedup guard shared by the anomaly propose-path and the merge pass: skip
 * synthesis whose source memories overlap an already-pending proposal.
 */
async function isOverlappingPendingProposal(
  driver: ReturnType<typeof getDriver>,
  clerkId: string,
  sourceMemoryIds: string[],
  logLabel?: string,
): Promise<boolean> {
  const overlaps = await hasOverlappingPendingProposal(driver, {
    userId: clerkId,
    sourceMemoryIds,
    overlapThreshold: DEDUP_OVERLAP_THRESHOLD,
  });
  if (overlaps && logLabel) {
    console.log(
      `[dream] dedup skip — overlapping pending proposal for ${logLabel}`,
    );
  }
  return overlaps;
}

/**
 * File a dream synthesis as a :ProposedUpdate and emit the matching
 * activity event. Shared by the anomaly propose-path and the merge pass.
 */
async function fileDreamProposal(
  ctx: ActionCtx,
  driver: ReturnType<typeof getDriver>,
  clerkId: string,
  result: DreamRunResult,
  proposal: {
    kind: SynthesisProposalKind;
    title: string;
    content: string;
    reason: string;
    sourceMemoryIds: string[];
    confidence: number;
  },
): Promise<void> {
  const created = await createSynthesisProposal(driver, {
    userId: clerkId,
    kind: proposal.kind,
    proposedTitle: proposal.title,
    proposedContent: proposal.content,
    reason: proposal.reason,
    sourceMemoryIds: proposal.sourceMemoryIds,
    confidence: proposal.confidence,
  });
  result.proposalsCreated += 1;

  await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
    clerkId,
    eventType: "dream_synthesis_proposed",
    memoryId: created.id,
    payload: JSON.stringify({
      kind: proposal.kind,
      sourceMemoryIds: proposal.sourceMemoryIds,
      confidence: proposal.confidence,
    }),
  });
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
    /** How deep to dream — set by the dynamic trigger. Default "standard". */
    depth: v.optional(dreamDepthValidator),
  },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const result: DreamRunResult = {
      proposalsCreated: 0,
      memoriesMaterialized: 0,
      clustersScanned: 0,
      reweighted: 0,
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
        : (args.autoAcceptOverride ?? profile.dreamModeAutoAccept === true);
    const depthParams = DEPTH_PARAMS[args.depth ?? "standard"];

    const driver = getDriver();

    // 1. Recent memories with embeddings. Window = since the last dream
    // run (each memory seeds exactly one dream; it stays reachable later
    // as a cluster neighbour), capped at 30d for users returning after a
    // long gap, defaulting to 7d when this profile has never dreamt.
    const now = Date.now();
    const sinceMs = Math.max(
      profile.lastDreamRunAt ?? now - DEFAULT_WINDOW_MS,
      now - MAX_WINDOW_MS,
    );
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

    // 2. Surprisal scoring — one Neo4j session for the whole pool.
    const scored = await computeSurprisalScores(driver, {
      userId: args.clerkId,
      memories: recent,
      k: SURPRISAL_NEIGHBORS,
    });
    scored.sort((a, b) => b.surprisal - a.surprisal);
    const topAnomalies = scored.slice(0, depthParams.topAnomalies);
    console.log(
      `[dream] profile=${args.profileId} recent=${String(recent.length)} scored=${String(scored.length)} top=${String(topAnomalies.length)}`,
    );

    // 3-7. Cluster + LLM + dedup + materialize/propose.
    for (const anomaly of topAnomalies) {
      try {
        const cluster = await fetchAnomalyCluster(driver, {
          userId: args.clerkId,
          anomalyId: anomaly.id,
          embedding: anomaly.embedding,
          maxClusterSize: MAX_CLUSTER_SIZE,
        });
        // Even with the semantic top-up a seed can come back alone (tiny
        // corpus, nothing above the similarity floor) — nothing to do.
        if (cluster.length < 2) continue;

        result.clustersScanned += 1;

        const synthesis = await callSynthesisLLM(
          ctx,
          auth.apiKey,
          auth.userId,
          args.profileId,
          cluster,
        );
        if (!synthesis) continue;

        // Reconsolidation reweighting rides along on every synthesis
        // response (including "skip") — auto-applied with an audit event
        // per change, pinned memories exempt.
        if (synthesis.confidenceAdjustments.length > 0) {
          result.reweighted += await applyConfidenceAdjustments(driver, {
            userId: args.clerkId,
            adjustments: synthesis.confidenceAdjustments,
            maxDelta: REWEIGHT_MAX_DELTA,
          });
        }

        if (synthesis.type === "skip") continue;
        if (synthesis.confidence < CONFIDENCE_FLOOR) continue;
        if (synthesis.sourceMemoryIds.length === 0) continue;

        // Dedup against pending dream-mode proposals.
        if (
          await isOverlappingPendingProposal(
            driver,
            args.clerkId,
            synthesis.sourceMemoryIds,
            synthesis.title,
          )
        ) {
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

          await postMaterializeEmbedAndEnrich(ctx, driver, {
            clerkId: args.clerkId,
            memoryId: newMemoryId,
            title: synthesis.title,
            content: synthesis.content,
            profileId: args.profileId,
            feature: "dream-materialize",
            failureLog:
              "[dream] embedding failed for materialized memory, continuing without",
            embeddingAtCreate: embedding,
          });

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
          await fileDreamProposal(ctx, driver, args.clerkId, result, {
            kind: synthesis.type,
            title: synthesis.title,
            content: synthesis.content,
            reason: synthesis.reason,
            sourceMemoryIds: synthesis.sourceMemoryIds,
            confidence: synthesis.confidence,
          });
        }
      } catch (e) {
        console.error(`[dream] cluster failed for anomaly ${anomaly.id}`, e);
      }
    }

    // 8. Reconsolidation: merge near-duplicate fragments. Detection is
    // the inverse of the surprisal pass (duplicates score LOW), so it
    // gets its own sweep over the same recent pool. Merges are ALWAYS
    // proposals — approval suppresses the source memories, which is too
    // consequential for auto-accept.
    try {
      const mergeClusters = await findMergeCandidates(driver, {
        userId: args.clerkId,
        profileId: args.profileId,
        pool: recent,
        simThreshold: MERGE_SIM_THRESHOLD,
        maxClusters: depthParams.mergeClusters,
        maxClusterSize: MAX_MERGE_CLUSTER_SIZE,
      });
      for (const cluster of mergeClusters) {
        result.clustersScanned += 1;
        const rawText = await callJsonChat(ctx, {
          apiKey: auth.apiKey,
          userId: auth.userId,
          profileId: args.profileId,
          feature: "dream-synthesis",
          role: "You are a memory reconsolidation system.",
          prompt: buildMergeSynthesisPrompt(cluster),
          temperature: 0.2,
        });
        if (rawText === null) continue;
        const merge = parseMergeSynthesisResponse(
          rawText,
          cluster.map((m) => m.id),
        );
        if (!merge) continue;
        if (merge.confidence < CONFIDENCE_FLOOR) continue;

        if (
          await isOverlappingPendingProposal(
            driver,
            args.clerkId,
            merge.sourceMemoryIds,
          )
        ) {
          continue;
        }

        await fileDreamProposal(ctx, driver, args.clerkId, result, {
          kind: "merge",
          title: merge.title,
          content: merge.content,
          reason:
            "These memories are near-duplicate records of the same information; approving replaces them with this consolidation.",
          sourceMemoryIds: merge.sourceMemoryIds,
          confidence: merge.confidence,
        });
      }
    } catch (e) {
      console.error(
        `[dream] merge pass failed for profile ${args.profileId}`,
        e,
      );
    }

    // 9. Evolving portrait — revise the profile's "who this user is"
    // summary when this run changed anything, or when the portrait is
    // missing/stale. Incremental: the current portrait goes into the
    // prompt and the model keeps/revises/drops against fresh evidence.
    try {
      const producedOutput =
        result.proposalsCreated +
          result.memoriesMaterialized +
          result.reweighted >
        0;
      const portraitStale =
        profile.dreamPortraitUpdatedAt === undefined ||
        Date.now() - profile.dreamPortraitUpdatedAt > PORTRAIT_REFRESH_MS;
      if (producedOutput || portraitStale) {
        const evidence = await fetchPortraitEvidence(driver, {
          userId: args.clerkId,
          profileId: args.profileId,
          limit: PORTRAIT_EVIDENCE_LIMIT,
        });
        if (evidence.length > 0) {
          const rawText = await callJsonChat(ctx, {
            apiKey: auth.apiKey,
            userId: auth.userId,
            profileId: args.profileId,
            feature: "dream-portrait",
            role: "You maintain a grounded user portrait for a memory system.",
            prompt: buildPortraitUpdatePrompt(
              profile.dreamPortrait ?? null,
              evidence,
            ),
            temperature: 0.2,
          });
          let portrait: ParsedPortrait | null = null;
          if (rawText !== null) {
            portrait = parsePortraitResponse(
              rawText,
              evidence.map((m) => m.id),
            );
          }
          if (portrait) {
            await ctx.runMutation(internal.profiles.setDreamPortraitInternal, {
              profileId: args.profileId,
              portrait: portrait.portrait,
              sourceMemoryIds: portrait.sourceMemoryIds,
            });
            // The MCP context prompt embeds the portrait — refresh it.
            await scheduleContextPromptInvalidation(ctx, args.clerkId);
          }
        }
      }
    } catch (e) {
      console.error(
        `[dream] portrait update failed for profile ${args.profileId}`,
        e,
      );
    }

    // Stamp lastDreamRunAt for rate-limit accounting.
    await ctx.runMutation(internal.profiles.setLastDreamRunAtInternal, {
      profileId: args.profileId,
      timestamp: Date.now(),
    });

    console.log(
      `[dream] profile=${args.profileId} done: proposals=${String(result.proposalsCreated)} materialized=${String(result.memoriesMaterialized)} clusters=${String(result.clustersScanned)} reweighted=${String(result.reweighted)}`,
    );
    return result;
  },
});
