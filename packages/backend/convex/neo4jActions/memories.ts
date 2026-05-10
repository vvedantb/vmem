"use node";

import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  computeContentHash,
  createChunksForMemory,
  createMemory,
  deleteAllMemoriesForUser,
  deleteChunksForMemory,
  deleteMemory,
  deleteTeamMemoryAsOwner,
  findMemoryByContentHash,
  findMemoryByExternalId,
  findMemoryBySimilarity,
  findMemoryByTitleAndOrigin,
  findMemoryByUrl,
  findUnchunkedLongMemories,
  getMemory,
  getMemoryEvents,
  getMemoryForTeam,
  getRecentMemoryTitles,
  incrementVisitCount,
  listMemories,
  listMemoriesForTeam,
  retrieveMemories,
  searchMemories,
  searchMemoriesForTeam,
  updateMemory,
} from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { normalizeUrl } from "../../src/neo4j/url";
import { generateEmbedding, generateEmbeddings } from "../lib/openRouter";
import { tryUserAndApiKeyByClerkId } from "../lib/envVars";
import { chunkText, shouldChunk } from "../../src/neo4j/chunking";

type MemoryType = "profile" | "episodic" | "knowledge";
type MemoryStatus = "active" | "pinned" | "suppressed" | "expired";

const MEMORY_TYPES: ReadonlySet<string> = new Set([
  "profile",
  "episodic",
  "knowledge",
]);
const MEMORY_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

function toMemoryType(s: string | undefined): MemoryType | undefined {
  if (s === undefined) return undefined;
  return MEMORY_TYPES.has(s) ? (s as MemoryType) : undefined;
}

function toMemoryStatus(s: string | undefined): MemoryStatus | undefined {
  if (s === undefined) return undefined;
  return MEMORY_STATUSES.has(s) ? (s as MemoryStatus) : undefined;
}

/**
 * Mark the user's context_prompt cache as pending and — only on the
 * first invalidation in a burst — schedule the 60s debounce check.
 * Memory writes (create / update / delete) all funnel through here so
 * the MCP profile prompt eventually catches up without us regenerating
 * once per write.
 */
async function scheduleContextPromptInvalidation(
  ctx: ActionCtx,
  clerkId: string,
): Promise<void> {
  const shouldSchedule = await ctx.runMutation(
    internal.contextPromptCache.markPendingByClerkIdInternal,
    { clerkId },
  );
  if (shouldSchedule) {
    await ctx.scheduler.runAfter(
      60_000,
      internal.contextPromptActions.regenerateIfPendingInternal,
      { clerkId },
    );
  }
}

