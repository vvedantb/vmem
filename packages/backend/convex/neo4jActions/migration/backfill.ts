"use node";

import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import {
  applyEntitiesOnly,
  computeContentHash,
  createSemanticEdgesForMemory,
  getRecentMemoryTitles,
  listMissingContentHash,
  listMissingEmbeddings,
  listMissingEntities,
  listMissingSemanticEdges,
  markEntityExtracted,
  markSemanticEdgesProcessed,
  setContentHashes,
  setEmbeddings,
} from "../../../src/neo4j/memoryService";
import { getDriver } from "../../../src/neo4j/driver";
import { callJsonChat, generateEmbeddings } from "../../lib/openRouter";
import { tryUserAndApiKeyByClerkId } from "../../lib/envVars";
import {
  buildFullEnrichmentPrompt,
  parseFullEnrichmentResponse,
} from "../../../src/enrichmentPrompt";
export const backfillEmbeddingsInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const BATCH = args.batchSize ?? 50;
    const driver = getDriver();

    const rows = await listMissingEmbeddings(driver, BATCH);
    if (rows.length === 0) {
      console.log("embedding backfill: drained");
      return { done: true, processed: 0 };
    }

    // Group rows by userId so we resolve each user's key exactly once and
    // send one batched HTTP request per user.
    const byUser = new Map<string, Array<{ id: string; text: string }>>();
    for (const r of rows) {
      const existing = byUser.get(r.userId) ?? [];
      existing.push({ id: r.id, text: `${r.title}\n\n${r.content}` });
      byUser.set(r.userId, existing);
    }

    let processed = 0;
    for (const [clerkId, items] of byUser) {
      try {
        const auth = await tryUserAndApiKeyByClerkId(
          ctx,
          clerkId,
          "OPENROUTER_API_KEY",
        );
        if (!auth) {
          console.warn(
            `embedding backfill: skipping user ${clerkId} (no OPENROUTER_API_KEY)`,
          );
          continue;
        }
        // Backfill batches across mixed profileIds — attribution is at the
        // user level, the openRouterLogs row is left without a profileId
        // and surfaces under "uncategorised backfill" on the dashboard.
        const vectors = await generateEmbeddings({
          ctx,
          apiKey: auth.apiKey,
          userId: auth.userId,
          feature: "embedding-backfill",
          texts: items.map((x) => x.text),
        });
        const writes: Array<{ id: string; embedding: number[] }> = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const vec = vectors[i];
          if (item && vec) {
            writes.push({ id: item.id, embedding: vec });
          }
        }
        await setEmbeddings(driver, writes);
        processed += writes.length;
      } catch (e) {
        console.error(`embedding backfill: user ${clerkId} batch failed`, e);
        // Swallow and continue with other users — next run retries this one.
      }
    }

    // Reschedule ourselves to drain the next batch. runAfter(0) queues
    // immediately but yields control so this invocation can return.
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.migration.backfillEmbeddingsInternal,
      { batchSize: BATCH },
    );

    return { done: false, processed };
  },
});

/**
 * Convenience kickoff action. Call once from the Convex dashboard to start
 * the self-rescheduling backfill.
 */
export const startEmbeddingBackfill = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.migration.backfillEmbeddingsInternal,
      {},
    );
    return { started: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Semantic-edge backfill
//
// Creates RELATES_TO {reason: 'semantic similarity'} edges for memories that
// already have embeddings but were saved before auto-linking was added.
// Same self-rescheduling cursor pattern as embedding backfill above.
//
// Kick off via Convex dashboard:
//   internal.neo4jActions.migration.startSemanticEdgesBackfill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process one batch of memories missing semantic edges. Fetches memories
 * with embeddings but no `semanticEdgesAt`, runs vector search for each,
 * creates RELATES_TO edges, marks processed, and reschedules if more remain.
 */
export const backfillSemanticEdgesInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const BATCH = args.batchSize ?? 50;
    const driver = getDriver();

    const rows = await listMissingSemanticEdges(driver, BATCH);
    if (rows.length === 0) {
      console.log("semantic-edge backfill: drained");
      return { done: true, processed: 0 };
    }

    let processed = 0;
    const processedIds: string[] = [];

    for (const row of rows) {
      try {
        await createSemanticEdgesForMemory(
          driver,
          row.id,
          row.userId,
          row.embedding,
        );
        processedIds.push(row.id);
        processed++;
      } catch (e) {
        console.error(`semantic-edge backfill: failed for memory ${row.id}`, e);
        // Mark it processed anyway to avoid infinite retry on a bad node
        processedIds.push(row.id);
      }
    }

    if (processedIds.length > 0) {
      await markSemanticEdgesProcessed(driver, processedIds);
    }

    console.log(
      `semantic-edge backfill: processed ${processed}/${rows.length}, rescheduling`,
    );

    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.migration.backfillSemanticEdgesInternal,
      { batchSize: BATCH },
    );

    return { done: false, processed };
  },
});

/**
 * Convenience kickoff action for semantic-edge backfill.
 * Call once from the Convex dashboard.
 */
