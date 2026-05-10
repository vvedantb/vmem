"use node";

import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  MemoryService,
  computeContentHash,
} from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { generateEmbedding } from "../lib/openRouter";
import { normalizeUrl } from "../../src/neo4j/url";
import { tryUserAndApiKeyByClerkId } from "../lib/envVars";

/**
 * Best-effort embedding helper used by the MCP entry points. Returns null
 * when the user has no OPENROUTER_API_KEY set or the remote call fails —
 * downstream Cypher treats that as "no vector yet" and the retrieve/create
 * paths continue on the fulltext-only degraded path.
 *
 * `profileId` is threaded through so the resulting `openRouterLogs` row
 * can be attributed to the workspace whose call triggered it.
 */
async function tryEmbed(
  ctx: ActionCtx,
  clerkId: string,
  profileId: string | undefined,
  text: string,
): Promise<number[] | null> {
  try {
    const auth = await tryUserAndApiKeyByClerkId(
      ctx,
      clerkId,
      "OPENROUTER_API_KEY",
    );
    if (!auth) return null;
    return await generateEmbedding({
      ctx,
      apiKey: auth.apiKey,
      userId: auth.userId,
      profileId,
      feature: "mcp-embed",
      text,
    });
  } catch (e) {
    console.warn("mcp embedding failed", e);
    return null;
  }
}

/**
 * Resolve the profileId to use for a request.
 * Priority: explicit profileId > active profile > default profile
 *
 * Note: We don't validate explicit profileId ownership here since the memory
 * queries already filter by userId. If someone passes an invalid profileId,
 * they just get no results.
 */
async function resolveProfileId(
  ctx: ActionCtx,
  clerkId: string,
  explicitProfileId?: string,
): Promise<string> {
  // If explicit profileId provided, use it directly
  // (queries are already scoped to the user's memories)
  if (explicitProfileId) {
    return explicitProfileId;
  }

  // Get active profile or create default
  const profile = await ctx.runMutation(
    internal.profiles.getOrCreateDefaultByClerkIdInternal,
    { clerkId },
  );
  return profile._id;
}

export const mcpSearchMemories = internalAction({
  args: {
    clerkId: v.string(),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profileId = await resolveProfileId(ctx, args.clerkId, args.profileId);
    const service = new MemoryService(getDriver());
    return await service.searchMemories({
      userId: args.clerkId,
      profileId,
      query: args.query,
      limit: args.limit ?? 20,
      offset: args.offset ?? 0,
    });
  },
});

export const mcpRetrieveMemories = internalAction({
  args: {
    clerkId: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profileId = await resolveProfileId(ctx, args.clerkId, args.profileId);
    const service = new MemoryService(getDriver());
    const queryEmbedding = await tryEmbed(
      ctx,
      args.clerkId,
      profileId,
      args.query,
    );
    return await service.retrieveMemories({
      userId: args.clerkId,
      profileId,
      query: args.query,
      queryEmbedding,
      limit: args.limit ?? 10,
    });
  },
});

export const mcpCreateMemory = internalAction({
  args: {
    clerkId: v.string(),
    title: v.string(),
    content: v.string(),
    type: v.optional(v.string()),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    url: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = args.clerkId;
    const profileId = await resolveProfileId(ctx, clerkId, args.profileId);
    const service = new MemoryService(getDriver());

    const normalizedUrl = args.url
      ? (normalizeUrl(args.url) ?? undefined)
      : undefined;

    // ── Dedup layer 1: URL match ──────────────────────────────────────────
    if (normalizedUrl) {
      const existing = await service.findMemoryByUrl(clerkId, normalizedUrl);
      if (existing) {
        const full = await service.getMemory(clerkId, existing.id);
        if (full) return full;
      }
    }

    // ── Dedup layer 1b: title + domain (browsing-history/bookmarks) ──────
    const source = args.source ?? "mcp";
    const BROWSER_SOURCES: ReadonlySet<string> = new Set([
      "browsing-history",
      "bookmarks",
    ]);
    if (normalizedUrl && BROWSER_SOURCES.has(source)) {
      try {
        const origin = new URL(normalizedUrl).origin;
        const titleMatch = await service.findMemoryByTitleAndOrigin(
          clerkId,
          args.title,
          origin,
        );
        if (titleMatch) {
          await service.incrementVisitCount(clerkId, titleMatch.id);
          const full = await service.getMemory(clerkId, titleMatch.id);
          if (full) return full;
        }
      } catch {
        // Invalid URL, skip this check
      }
    }

    // ── Dedup layer 2: exact content hash ────────────────────────────────
    const contentHash = computeContentHash(args.title, args.content);
    const hashMatch = await service.findMemoryByContentHash(
      clerkId,
      contentHash,
    );
    if (hashMatch) {
      await service.incrementVisitCount(clerkId, hashMatch.id);
      const full = await service.getMemory(clerkId, hashMatch.id);
      if (full) return full;
    }

    const embedding = await tryEmbed(
      ctx,
      clerkId,
      profileId,
      `${args.title}\n\n${args.content}`,
    );

    // ── Dedup layer 3: semantic similarity (near-duplicate) ──────────────
    if (embedding) {
      const semanticMatch = await service.findMemoryBySimilarity(
        clerkId,
        embedding,
        0.95,
      );
      if (semanticMatch) {
        console.log(
          `[dedup] semantic near-duplicate (similarity=${semanticMatch.similarity.toFixed(3)}) → ${semanticMatch.id}`,
        );
        await service.incrementVisitCount(clerkId, semanticMatch.id);
        const full = await service.getMemory(clerkId, semanticMatch.id);
        if (full) return full;
      }
    }

    const result = await service.createMemory({
      userId: clerkId,
      profileId,
      title: args.title,
      content: args.content,
      type:
        args.type === "profile" || args.type === "episodic"
          ? args.type
          : "knowledge",
      source: args.source ?? "mcp",
      tags: args.tags ?? [],
      confidence: args.confidence ?? 1.0,
      url: normalizedUrl,
      embedding,
      contentHash,
    });

    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId,
      eventType: "memory_created",
      memoryId: result.id,
      payload: JSON.stringify({ title: result.title }),
    });

    // Schedule server-side enrichment (tags, relations, entities) via OpenRouter
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.enrichment.enrichMemoryInternal,
      {
        clerkId,
        memoryId: result.id,
        title: args.title,
        content: args.content,
        profileId,
      },
    );

    return result;
  },
});

export const mcpUpdateMemory = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());
    const result = await service.updateMemory(args.clerkId, args.memoryId, {
      title: args.title,
      content: args.content,
      tags: args.tags,
    });

    if (result) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId: args.clerkId,
        eventType: "memory_updated",
        memoryId: args.memoryId,
        payload: JSON.stringify({ title: result.title }),
      });
    }

    return result;
  },
});

export const mcpDeleteMemory = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());
    const deleted = await service.deleteMemory(args.clerkId, args.memoryId);

    if (deleted) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId: args.clerkId,
        eventType: "memory_deleted",
        memoryId: args.memoryId,
        payload: JSON.stringify({}),
      });
    }

    return deleted;
  },
});