export const createMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    title: v.string(),
    content: v.string(),
    type: v.string(),
    source: v.string(),
    tags: v.array(v.string()),
    confidence: v.number(),
    expiresAt: v.optional(v.string()),
    url: v.optional(v.string()),
    // External-ID idempotency. When both `externalId` and `sourceType` are
    // supplied the action checks Layer 0 dedup before any other dedup pass.
    // Used by file uploads, V2 prompt-capture extracted facts, and future
    // importers (Twitter, GitHub) that have a stable upstream identifier.
    externalId: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    // File-upload metadata. Stored on the Memory node so a future "view
    // original file" UI can resolve `storageId` back to a Convex blob.
    storageId: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    originalFilename: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const driver = getDriver();

    // Get profileId - use provided or get default
    let resolvedProfileId: string;
    if (args.profileId) {
      resolvedProfileId = args.profileId;
    } else {
      const defaultProfile = await ctx.runMutation(
        internal.profiles.getOrCreateDefaultByClerkIdInternal,
        { clerkId: args.clerkId },
      );
      resolvedProfileId = defaultProfile._id;
    }

    const memoryType =
      args.type === "profile" || args.type === "episodic"
        ? args.type
        : "knowledge";

    // Normalize URL if provided
    const normalizedUrl = args.url
      ? (normalizeUrl(args.url) ?? undefined)
      : undefined;

    // ── Dedup layer 0: external ID match ─────────────────────────────────
    // When the caller supplies a stable external identifier (file content
    // hash, Twitter bookmark id, V2 fact hash, etc.) plus a sourceType,
    // any prior import with the same tuple short-circuits the rest of the
    // dedup pipeline. Backed by the composite index `memory_source_id`.
    if (args.externalId && args.sourceType) {
      const existing = await findMemoryByExternalId(
        driver,
        args.clerkId,
        args.sourceType,
        args.externalId,
      );
      if (existing) {
        await incrementVisitCount(driver, args.clerkId, existing.id);
        const full = await getMemory(driver, args.clerkId, existing.id);
        if (full) return full;
      }
    }

    // ── Dedup layer 1: URL match ──────────────────────────────────────────
    if (normalizedUrl) {
      const existing = await findMemoryByUrl(
        driver,
        args.clerkId,
        normalizedUrl,
      );
      if (existing) {
        await incrementVisitCount(driver, args.clerkId, existing.id);
        const full = await getMemory(driver, args.clerkId, existing.id);
        if (full) return full;
      }
    }

    // ── Dedup layer 1b: title + domain (browsing-history/bookmarks) ──────
    // Many sites share a generic <title> across all pages (e.g. "vmem").
    // For browsing-history sources, treat same-title same-origin as one memory.
    const BROWSER_SOURCES: ReadonlySet<string> = new Set([
      "browsing-history",
      "bookmarks",
    ]);
    if (normalizedUrl && BROWSER_SOURCES.has(args.source)) {
      try {
        const origin = new URL(normalizedUrl).origin;
        const titleMatch = await findMemoryByTitleAndOrigin(
          driver,
          args.clerkId,
          args.title,
          origin,
        );
        if (titleMatch) {
          await incrementVisitCount(driver, args.clerkId, titleMatch.id);
          const full = await getMemory(driver, args.clerkId, titleMatch.id);
          if (full) return full;
        }
      } catch {
        // Invalid URL, skip this check
      }
    }

    // ── Dedup layer 2: exact content hash ────────────────────────────────
    // MD5 of normalized(title+content). Zero API cost, catches identical
    // duplicates like "vmem" submitted three times.
    const contentHash = computeContentHash(args.title, args.content);
    const hashMatch = await findMemoryByContentHash(
      driver,
      args.clerkId,
      contentHash,
    );
    if (hashMatch) {
      await incrementVisitCount(driver, args.clerkId, hashMatch.id);
      const full = await getMemory(driver, args.clerkId, hashMatch.id);
      if (full) return full;
    }

    // Best-effort embedding generation — memory still saves if this fails
    // or the user hasn't configured an OpenRouter key. Backfill migration
    // can fill in nulls later.
    let embedding: number[] | null = null;
    try {
      const auth = await tryUserAndApiKeyByClerkId(
        ctx,
        args.clerkId,
        "OPENROUTER_API_KEY",
      );
      if (auth) {
        embedding = await generateEmbedding({
          ctx,
          apiKey: auth.apiKey,
          userId: auth.userId,
          profileId: resolvedProfileId,
          feature: "memory-save",
          text: `${args.title}\n\n${args.content}`,
        });
      }
    } catch (e) {
      console.warn("embedding failed on create", e);
    }

    // ── Dedup layer 3: semantic similarity (near-duplicate) ──────────────
    // Only runs when an embedding was successfully generated. Catches
    // near-duplicates like "vmem is cool" vs "vmem is cool!" that differ
    // by trivial edits but hash differently.
    if (embedding) {
      const semanticMatch = await findMemoryBySimilarity(
        driver,
        args.clerkId,
        embedding,
        0.95,
      );
      if (semanticMatch) {
        console.log(
          `[dedup] semantic near-duplicate (similarity=${semanticMatch.similarity.toFixed(3)}) → ${semanticMatch.id}`,
        );
        await incrementVisitCount(driver, args.clerkId, semanticMatch.id);
        const full = await getMemory(driver, args.clerkId, semanticMatch.id);
        if (full) return full;
      }
    }

    const result = await createMemory(driver, {
      userId: args.clerkId,
      profileId: resolvedProfileId,
      title: args.title,
      content: args.content,
      type: memoryType,
      source: args.source,
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
      url: normalizedUrl,
      embedding,
      contentHash,
      sourceType: args.sourceType,
      sourceId: args.externalId,
      storageId: args.storageId,
      mimeType: args.mimeType,
      originalFilename: args.originalFilename,
    });

    // Push memory event via direct mutation
    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId: args.clerkId,
      eventType: "memory_created",
      memoryId: result.id,
      payload: JSON.stringify({ title: result.title }),
    });

    // Schedule server-side enrichment (tags, relations, entities) via OpenRouter.
    // Runs async — memory creation returns immediately.
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.enrichment.enrichMemoryInternal,
      {
        clerkId: args.clerkId,
        memoryId: result.id,
        title: args.title,
        content: args.content,
        profileId: resolvedProfileId,
      },
    );

    // Schedule chunk pipeline for long memories (>2 KB content). Chunks are
    // paragraph-level retrieval anchors so a long PDF or article can be
    // matched on a specific passage instead of the whole document. Runs
    // async — memory creation returns immediately, chunks appear shortly
    // after. Memory-level retrieval still works while chunks are pending.
    if (shouldChunk(args.content)) {
      await ctx.scheduler.runAfter(
        0,
        internal.neo4jActions.memories.chunkMemoryInternal,
        {
          clerkId: args.clerkId,
          memoryId: result.id,
          content: args.content,
          profileId: resolvedProfileId,
        },
      );
    }

    // V2 ADD/UPDATE/DELETE/NONE pipeline. Runs only for prompt-capture so
    // we don't waste tokens on every dashboard save / file upload. The
    // sourceType guard prevents recursion: facts the V2 action ADDs are
    // themselves saved via createMemoryInternal but with
    // sourceType "v2-extracted", which we exclude here.
    if (
      args.source === "prompt-capture" &&
      args.sourceType !== "v2-extracted"
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.neo4jActions.factExtraction.extractFactsAndDecideInternal,
        {
          clerkId: args.clerkId,
          sourceMemoryId: result.id,
          capturedPrompt: args.content,
          profileId: resolvedProfileId,
        },
      );
    }

    // Invalidate the MCP context_prompt cache. Mark pending; the
    // mutation returns true only when this is the first invalidation
    // since the last regen, so we schedule exactly one 60s debounce
    // check per burst of writes.
    await scheduleContextPromptInvalidation(ctx, args.clerkId);

    return result;
  },
});

