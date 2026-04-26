"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  MemoryService,
  computeContentHash,
} from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { generateEmbeddings } from "../../src/neo4j/embeddingService";
import { tryUserEnvVarByClerkId } from "../lib/envVars";
import {
  buildFullEnrichmentPrompt,
  parseFullEnrichmentResponse,
} from "../../src/enrichmentPrompt";

interface MigrationResult {
  profileId: string;
  profileName: string;
  migratedCount: number;
}

/**
 * Migrate all memories without profileId to the user's default profile.
 * Used for existing users when the profiles feature is introduced.
 */
export const migrateMemoriesToDefaultProfile = internalAction({
  args: { userId: v.id("users") },
  returns: v.object({
    profileId: v.string(),
    profileName: v.string(),
    migratedCount: v.number(),
  }),
  handler: async (ctx, args): Promise<MigrationResult> => {
    // Get the user's Clerk ID
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: args.userId,
    });
    if (!clerkId) {
      throw new Error("User not found");
    }

    // Get or create default profile
    const defaultProfile = await ctx.runMutation(
      internal.profiles.getOrCreateDefaultByClerkIdInternal,
      { clerkId },
    );

    // Migrate memories
    const service = new MemoryService(getDriver());
    const migrated = await service.migrateMemoriesToProfile(
      clerkId,
      defaultProfile._id,
    );

    return {
      profileId: defaultProfile._id,
      profileName: defaultProfile.name,
      migratedCount: migrated,
    };
  },
});

/**
 * Count memories without profileId for a user.
 */
export const countMemoriesWithoutProfile = internalAction({
  args: { clerkId: v.string() },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.countMemoriesWithoutProfile(args.clerkId);
  },
});

/**
 * Count memories for a specific profile.
 */
export const countMemoriesByProfile = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.countMemoriesByProfile(args.clerkId, args.profileId);
  },
});

/**
 * Move memories from one profile to another (used when deleting a profile).
 */
export const moveMemoriesBetweenProfiles = internalAction({
  args: {
    clerkId: v.string(),
    fromProfileId: v.string(),
    toProfileId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.moveMemoriesBetweenProfiles(
      args.clerkId,
      args.fromProfileId,
      args.toProfileId,
    );
  },
});

/**
 * Delete all memories for a profile (used when deleting a profile without migration).
 */
export const deleteMemoriesByProfile = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.deleteMemoriesByProfile(args.clerkId, args.profileId);
  },
});

/**
 * Delete junk "same session" RELATES_TO edges from batch import sources.
 * One-time cleanup migration — run via Convex dashboard:
 *   internal.neo4jActions.migration.deleteJunkSessionEdges({ clerkId: "..." })
 */
