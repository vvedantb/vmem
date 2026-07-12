"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { applyEnrichment } from "../../engine/neo4j/memory/enrichment";
import { getDriver } from "../../engine/neo4j/driver";
import { sanitizeTag } from "../prompts/enrichmentPrompt";
import { tryUserAndApiKeyByClerkId } from "../lib/envVars";
import {
  callFullEnrichmentLlm,
  loadEnrichmentVocabulary,
} from "./enrichment/llm";

/**
 * Server-side enrichment: generates tags + related memory links via OpenRouter.
 * Scheduled by createMemoryInternal after every memory save. Best-effort —
 * silently skips if no API key is configured or the LLM call fails.
 */
export const enrichMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    title: v.string(),
    content: v.string(),
    /** Profile that owns the memory — passed through to the OpenRouter
     *  log row so /openrouter-logs can break spend down by profile. */
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const auth = await tryUserAndApiKeyByClerkId(
        ctx,
        args.clerkId,
        "OPENROUTER_API_KEY",
      );
      if (!auth) {
        console.log(
          "[enrichment] No OPENROUTER_API_KEY configured, skipping enrichment",
        );
        return { enriched: false };
      }

      const driver = getDriver();

      const vocabulary = await loadEnrichmentVocabulary(driver, args.clerkId, {
        excludeMemoryId: args.memoryId,
        includeEntities: true,
      });

      const parsed = await callFullEnrichmentLlm(ctx, auth, {
        title: args.title,
        content: args.content,
        profileId: args.profileId,
        feature: "enrichment",
        vocabulary,
      });

      if (!parsed || parsed.tags.length === 0) {
        console.log(`[enrichment] No valid tags parsed for ${args.memoryId}`);
        return { enriched: false };
      }

      const sanitizedTags = parsed.tags
        .map(sanitizeTag)
        .filter((t) => t.length > 0)
        .slice(0, 4);

      if (sanitizedTags.length === 0) {
        return { enriched: false };
      }

      const validIds = new Set(vocabulary.recentTitles.map((m) => m.id));
      const relatedIds = (parsed.relatedMemoryIds ?? []).filter((id) =>
        validIds.has(id),
      );

      await applyEnrichment(
        driver,
        args.memoryId,
        args.clerkId,
        sanitizedTags,
        relatedIds,
        parsed.entities ?? [],
      );

      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId: args.clerkId,
        eventType: "memory_updated",
        memoryId: args.memoryId,
        payload: JSON.stringify({
          tags: sanitizedTags,
          source: "server-enrichment",
        }),
      });

      console.log(
        `[enrichment] Server enrichment applied: ${args.memoryId} — ${String(sanitizedTags.length)} tags, ${String(relatedIds.length)} links`,
      );

      return { enriched: true };
    } catch (err) {
      console.error(`[enrichment] Failed to enrich ${args.memoryId}:`, err);
      return { enriched: false };
    }
  },
});