/**
 * Chunk a memory's content into ~500-token sliding windows, embed each
 * chunk, and persist them as `:Chunk` nodes linked to the parent memory.
 *
 * Best-effort — failures are logged but never bubble up. The whole-memory
 * embedding (set during `createMemory`) still drives retrieval, so a
 * memory without chunks is degraded but functional.
 *
 * Used by:
 * - `createMemoryInternal` (scheduled when content > 2 KB)
 * - `backfillChunksInternal` (one-shot migration for pre-existing long memories)
 */
export const chunkMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    content: v.string(),
    /** Optional — when supplied, threaded onto the openRouterLogs row so
     *  spend attributes to the right workspace. When omitted (e.g. legacy
     *  callers) the row is logged with no profileId and shows up as
     *  "uncategorised" on the dashboard. */
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const driver = getDriver();

    const chunks = chunkText(args.content);
    if (chunks.length === 0) return;

    // Resolve profileId from the parent memory when not passed by the
    // caller — keeps the openRouterLogs row attributable even on
    // backfill/update paths that don't already have it in scope.
    let resolvedProfileId = args.profileId;
    if (!resolvedProfileId) {
      const parent = await getMemory(driver, args.clerkId, args.memoryId);
      resolvedProfileId = parent?.profileId ?? undefined;
    }

    let embeddings: (number[] | null)[] = chunks.map(() => null);
    try {
      const auth = await tryUserAndApiKeyByClerkId(
        ctx,
        args.clerkId,
        "OPENROUTER_API_KEY",
      );
      if (auth) {
        const vectors = await generateEmbeddings({
          ctx,
          apiKey: auth.apiKey,
          userId: auth.userId,
          profileId: resolvedProfileId,
          feature: "memory-save",
          texts: chunks.map((c) => c.content),
        });
        embeddings = vectors;
      }
    } catch (e) {
      console.warn(
        `[chunk-pipeline] embedding failed for memory ${args.memoryId}`,
        e,
      );
    }

    // Replace any existing chunks (e.g. backfill re-run) before inserting
    // fresh ones so we don't duplicate.
    await deleteChunksForMemory(driver, args.clerkId, args.memoryId);
    await createChunksForMemory(driver, {
      memoryId: args.memoryId,
      userId: args.clerkId,
      chunks,
      embeddings,
    });
  },
});

