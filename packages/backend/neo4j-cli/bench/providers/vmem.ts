/**
 * vmem provider — the system under test.
 *
 * Drives vmem's PRODUCTION engine code paths from the CLI:
 *   ingest:  bench extraction prompt → per-fact hybrid retrieval →
 *            production ADD/UPDATE/DELETE/NONE decision → engine
 *            create/update/delete with full dedup → production enrichment
 *            (tags/entities/RELATES_TO).
 *   search:  production `retrieveMemories` (RRF fusion, graph expansion, MMR).
 *
 * Documented deviations from production (see internal/bench report):
 *   - LLM calls go through the CLI OpenRouter client, not Convex `callJsonChat`
 *     (same prompts, same models).
 *   - UPDATE/DELETE proposals are auto-applied (no human review step).
 *   - Bench-specific multi-speaker extraction prompt.
 *   - No Convex scheduler: extraction → decision → enrichment run inline.
 *
 * Isolation: each conversation lives under a synthetic userId
 * `bench_locomo_<conversationId>_<runId>`. With `--user`, ingestion instead
 * runs under a real clerkId (for visual inspection in the web graph) and
 * reset is scoped to bench-tagged memories only.
 */

import type { Driver } from "neo4j-driver";
import {
  createMemory,
  deleteMemory,
  finalizeDedupHit,
  findMemoryByContentHash,
  findMemoryBySimilarity,
  updateMemory,
} from "../../../engine/neo4j/memory/crud";
import { computeContentHash } from "../../../engine/neo4j/memory/mappers";
import { retrieveMemories } from "../../../engine/neo4j/memory/retrieve";
import { setEmbeddings } from "../../../engine/neo4j/memory/migration";
import { applyEnrichment } from "../../../engine/neo4j/memory/enrichment";
import { getRecentMemoryTitles } from "../../../engine/neo4j/memory/search";
import { getTopTags } from "../../../engine/neo4j/memory/tags";
import { getTopEntities } from "../../../engine/neo4j/memory/entities";
import {
  buildFullEnrichmentPrompt,
  parseFullEnrichmentResponse,
} from "../../../convex/prompts/enrichmentPrompt";
import {
  buildUpdateDecisionPrompt,
  parseFactExtractionResponse,
  parseUpdateDecisionResponse,
  type RetrievedCandidate,
} from "../../../convex/prompts/v2Prompt";
import {
  buildBenchExtractionPrompt,
  renderSessionTranscript,
} from "./vmemExtractPrompt";
import type { BenchLlm } from "../llm";
import {
  approxTokens,
  type MemoryProvider,
  type BenchSearchOutcome,
} from "./types";
import type { LocomoSession } from "../datasets/locomo";

const BENCH_SOURCE = "locomo-bench";
const SYNTHETIC_PREFIX = "bench_locomo_";
const DECISION_TOP_K = 10;
const ENRICH_ROLE = "You are a memory tagging and entity extraction system.";

export interface VmemProviderConfig {
  runId: string;
  driver: Driver;
  /** Memory-side reasoning model (extraction, decision, enrichment). */
  llm: BenchLlm;
  embed: (text: string) => Promise<number[]>;
  /** Real clerkId to ingest under (visual inspection). Omit for synthetic. */
  userOverride?: string;
  /** Profile id paired with userOverride. */
  profileOverride?: string;
}

export class VmemProvider implements MemoryProvider {
  readonly name = "vmem";

  constructor(private readonly config: VmemProviderConfig) {}

  private userId(conversationId: string): string {
    return (
      this.config.userOverride ??
      `${SYNTHETIC_PREFIX}${conversationId}_${this.config.runId}`
    );
  }

  private profileId(conversationId: string): string {
    return this.config.profileOverride ?? this.userId(conversationId);
  }

  async reset(conversationId: string): Promise<void> {
    const userId = this.userId(conversationId);
    const session = this.config.driver.session();
    try {
      if (userId.startsWith(SYNTHETIC_PREFIX)) {
        // Synthetic user: full wipe of everything carrying this userId.
        await session.run(`MATCH (c:Chunk {userId: $userId}) DETACH DELETE c`, {
          userId,
        });
        await session.run(
          `MATCH (e:Entity {userId: $userId}) DETACH DELETE e`,
          { userId },
        );
        await session.run(
          `MATCH (m:Memory {userId: $userId})
           OPTIONAL MATCH (ev:MemoryEvent)-[:EVENT_FOR]->(m)
           DETACH DELETE ev, m`,
          { userId },
        );
      } else {
        // Real user: only remove bench-tagged memories, never their own data.
        await session.run(
          `MATCH (m:Memory {userId: $userId, source: $source})
           OPTIONAL MATCH (c:Chunk {memoryId: m.id})
           OPTIONAL MATCH (ev:MemoryEvent)-[:EVENT_FOR]->(m)
           DETACH DELETE c, ev, m`,
          { userId, source: BENCH_SOURCE },
        );
      }
    } finally {
      await session.close();
    }
  }

  async ingestSession(
    conversationId: string,
    session: LocomoSession,
    speakerA: string,
    speakerB: string,
  ): Promise<void> {
    const transcript = renderSessionTranscript(session.turns);
    if (transcript.trim().length === 0) return;

    const extractionRaw = await this.config.llm.chatJson(
      buildBenchExtractionPrompt(
        transcript,
        session.dateTime,
        speakerA,
        speakerB,
      ),
    );
    if (!extractionRaw) return;
    const extracted = parseFactExtractionResponse(extractionRaw);
    if (!extracted) return;

    for (const fact of extracted.facts) {
      await this.applyFact(conversationId, fact.text);
    }
  }

