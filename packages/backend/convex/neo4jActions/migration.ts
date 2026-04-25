"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { generateEmbeddings } from "../../src/neo4j/embeddingService";
import { tryUserEnvVarByClerkId } from "../lib/envVars";

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