/**
 * One-shot migration: chunk any pre-existing long memories that don't yet
 * have `:Chunk` nodes. Run manually after deploy. Processes a bounded
 * batch per invocation (`limit`) and self-schedules a follow-up if more
 * remain — keeps a single invocation under Convex action time/memory
 * limits even on accounts with thousands of long memories.
 */
export const backfillChunksInternal = internalAction({
  args: {
    clerkId: v.string(),
    /** Max memories to chunk per invocation. Default 25 keeps under 5 min. */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const driver = getDriver();
    const limit = args.limit ?? 25;

    const candidates = await findUnchunkedLongMemories(
      driver,
      args.clerkId,
      2000,
      limit,
    );
    if (candidates.length === 0) {
      console.log(`[chunk-backfill] no unchunked memories for ${args.clerkId}`);
      return { processed: 0, hasMore: false };
    }

    for (const memory of candidates) {
      await ctx.runAction(internal.neo4jActions.memories.chunkMemoryInternal, {
        clerkId: args.clerkId,
        memoryId: memory.id,
        content: memory.content,
      });
    }

    const hasMore = candidates.length === limit;
    if (hasMore) {
      // Self-schedule the next batch with a small delay so we yield the
      // runtime and don't hammer Neo4j or OpenRouter rate limits.
      await ctx.scheduler.runAfter(
        5000,
        internal.neo4jActions.memories.backfillChunksInternal,
        { clerkId: args.clerkId, limit },
      );
    }

    return { processed: candidates.length, hasMore };
  },
});

export const getMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getMemory(driver, args.clerkId, args.memoryId);
  },
});

export const listMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    searchQuery: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await listMemories(driver, {
      userId: args.clerkId,
      profileId: args.profileId,
      type: toMemoryType(args.type),
      status: toMemoryStatus(args.status),
      source: args.source,
      tags: args.tags,
      searchQuery: args.searchQuery,
      limit: args.limit,
      offset: args.offset,
    });
  },
});

export const updateMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const driver = getDriver();
    const result = await updateMemory(driver, args.clerkId, args.memoryId, {
      title: args.title,
      content: args.content,
      type: toMemoryType(args.type),
      status: toMemoryStatus(args.status),
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
    });

    if (result) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId: args.clerkId,
        eventType: "memory_updated",
        memoryId: args.memoryId,
        payload: JSON.stringify({ title: result.title }),
      });

      // If content was updated, rebuild chunks. We always re-chunk on
      // content change rather than diffing because chunks are a derived
      // representation — any partial update would risk leaving stale
      // chunks that drift from the source. `chunkMemoryInternal` deletes
      // existing chunks before inserting new ones.
      if (args.content !== undefined) {
        if (shouldChunk(args.content)) {
          await ctx.scheduler.runAfter(
            0,
            internal.neo4jActions.memories.chunkMemoryInternal,
            {
              clerkId: args.clerkId,
              memoryId: args.memoryId,
              content: args.content,
            },
          );
        } else {
          // Content shrank below the chunking threshold — clean up chunks
          // so retrieval doesn't surface stale long-content matches.
          await deleteChunksForMemory(driver, args.clerkId, args.memoryId);
        }
      }

      await scheduleContextPromptInvalidation(ctx, args.clerkId);
    }

    return result;
  },
});

export const deleteMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args) => {
    const driver = getDriver();
    const deleted = await deleteMemory(driver, args.clerkId, args.memoryId);

    if (deleted) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId: args.clerkId,
        eventType: "memory_deleted",
        memoryId: args.memoryId,
        payload: JSON.stringify({}),
      });

      await scheduleContextPromptInvalidation(ctx, args.clerkId);
    }

    return deleted;
  },
});

