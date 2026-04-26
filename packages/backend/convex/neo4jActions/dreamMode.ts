"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  MemoryService,
  computeContentHash,
} from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { generateEmbedding } from "../../src/neo4j/embeddingService";
import {
  buildDreamSynthesisPrompt,
  parseDreamSynthesisResponse,
  type DreamClusterMember,
  type ParsedSynthesis,
} from "../../src/neo4j/dreamPrompt";
import { tryUserEnvVarByClerkId } from "../lib/envVars";

const LLM_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
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

/** Safely extract the text content from an OpenRouter chat completion. */
function extractLLMContent(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const choices = Reflect.get(json, "choices");
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) return undefined;
  const message: unknown = Reflect.get(first, "message");
  if (typeof message !== "object" || message === null) return undefined;
  const content: unknown = Reflect.get(message, "content");
  return typeof content === "string" ? content : undefined;
}

async function callSynthesisLLM(
  apiKey: string,
  cluster: DreamClusterMember[],
): Promise<ParsedSynthesis | null> {
  const prompt = buildDreamSynthesisPrompt(cluster);
  const res = await fetch(LLM_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vmem.vedantb.com",
      "X-Title": "vmem",
    },
    body: JSON.stringify({
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
    }),
  });

  if (!res.ok) {
    console.error(`[dream] OpenRouter ${String(res.status)}`);
    return null;
  }

  const json: unknown = await res.json();
  const rawText = extractLLMContent(json);
  if (typeof rawText !== "string") return null;

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
  },
  handler: async (ctx, args): Promise<DreamRunResult> => {
    const result: DreamRunResult = {
      proposalsCreated: 0,
      memoriesMaterialized: 0,
      clustersScanned: 0,
      reason: "ok",
    };

    // Resolve API key — graceful skip if user hasn't configured one.
    const apiKey = await tryUserEnvVarByClerkId(
      ctx,
      args.clerkId,
      "OPENROUTER_API_KEY",
    );
    if (!apiKey) {
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

        const synthesis = await callSynthesisLLM(apiKey, cluster);
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

        if (autoAccept && synthesis.type !== "contradiction") {
          // Auto-accept path: materialize as :Memory + :DERIVED_FROM.
          // Contradictions never auto-materialize — they need a human to
          // pick a side.
          let embedding: number[] | null = null;
          try {
            embedding = await generateEmbedding(
              apiKey,
              `${synthesis.title}\n\n${synthesis.content}`,
            );
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
