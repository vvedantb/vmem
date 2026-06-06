"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { applyEnrichment } from "../../src/neo4j/memory/enrichment";
import { getRecentMemoryTitles } from "../../src/neo4j/memory/search";
import { getDriver } from "../../src/neo4j/driver";
import {
  sanitizeTag,
  buildFullEnrichmentPrompt,
  parseFullEnrichmentResponse,
} from "../../src/enrichmentPrompt";
import { tryUserAndApiKeyByClerkId } from "../lib/envVars";
import { callJsonChat } from "../lib/openRouter";

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

      // Get recent memories for the LLM to find relationships
      const existingMemories = await getRecentMemoryTitles(
        driver,
        args.clerkId,
        args.memoryId,
      );

      const prompt = buildFullEnrichmentPrompt(
        args.title,
        args.content,
        existingMemories,
      );

      const rawText = await callJsonChat(ctx, {
        apiKey: auth.apiKey,
        userId: auth.userId,
        profileId: args.profileId,
        feature: "enrichment",
        role: "You are a memory tagging and entity extraction system.",
        prompt,
      });

      if (rawText === null) {
        console.error(
          `[enrichment] No LLM content in response for ${args.memoryId}`,
        );
        return { enriched: false };
      }

      const parsed = parseFullEnrichmentResponse(rawText);
      if (!parsed || parsed.tags.length === 0) {
        console.log(`[enrichment] No valid tags parsed for ${args.memoryId}`);
        return { enriched: false };
      }

      // Sanitize tags
      const sanitizedTags = parsed.tags
        .map(sanitizeTag)
        .filter((t) => t.length > 0)
        .slice(0, 5);

      if (sanitizedTags.length === 0) {
        return { enriched: false };
      }

      // Validate related memory IDs against actual user memories
      const validIds = new Set(existingMemories.map((m) => m.id));
      const relatedIds = (parsed.relatedMemoryIds ?? []).filter((id) =>
        validIds.has(id),
      );

      // Apply enrichment to Neo4j
      await applyEnrichment(
        driver,
        args.memoryId,
        args.clerkId,
        sanitizedTags,
        relatedIds,
        parsed.entities ?? [],
      );

      // Log enrichment event
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