/**
 * Wipe every memory the user owns plus all per-user dependents (chunks,
 * events, proposed updates, entities, orphan tags/sources). Used by the
 * settings → Data Controls "delete all memories" action. Skips per-memory
 * audit events since the source rows are gone — the action that calls
 * this is itself audit-logged at the API layer.
 */
export const deleteAllMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const driver = getDriver();
    const deleted = await deleteAllMemoriesForUser(driver, args.clerkId);
    if (deleted > 0) {
      await scheduleContextPromptInvalidation(ctx, args.clerkId);
    }
    return deleted;
  },
});

export const searchMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await searchMemories(driver, {
      userId: args.clerkId,
      query: args.query,
      type: toMemoryType(args.type),
      tags: args.tags,
      source: args.source,
      limit: args.limit,
      offset: args.offset,
    });
  },
});

export const retrieveMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.optional(v.string()),
    query: v.string(),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const driver = getDriver();

    // Best-effort query embedding. If the user has no OPENROUTER_API_KEY
    // set (or the request fails), we fall back to fulltext-only retrieval
    // — the service records the degraded state in the trace reason.
    let queryEmbedding: number[] | null = null;
    try {
      const auth = await tryUserAndApiKeyByClerkId(
        ctx,
        args.clerkId,
        "OPENROUTER_API_KEY",
      );
      if (auth) {
        queryEmbedding = await generateEmbedding({
          ctx,
          apiKey: auth.apiKey,
          userId: auth.userId,
          profileId: args.profileId,
          feature: "memory-search",
          text: args.query,
        });
      }
    } catch (e) {
      console.warn("query embedding failed, falling back to fulltext", e);
    }

    return await retrieveMemories(driver, {
      userId: args.clerkId,
      query: args.query,
      queryEmbedding,
      type: toMemoryType(args.type),
      tags: args.tags,
      limit: args.limit,
    });
  },
});

export const getMemoryEventsInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getMemoryEvents(driver, args.clerkId, args.memoryId);
  },
});

export const getRecentMemoryTitlesInternal = internalAction({
  args: {
    clerkId: v.string(),
    excludeMemoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getRecentMemoryTitles(
      driver,
      args.clerkId,
      args.excludeMemoryId,
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Team-scoped internal actions.
// The Convex layer must verify team membership BEFORE invoking these —
// they carry no per-user auth check, only a profileId filter.
// ─────────────────────────────────────────────────────────────────────────────

export const listMemoriesForTeamInternal = internalAction({
  args: {
    profileId: v.string(),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await listMemoriesForTeam(driver, {
      profileId: args.profileId,
      type: toMemoryType(args.type),
      status: toMemoryStatus(args.status),
      tags: args.tags,
      limit: args.limit,
      offset: args.offset,
    });
  },
});

export const getMemoryForTeamInternal = internalAction({
  args: {
    profileId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getMemoryForTeam(driver, args.profileId, args.memoryId);
  },
});

export const searchMemoriesForTeamInternal = internalAction({
  args: {
    profileId: v.string(),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await searchMemoriesForTeam(driver, {
      profileId: args.profileId,
      query: args.query,
      type: toMemoryType(args.type),
      tags: args.tags,
      source: args.source,
      limit: args.limit,
      offset: args.offset,
    });
  },
});

export const deleteTeamMemoryAsOwnerInternal = internalAction({
  args: {
    profileId: v.string(),
    memoryId: v.string(),
    ownerClerkId: v.string(), // for event logging
  },
  handler: async (ctx, args) => {
    const driver = getDriver();
    const deleted = await deleteTeamMemoryAsOwner(
      driver,
      args.profileId,
      args.memoryId,
    );

    if (deleted) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId: args.ownerClerkId,
        eventType: "memory_deleted",
        memoryId: args.memoryId,
        payload: JSON.stringify({ moderatedByTeamOwner: true }),
      });
    }

    return deleted;
  },
});
