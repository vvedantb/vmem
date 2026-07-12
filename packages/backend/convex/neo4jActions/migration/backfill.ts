"use node";

import type { FunctionReference } from "convex/server";
import { internalAction } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { applyEntitiesOnly } from "../../../engine/neo4j/memory/enrichment";
import { computeContentHash } from "../../../engine/neo4j/memory/mappers";
import {
  createSemanticEdgesForMemory,
  listMissingContentHash,
  listMissingEmbeddings,
  listMissingEntities,
  listMissingSemanticEdges,
  markEntityExtracted,
  markSemanticEdgesProcessed,
  setContentHashes,
  setEmbeddings,
} from "../../../engine/neo4j/memory/migration";
import { getDriver } from "../../../engine/neo4j/driver";
import type { Driver } from "neo4j-driver";
import { generateEmbeddings } from "../../lib/openRouter";
import { tryUserAndApiKeyByClerkId } from "../../lib/envVars";
import {
  callFullEnrichmentLlm,
  loadEnrichmentVocabulary,
} from "../enrichment/llm";

// ─────────────────────────────────────────────────────────────────────────────
// Shared self-rescheduling cursor pattern.
//
// Each backfill lists a batch, bails out (drained) when empty, otherwise does
// its work and reschedules itself via runAfter(0) to drain the next batch.
// ─────────────────────────────────────────────────────────────────────────────

type BackfillRef = FunctionReference<
  "action",
  "internal",
  { batchSize?: number },
  { done: boolean; processed: number }
>;

async function runReschedulingBackfill<Row>(
  ctx: ActionCtx,
  opts: {
    batchSize: number | undefined;
    batchDefault: number;
    drainedLabel: string;
    list: (driver: Driver, batch: number) => Promise<Row[]>;
    process: (driver: Driver, rows: Row[]) => Promise<number>;
    logProcessed?: (processed: number, total: number) => string;
    self: BackfillRef;
  },
): Promise<{ done: boolean; processed: number }> {
  const BATCH = opts.batchSize ?? opts.batchDefault;
  const driver = getDriver();

  const rows = await opts.list(driver, BATCH);
  if (rows.length === 0) {
    console.log(opts.drainedLabel);
    return { done: true, processed: 0 };
  }

  const processed = await opts.process(driver, rows);
  if (opts.logProcessed) {
    console.log(opts.logProcessed(processed, rows.length));
  }

  // Reschedule ourselves to drain the next batch. runAfter(0) queues
  // immediately but yields control so this invocation can return.
  await ctx.scheduler.runAfter(0, opts.self, { batchSize: BATCH });

  return { done: false, processed };
}

/** Group rows by userId so callers resolve each user's key/vocabulary once. */
function groupByUser<Row extends { userId: string }>(
  rows: Row[],
): Map<string, Row[]> {
  const byUser = new Map<string, Row[]>();
  for (const r of rows) {
    const existing = byUser.get(r.userId) ?? [];
    existing.push(r);
    byUser.set(r.userId, existing);
  }
  return byUser;
}

/**
 * Convenience kickoff action factory. Call the returned action once from the
 * Convex dashboard to start the self-rescheduling backfill.
 */
function makeKickoff(action: BackfillRef) {
  return internalAction({
    args: {},
    handler: async (ctx) => {
      await ctx.scheduler.runAfter(0, action, {});
      return { started: true };
    },
  });
}

export const backfillEmbeddingsInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ done: boolean; processed: number }> =>
    runReschedulingBackfill(ctx, {
      batchSize: args.batchSize,
      batchDefault: 50,
      drainedLabel: "embedding backfill: drained",
      list: listMissingEmbeddings,
      self: internal.neo4jActions.migration.backfillEmbeddingsInternal,
      process: async (driver, rows) => {
        // Group rows by userId so we resolve each user's key exactly once and
        // send one batched HTTP request per user.
        const byUser = groupByUser(rows);

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
              texts: items.map((x) => `${x.title}\n\n${x.content}`),
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
            console.error(
              `embedding backfill: user ${clerkId} batch failed`,
              e,
            );
            // Swallow and continue with other users — next run retries this one.
          }
        }
        return processed;
      },
    }),
});

