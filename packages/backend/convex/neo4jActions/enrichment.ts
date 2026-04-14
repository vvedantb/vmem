"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { z } from "zod";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

const MAX_CONTENT_LENGTH = 2000;

const enrichmentResponseSchema = z.object({
  tags: z.array(z.string()),
  relatedMemoryIds: z.array(z.string()),
});

const openRouterResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
});

function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(" ", maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen);
}

function sanitizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .slice(0, 50);
}

async function callOpenRouter(
  title: string,
  content: string,
  existingMemories: Array<{ id: string; title: string }>,
): Promise<{ tags: string[]; relatedMemoryIds: string[] } | null> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  const model = process.env.ENRICHMENT_MODEL ?? "openai/gpt-5-nano";

  if (!apiKey) {
    console.warn("[enrichment] OPENROUTER_API_KEY not set, skipping");
    return null;
  }

  const memoryList = existingMemories
    .map((m) => `${m.id}: ${m.title}`)
    .join("\n");

  const prompt = `You are a memory tagging system. Given a memory and a list of existing memories:

1. Generate 3-5 semantic topic tags for this memory. Tags should be lowercase, specific, and reusable (e.g. "react", "authentication", "graph-algorithms", "typescript"). Avoid generic tags like "programming" or "article".

2. From the provided list, identify any memories that are semantically related to this one. Only include strong relationships — shared topic, continuation of the same work, or direct reference.

Memory:
Title: ${title}
Content: ${truncateAtWord(content, MAX_CONTENT_LENGTH)}

Existing memories:
${memoryList || "(none)"}

Respond in JSON only:
{"tags": ["tag1", "tag2"], "relatedMemoryIds": ["id1"]}`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://vmem.vedantb.com",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[enrichment] OpenRouter returned ${response.status}: ${errorBody}`,
      );
      return null;
    }

    const json: unknown = await response.json();
    const data = openRouterResponseSchema.safeParse(json);
    if (!data.success) return null;

    const raw = data.data.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = enrichmentResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.error("[enrichment] Invalid LLM response shape");
      return null;
    }

    return parsed.data;
  } catch (err) {
    console.error("[enrichment] LLM call failed:", err);
    return null;
  }
}

/**
 * Apply enrichment from client-side local LLM.
 * Used by Chrome extension when local enrichment is enabled.
 */
export const applyEnrichmentInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());

    // Sanitize tags
    const sanitizedTags = args.tags
      .map(sanitizeTag)
      .filter((t) => t.length > 0)
      .slice(0, 5);

    if (sanitizedTags.length === 0) {
      console.log("[enrichment] No valid tags to apply");
      return { applied: false };
    }

    // Apply enrichment (tags only, no related memories for client enrichment)
    await service.applyEnrichment(
      args.memoryId,
      args.clerkId,
      sanitizedTags,
      [], // No related memories from client
    );

    // Push event
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
      `[enrichment] Client enrichment applied: ${args.memoryId} with ${sanitizedTags.length} tags`,
    );

    return { applied: true };
  },
});

/**
 * Server-side enrichment via OpenRouter.
 * Scheduled automatically after memory creation.
 */
export const enrichMemory = internalAction({
  args: {
    memoryId: v.string(),
    userId: v.string(),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());
    const existing = await service.getRecentMemoryTitles(
      args.userId,
      args.memoryId,
    );

    const validIds = new Set<string>();
    for (const m of existing) validIds.add(m.id);

    const result = await callOpenRouter(args.title, args.content, existing);
    if (!result) return null;

    const tags = result.tags
      .map(sanitizeTag)
      .filter((t) => t.length > 0)
      .slice(0, 5);

    const relatedIds = result.relatedMemoryIds.filter((id) => validIds.has(id));

    if (tags.length === 0) return null;

    await service.applyEnrichment(args.memoryId, args.userId, tags, relatedIds);

    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId: args.userId,
      eventType: "memory_updated",
      memoryId: args.memoryId,
      payload: JSON.stringify({ tags }),
    });

    console.log(
      `[enrichment] ${args.memoryId}: ${tags.length} tags, ${relatedIds.length} links`,
    );

    return null;
  },
});
