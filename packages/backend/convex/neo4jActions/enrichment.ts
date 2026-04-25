"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { sanitizeTag } from "../../src/enrichmentPrompt";

export const applyEnrichmentInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    tags: v.array(v.string()),
    relatedMemoryIds: v.optional(v.array(v.string())),
    entities: v.optional(
      v.array(
        v.object({
          name: v.string(),
          normalizedName: v.string(),
          type: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());

    const sanitizedTags = args.tags
      .map(sanitizeTag)
      .filter((t) => t.length > 0)
      .slice(0, 5);

    if (sanitizedTags.length === 0) {
      console.log("[enrichment] No valid tags to apply");
      return { applied: false };
    }

    const existing = await service.getRecentMemoryTitles(
      args.clerkId,
      args.memoryId,
    );
    const validIds = new Set<string>();
    for (const m of existing) validIds.add(m.id);

    const requested = args.relatedMemoryIds ?? [];
    const relatedIds = requested.filter((id) => validIds.has(id));

    await service.applyEnrichment(
      args.memoryId,
      args.clerkId,
      sanitizedTags,
      relatedIds,
      args.entities ?? [],
    );

    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId: args.clerkId,
      eventType: "memory_updated",
      memoryId: args.memoryId,
      payload: JSON.stringify({
        tags: sanitizedTags,
        source: "client-enrichment",
      }),
    });

    console.log(
      `[enrichment] Client enrichment applied: ${args.memoryId} with ${String(sanitizedTags.length)} tags, ${String(relatedIds.length)} links`,
    );

    return { applied: true };
  },
});
