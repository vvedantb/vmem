"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { getDriver } from "../../../engine/neo4j/driver";
import {
  countUnretagged,
  deleteOrphanTags,
  listUnretagged,
  markRetaggedOnly,
  replaceTagsAndMarkRetagged,
} from "../../../engine/neo4j/memory/migration";
import { normalizeTags } from "../../../engine/neo4j/memory/tagNormalize";
import { getTopTags } from "../../../engine/neo4j/memory/tags";
import { getRecentMemoryTitles } from "../../../engine/neo4j/memory/search";
import { tryUserAndApiKeyByClerkId } from "../../lib/envVars";
import { callJsonChat } from "../../lib/openRouter";
import {
  buildFullEnrichmentPrompt,
  parseFullEnrichmentResponse,
} from "../../prompts/enrichmentPrompt";

/** Modest parallelism per batch: fast enough for a few thousand memories
 *  without tripping OpenRouter rate limits. */
const CONCURRENCY = 5;

/**
 * One-shot tag consolidation: re-runs the (vocabulary-aware) tagging part of
 * the enrichment prompt over a user's memories and REPLACES their
 * TAGGED_WITH edges. Entities and RELATES_TO edges are untouched.
 *
 * Drive manually until { done: true } — one OpenRouter call per memory, so
 * this must never run from a cron:
 *   npx convex run neo4jActions/migration/retag:retagMemoriesInternal \
 *     '{"clerkId":"user_...","batchSize":50}'
 *
 * `m.retaggedAt` is the resume marker; failed LLM calls keep their legacy
 * tags and are marked anyway so a batch can never loop forever. The
 * vocabulary (top multi-use tags) is refetched per batch, so consolidation
 * compounds: early batches establish themes, later batches reuse them.
 * When drained, sweeps Tag nodes that no memory points at any more.
 */
export const retagMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    batchSize: v.optional(v.number()),
    /** Compute new tags but write nothing — returns before/after samples. */
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const BATCH = Math.max(1, Math.trunc(args.batchSize ?? 50));
    const dryRun = args.dryRun ?? false;

    const auth = await tryUserAndApiKeyByClerkId(
      ctx,
      args.clerkId,
      "OPENROUTER_API_KEY",
    );
    if (!auth) {
      return { done: true, error: "no OPENROUTER_API_KEY for user" };
    }

    const driver = getDriver();
    const rows = await listUnretagged(driver, args.clerkId, BATCH);
    if (rows.length === 0) {
      const orphansDeleted = await deleteOrphanTags(driver);
      console.log(
        `[retag] drained; deleted ${String(orphansDeleted)} orphan tags`,
      );
      return { done: true, processed: 0, orphansDeleted };
    }

    // Per-batch context: vocabulary grows as re-tagging proceeds, so later
    // batches converge harder onto established themes.
    const [existingMemories, existingTags] = await Promise.all([
      getRecentMemoryTitles(driver, args.clerkId, ""),
      getTopTags(driver, args.clerkId, 50),
    ]);

    let processed = 0;
    let failed = 0;
    const samples: Array<{
      title: string;
      oldTags: string[];
      newTags: string[];
    }> = [];

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      const failedIds: string[] = [];
      await Promise.all(
        chunk.map(async (row) => {
          try {
            const prompt = buildFullEnrichmentPrompt(
              row.title,
              row.content,
              existingMemories,
              existingTags,
            );
            const rawText = await callJsonChat(ctx, {
              apiKey: auth.apiKey,
              userId: auth.userId,
              profileId: row.profileId ?? undefined,
              feature: "tag-consolidation",
              role: "You are a memory tagging and entity extraction system.",
              prompt,
            });
            const parsed =
              rawText === null ? null : parseFullEnrichmentResponse(rawText);
            const newTags = normalizeTags(parsed?.tags ?? [], 4);
            if (newTags.length === 0) {
              failedIds.push(row.id);
              failed++;
              return;
            }
            if (dryRun) {
              samples.push({
                title: row.title.slice(0, 60),
                oldTags: row.tags,
                newTags,
              });
            } else {
              await replaceTagsAndMarkRetagged(
                driver,
                row.id,
                args.clerkId,
                newTags,
              );
            }
            processed++;
          } catch (e) {
            console.error(`[retag] failed for ${row.id}:`, e);
            failedIds.push(row.id);
            failed++;
          }
        }),
      );
      // Failures keep legacy tags but advance the marker — no infinite retry.
      if (!dryRun) await markRetaggedOnly(driver, failedIds);
    }

    const remaining = dryRun
      ? null
      : await countUnretagged(driver, args.clerkId);
    return { done: false, processed, failed, remaining, samples };
  },
});