export const startEmbeddingBackfill = makeKickoff(
  internal.neo4jActions.migration.backfillEmbeddingsInternal,
);

// ─────────────────────────────────────────────────────────────────────────────
// Semantic-edge backfill
//
// Creates RELATES_TO {reason: 'semantic similarity'} edges for memories that
// already have embeddings but were saved before auto-linking was added.
// ─────────────────────────────────────────────────────────────────────────────

export const backfillSemanticEdgesInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ done: boolean; processed: number }> =>
    runReschedulingBackfill(ctx, {
      batchSize: args.batchSize,
      batchDefault: 50,
      drainedLabel: "semantic-edge backfill: drained",
      list: listMissingSemanticEdges,
      self: internal.neo4jActions.migration.backfillSemanticEdgesInternal,
      logProcessed: (processed, total) =>
        `semantic-edge backfill: processed ${processed}/${total}, rescheduling`,
      process: async (driver, rows) => {
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
            console.error(
              `semantic-edge backfill: failed for memory ${row.id}`,
              e,
            );
            // Mark it processed anyway to avoid infinite retry on a bad node
            processedIds.push(row.id);
          }
        }

        if (processedIds.length > 0) {
          await markSemanticEdgesProcessed(driver, processedIds);
        }

        return processed;
      },
    }),
});

export const startSemanticEdgesBackfill = makeKickoff(
  internal.neo4jActions.migration.backfillSemanticEdgesInternal,
);

// ─────────────────────────────────────────────────────────────────────────────
// Entity extraction backfill
//
// Runs LLM enrichment on memories that have never had entity extraction.
// Smaller batch size (20) since each memory requires an LLM call.
// ─────────────────────────────────────────────────────────────────────────────

export const backfillEntitiesInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ done: boolean; processed: number }> =>
    runReschedulingBackfill(ctx, {
      batchSize: args.batchSize,
      batchDefault: 20,
      drainedLabel: "entity backfill: drained",
      list: listMissingEntities,
      self: internal.neo4jActions.migration.backfillEntitiesInternal,
      logProcessed: (processed, total) =>
        `entity backfill: processed ${processed}/${total}, rescheduling`,
      process: async (driver, rows) => {
        // Group by userId so we resolve API keys once per user
        const byUser = groupByUser(rows);

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

            const vocabulary = await loadEnrichmentVocabulary(driver, clerkId, {
              excludeMemoryId: "",
              includeEntities: true,
            });

            for (const item of items) {
              try {
                const parsed = await callFullEnrichmentLlm(ctx, auth, {
                  title: item.title,
                  content: item.content,
                  profileId: item.profileId ?? undefined,
                  feature: "entity-backfill",
                  vocabulary,
                });

                if (parsed === null) {
                  console.error(`entity backfill: LLM failed for ${item.id}`);
                  processedIds.push(item.id);
                  continue;
                }
                if (parsed.entities.length > 0) {
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
                console.error(
                  `entity backfill: failed for memory ${item.id}`,
                  e,
                );
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

        return processed;
      },
    }),
});

export const startEntityBackfill = makeKickoff(
  internal.neo4jActions.migration.backfillEntitiesInternal,
);

// ─────────────────────────────────────────────────────────────────────────────
// Content-hash backfill
//
// Computes and writes contentHash for all memories that don't have one yet.
// Pure CPU work (MD5), no external API calls — safe to run with large batches.
// ─────────────────────────────────────────────────────────────────────────────

export const backfillContentHashInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ done: boolean; processed: number }> =>
    runReschedulingBackfill(ctx, {
      batchSize: args.batchSize,
      batchDefault: 200,
      drainedLabel: "content-hash backfill: drained",
      list: listMissingContentHash,
      self: internal.neo4jActions.migration.backfillContentHashInternal,
      logProcessed: (processed) =>
        `content-hash backfill: processed ${processed}, rescheduling`,
      process: async (driver, rows) => {
        const updates = rows.map((row) => ({
          id: row.id,
          contentHash: computeContentHash(row.title, row.content),
        }));

        await setContentHashes(driver, updates);

        return updates.length;
      },
    }),
});

export const startContentHashBackfill = makeKickoff(
  internal.neo4jActions.migration.backfillContentHashInternal,
);