export const deleteJunkSessionEdges = internalAction({
  args: { clerkId: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    const deleted = await service.deleteJunkSessionEdges(args.clerkId);
    console.log(
      `deleteJunkSessionEdges: removed ${deleted} edges for ${args.clerkId}`,
    );
    return { deleted };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Embedding backfill
//
// Self-rescheduling cursor: pulls memories with no embedding, groups them by
// userId, resolves each user's OPENROUTER_API_KEY, batches embeddings via a
// single `generateEmbeddings` call per user, then writes the vectors back.
//
// Users without a key set are skipped — their memories stay unembedded until
// they configure a key, at which point a future run of this migration will
// pick them up. Kick off via Convex dashboard:
//   internal.neo4jActions.migration.startEmbeddingBackfill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process one batch. Schedules itself again when more work remains, so a
 * single invocation drains the entire queue without blowing out an action's
 * wallclock budget.
 */
export const backfillEmbeddingsInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const BATCH = args.batchSize ?? 50;
    const service = new MemoryService(getDriver());

    const rows = await service.listMissingEmbeddings(BATCH);
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
        const apiKey = await tryUserEnvVarByClerkId(
          ctx,
          clerkId,
          "OPENROUTER_API_KEY",
        );
        if (!apiKey) {
          console.warn(
            `embedding backfill: skipping user ${clerkId} (no OPENROUTER_API_KEY)`,
          );
          continue;
        }
        const vectors = await generateEmbeddings(
          apiKey,
          items.map((x) => x.text),
        );
        const writes: Array<{ id: string; embedding: number[] }> = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const vec = vectors[i];
          if (item && vec) {
            writes.push({ id: item.id, embedding: vec });
          }
        }
        await service.setEmbeddings(writes);
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
    const service = new MemoryService(getDriver());

    const rows = await service.listMissingSemanticEdges(BATCH);
    if (rows.length === 0) {
      console.log("semantic-edge backfill: drained");
      return { done: true, processed: 0 };
    }

    let processed = 0;
    const processedIds: string[] = [];

    for (const row of rows) {
      try {
        await service.createSemanticEdgesForMemory(
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
      await service.markSemanticEdgesProcessed(processedIds);
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

const LLM_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const LLM_MODEL = "qwen/qwen3-235b-a22b-2507";

export const backfillEntitiesInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const BATCH = args.batchSize ?? 20;
    const service = new MemoryService(getDriver());

    const rows = await service.listMissingEntities(BATCH);
    if (rows.length === 0) {
      console.log("entity backfill: drained");
      return { done: true, processed: 0 };
    }

    // Group by userId so we resolve API keys once per user
    const byUser = new Map<
      string,
      Array<{ id: string; title: string; content: string }>
    >();
    for (const r of rows) {
      const existing = byUser.get(r.userId) ?? [];
      existing.push({ id: r.id, title: r.title, content: r.content });
      byUser.set(r.userId, existing);
    }

    let processed = 0;
    const processedIds: string[] = [];

    for (const [clerkId, items] of byUser) {
      try {
        const apiKey = await tryUserEnvVarByClerkId(
          ctx,
          clerkId,
          "OPENROUTER_API_KEY",
        );
        if (!apiKey) {
          console.warn(
            `entity backfill: skipping user ${clerkId} (no OPENROUTER_API_KEY)`,
          );
          // Still mark as processed to avoid infinite retry
          for (const item of items) processedIds.push(item.id);
          continue;
        }

        // Get recent memory titles for the enrichment prompt context
        const existingMemories = await service.getRecentMemoryTitles(
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
                      "You are a memory tagging and entity extraction system. Respond with ONLY valid JSON. No thinking, no markdown.",
                  },
                  { role: "user", content: prompt },
                ],
                temperature: 0.1,
              }),
            });

            if (!res.ok) {
              console.error(
                `entity backfill: LLM ${res.status} for ${item.id}`,
              );
              processedIds.push(item.id);
              continue;
            }

            const json = await res.json();
            const llmContent = json?.choices?.[0]?.message?.content;
            if (typeof llmContent !== "string") {
              processedIds.push(item.id);
              continue;
            }

            const parsed = parseFullEnrichmentResponse(llmContent);
            if (parsed && parsed.entities.length > 0) {
              await service.applyEntitiesOnly(
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
      await service.markEntityExtracted(processedIds);
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
    const service = new MemoryService(getDriver());

    const rows = await service.listMissingContentHash(BATCH);
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

    await service.setContentHashes(updates);

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

// ─────────────────────────────────────────────────────────────────────────────
// Deduplicate existing memories
//
// Merges memories that share the same (userId, contentHash). For each group:
//   - Oldest memory survives (most enrichment time = most tags/entities/edges)
//   - Unique tags, relationships, and entities transfer to the survivor
//   - visitCount from duplicates is summed into the survivor
//   - Duplicates are DETACH DELETEd
//
// Requires contentHash backfill to have run first.
// Kick off via Convex dashboard:
//   internal.neo4jActions.migration.deduplicateMemories({ clerkId: "..." })
// ─────────────────────────────────────────────────────────────────────────────

export const deduplicateMemories = internalAction({
  args: { clerkId: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    const deleted = await service.deduplicateMemories(args.clerkId);
    console.log(
      `deduplicateMemories: merged ${deleted} duplicates for ${args.clerkId}`,
    );
    return { deleted };
  },
});

/**
 * Diagnostic: find memories with the same title and show their content +
 * contentHash so we can see why dedup didn't match them.
 * Run via dashboard:
 *   internal.neo4jActions.migration.diagnoseDuplicates({ clerkId: "...", title: "vmem" })
 */
export const diagnoseDuplicates = internalAction({
  args: { clerkId: v.string(), title: v.string() },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.diagnoseDuplicates(args.clerkId, args.title);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Browsing-history deduplication
//
// Merges browsing-history/bookmarks memories that share the same title for a
// user. Every page on a site sharing a generic <title> (e.g. "vmem") collapses
// into one survivor. Oldest memory survives, visitCounts are summed, unique
// tags/relationships/entities transfer.
//
// Kick off via Convex dashboard:
//   internal.neo4jActions.migration.deduplicateBrowsingHistory({ clerkId: "..." })
// ─────────────────────────────────────────────────────────────────────────────

export const deduplicateBrowsingHistory = internalAction({
  args: { clerkId: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    const deleted = await service.deduplicateBrowsingHistory(args.clerkId);
    console.log(
      `deduplicateBrowsingHistory: merged ${deleted} duplicates for ${args.clerkId}`,
    );
    return { deleted };
  },
});