  /** Run one fact through retrieval → decision → create/update/delete. */
  private async applyFact(
    conversationId: string,
    factText: string,
  ): Promise<void> {
    const userId = this.userId(conversationId);
    const factEmbedding = await this.embedSafe(factText);

    const candidates = await retrieveMemories(this.config.driver, {
      userId,
      query: factText,
      queryEmbedding: factEmbedding,
      limit: DECISION_TOP_K,
    });

    const decisionCandidates: RetrievedCandidate[] = candidates.map((c) => ({
      id: c.id,
      text: c.title ? `${c.title}\n${c.content}` : c.content,
    }));

    const decisionRaw = await this.config.llm.chatJson(
      buildUpdateDecisionPrompt(factText, decisionCandidates),
    );
    if (!decisionRaw) return;
    const decision = parseUpdateDecisionResponse(decisionRaw);
    if (!decision) return;

    if (decision.event === "ADD" && decision.text) {
      await this.createWithDedup(conversationId, decision.text);
    } else if (decision.event === "UPDATE" && decision.id && decision.text) {
      await this.applyUpdate(conversationId, decision.id, decision.text);
    } else if (decision.event === "DELETE" && decision.id) {
      await deleteMemory(this.config.driver, userId, decision.id);
    }
    // NONE → no-op.
  }

  /** Mirror of `runCreateMemory` dedup chain (hash + 0.95 similarity). */
  private async createWithDedup(
    conversationId: string,
    text: string,
  ): Promise<void> {
    const userId = this.userId(conversationId);
    const title = text.slice(0, 80);
    const contentHash = computeContentHash(title, text);

    const hashMatch = await findMemoryByContentHash(
      this.config.driver,
      userId,
      contentHash,
    );
    if (hashMatch) {
      await finalizeDedupHit(this.config.driver, userId, hashMatch.id);
      return;
    }

    const embedding = await this.embedSafe(`${title}\n\n${text}`);
    if (embedding) {
      const semanticMatch = await findMemoryBySimilarity(
        this.config.driver,
        userId,
        embedding,
        0.95,
      );
      if (semanticMatch) {
        await finalizeDedupHit(this.config.driver, userId, semanticMatch.id);
        return;
      }
    }

    const created = await createMemory(this.config.driver, {
      userId,
      profileId: this.profileId(conversationId),
      title,
      content: text,
      type: "knowledge",
      source: BENCH_SOURCE,
      tags: [],
      confidence: 0.9,
      embedding,
      contentHash,
      sourceType: BENCH_SOURCE,
    });

    await this.enrich(userId, created.id, title, text);
  }

  private async applyUpdate(
    conversationId: string,
    memoryId: string,
    text: string,
  ): Promise<void> {
    const userId = this.userId(conversationId);
    const title = text.slice(0, 80);
    const updated = await updateMemory(this.config.driver, userId, memoryId, {
      title,
      content: text,
    });
    if (!updated) return;

    // Re-embed: updateMemory does not touch the (now stale) embedding.
    const embedding = await this.embedSafe(`${title}\n\n${text}`);
    if (embedding) {
      await setEmbeddings(this.config.driver, [{ id: memoryId, embedding }]);
    }
    await this.enrich(userId, memoryId, title, text);
  }

  /** Production enrichment: vocabulary-aware tags + entities + RELATES_TO. */
  private async enrich(
    userId: string,
    memoryId: string,
    title: string,
    content: string,
  ): Promise<void> {
    const [recent, topTags, topEntities] = await Promise.all([
      getRecentMemoryTitles(this.config.driver, userId, memoryId),
      getTopTags(this.config.driver, userId, 50),
      getTopEntities(this.config.driver, userId, 150),
    ]);

    const prompt = buildFullEnrichmentPrompt(
      title,
      content,
      recent,
      topTags,
      topEntities.map((e) => ({ name: e.name, type: e.type })),
    );
    const raw = await this.config.llm.chatJson(prompt, ENRICH_ROLE);
    if (!raw) return;
    const parsed = parseFullEnrichmentResponse(raw);
    if (!parsed) return;

    const validIds = new Set(recent.map((m) => m.id));
    const relatedIds = parsed.relatedMemoryIds.filter((id) => validIds.has(id));

    await applyEnrichment(
      this.config.driver,
      memoryId,
      userId,
      parsed.tags,
      relatedIds,
      parsed.entities,
    );
  }

  async search(
    conversationId: string,
    query: string,
    k: number,
  ): Promise<BenchSearchOutcome> {
    const userId = this.userId(conversationId);
    const queryEmbedding = await this.embedSafe(query);

    const start = performance.now();
    const candidates = await retrieveMemories(this.config.driver, {
      userId,
      query,
      queryEmbedding,
      limit: k,
    });
    const latencyMs = Math.round(performance.now() - start);

    const results = candidates.map((c) => ({
      id: c.id,
      text: c.title ? `${c.title}\n${c.content}` : c.content,
      score: c.trace.score,
    }));
    const contextTokens = results.reduce(
      (sum, r) => sum + approxTokens(r.text),
      0,
    );

    return { results, latencyMs, contextTokens };
  }

  private async embedSafe(text: string): Promise<number[] | null> {
    try {
      return await this.config.embed(text);
    } catch (err) {
      console.warn(
        `[vmem] embedding failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