export const startSemanticEdgesBackfill = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.migration.backfillSemanticEdgesInternal,
      {},
    );
    return { started: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Entity extraction backfill
//
// Runs LLM enrichment on memories that have never had entity extraction.
// Smaller batch size (20) since each memory requires an LLM call.
// Same self-rescheduling cursor pattern as embedding/semantic backfills.
//
// Kick off via Convex dashboard:
//   internal.neo4jActions.migration.startEntityBackfill
// ─────────────────────────────────────────────────────────────────────────────

export const backfillEntitiesInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const BATCH = args.batchSize ?? 20;
    const driver = getDriver();

    const rows = await listMissingEntities(driver, BATCH);
    if (rows.length === 0) {
      console.log("entity backfill: drained");
      return { done: true, processed: 0 };
    }

    // Group by userId so we resolve API keys once per user
    const byUser = new Map<
      string,
      Array<{
        id: string;
        profileId: string | null;
        title: string;
        content: string;
      }>
    >();
    for (const r of rows) {
      const existing = byUser.get(r.userId) ?? [];
      existing.push({
        id: r.id,
        profileId: r.profileId,
        title: r.title,
        content: r.content,
      });
      byUser.set(r.userId, existing);
    }

    let processed = 0;
    const processedIds: string[] = [];

    for (const [clerkId, items] of byUser) {
      try {
        const auth = await tryUserAndApiKeyByClerkId(
          ctx,
          clerkId,
          "OPENROUTER_API_KEY",
        );
        if (!auth) {
          console.warn(
            `entity backfill: skipping user ${clerkId} (no OPENROUTER_API_KEY)`,
          );
          // Still mark as processed to avoid infinite retry
          for (const item of items) processedIds.push(item.id);
          continue;
        }

        // Get recent memory titles for the enrichment prompt context
        const existingMemories = await getRecentMemoryTitles(
          driver,
          clerkId,
          "",
        );

        for (const item of items) {
          try {
            const prompt = buildFullEnrichmentPrompt(
              item.title,
              item.content,
              existingMemories,
            );

            const llmContent = await callJsonChat(ctx, {
              apiKey: auth.apiKey,
              userId: auth.userId,
              profileId: item.profileId ?? undefined,
              feature: "entity-backfill",
              role: "You are a memory tagging and entity extraction system.",
              prompt,
            });

            if (llmContent === null) {
              console.error(`entity backfill: LLM failed for ${item.id}`);
              processedIds.push(item.id);
              continue;
            }

            const parsed = parseFullEnrichmentResponse(llmContent);
            if (parsed && parsed.entities.length > 0) {
              await applyEntitiesOnly(
                driver,
                item.id,
                clerkId,
                parsed.entities,
              );
            }
            processedIds.push(item.id);
            processed++;
          } catch (e) {
            console.error(`entity backfill: failed for memory ${item.id}`, e);
            processedIds.push(item.id);
          }
        }
      } catch (e) {
        console.error(`entity backfill: user ${clerkId} batch failed`, e);
        for (const item of items) processedIds.push(item.id);
      }
    }

    if (processedIds.length > 0) {
      await markEntityExtracted(driver, processedIds);
    }

    console.log(
      `entity backfill: processed ${processed}/${rows.length}, rescheduling`,
    );

    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.migration.backfillEntitiesInternal,
      { batchSize: BATCH },
    );

    return { done: false, processed };
  },
});

/**
 * Convenience kickoff action for entity extraction backfill.
 * Call once from the Convex dashboard.
 */
export const startEntityBackfill = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.migration.backfillEntitiesInternal,
      {},
    );
    return { started: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Content-hash backfill
//
// Computes and writes contentHash for all memories that don't have one yet.
// Pure CPU work (MD5), no external API calls — safe to run with large batches.
// Same self-rescheduling cursor pattern as the other backfills.
//
// Kick off via Convex dashboard:
//   internal.neo4jActions.migration.startContentHashBackfill
// ─────────────────────────────────────────────────────────────────────────────

export const backfillContentHashInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const BATCH = args.batchSize ?? 200;
    const driver = getDriver();

    const rows = await listMissingContentHash(driver, BATCH);
    if (rows.length === 0) {
      console.log("content-hash backfill: drained");
      return { done: true, processed: 0 };
    }

    const updates: Array<{ id: string; contentHash: string }> = [];
    for (const row of rows) {
      updates.push({
        id: row.id,
        contentHash: computeContentHash(row.title, row.content),
      });
    }

    await setContentHashes(driver, updates);

    console.log(
      `content-hash backfill: processed ${updates.length}, rescheduling`,
    );

    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.migration.backfillContentHashInternal,
      { batchSize: BATCH },
    );

    return { done: false, processed: updates.length };
  },
});

/**
 * Convenience kickoff action for content-hash backfill.
 * Call once from the Convex dashboard.
 */
export const startContentHashBackfill = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.migration.backfillContentHashInternal,
      {},
    );
    return { started: true };
  },
});
