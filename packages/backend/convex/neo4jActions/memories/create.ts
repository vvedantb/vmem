"use node";

/**
 * Memory create handler — owns the 4-layer dedup pipeline and the
 * post-create fan-out (event, enrichment, chunking, V2 fact extraction,
 * context_prompt invalidation).
 */

import { type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  computeContentHash,
  createMemory,
  findMemoryByContentHash,
  findMemoryByExternalId,
  findMemoryBySimilarity,
  findMemoryByTitleAndOrigin,
  findMemoryByUrl,
  getMemory,
  incrementVisitCount,
  type MemoryWithTags,
} from "../../../src/neo4j/memoryService";
import { getDriver } from "../../../src/neo4j/driver";
import { normalizeUrl } from "../../../src/neo4j/url";
import { shouldChunk } from "../../../src/neo4j/chunking";
import {
  resolveProfileIdForClerkId,
  scheduleContextPromptInvalidation,
  tryEmbedOne,
} from "./shared";

export interface CreateMemoryArgs {
  clerkId: string;
  profileId?: string;
  title: string;
  content: string;
  type: string;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
  // External-ID idempotency. When both `externalId` and `sourceType` are
  // supplied the action checks Layer 0 dedup before any other dedup pass.
  // Used by file uploads, V2 prompt-capture extracted facts, and future
  // importers (Twitter, GitHub) that have a stable upstream identifier.
  externalId?: string;
  sourceType?: string;
  // File-upload metadata. Stored on the Memory node so a future "view
  // original file" UI can resolve `storageId` back to a Convex blob.
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
}

const BROWSER_SOURCES: ReadonlySet<string> = new Set([
  "browsing-history",
  "bookmarks",
]);

/**
 * Create a memory with 4-layer dedup:
 *   0. exact (sourceType, externalId) tuple
 *   1. URL match (after normalization)
 *   1b. title + origin for browser-history sources (many sites share
 *       a generic <title>, so same-title same-origin = same memory)
 *   2. exact content hash
 *   3. semantic similarity ≥ 0.95 (only when an embedding is available)
 *
 * Each layer that hits returns the existing memory after bumping its
 * visitCount. If `getMemory` returns null mid-flight (race), falls
 * through to the next layer. On miss, persists the new memory and
 * fans out async work via `schedulePostCreate`.
 */
export async function runCreateMemory(
  ctx: ActionCtx,
  args: CreateMemoryArgs,
): Promise<MemoryWithTags> {
  const driver = getDriver();

  const resolvedProfileId = await resolveProfileIdForClerkId(
    ctx,
    args.clerkId,
    args.profileId,
  );
  const memoryType =
    args.type === "profile" || args.type === "episodic"
      ? args.type
      : "knowledge";
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

  // ── Dedup layer 1: URL match
  if (normalizedUrl) {
    const existing = await findMemoryByUrl(driver, args.clerkId, normalizedUrl);
    if (existing) {
      await incrementVisitCount(driver, args.clerkId, existing.id);
      const full = await getMemory(driver, args.clerkId, existing.id);
      if (full) return full;
    }
  }

  // ── Dedup layer 1b: title + domain (browsing-history/bookmarks)
  // Many sites share a generic <title> across all pages (e.g. "vmem").
  // For browsing-history sources, treat same-title same-origin as one memory.
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

  // ── Dedup layer 2: exact content hash
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

  // Best-effort embedding — memory still saves if this fails or the
  // user hasn't configured an OpenRouter key.
  const embedding = await tryEmbedOne(ctx, {
    clerkId: args.clerkId,
    profileId: resolvedProfileId,
    feature: "memory-save",
    text: `${args.title}\n\n${args.content}`,
    failureLog: "embedding failed on create",
  });

  // ── Dedup layer 3: semantic similarity (near-duplicate)
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

  await schedulePostCreate(ctx, {
    clerkId: args.clerkId,
    memoryId: result.id,
    title: result.title,
    content: args.content,
    source: args.source,
    sourceType: args.sourceType,
    profileId: resolvedProfileId,
  });

  return result;
}

interface PostCreateParams {
  clerkId: string;
  memoryId: string;
  title: string;
  content: string;
  source: string;
  sourceType?: string;
  profileId: string;
}

/**
 * Fan out the post-create work: audit event, enrichment, chunking, V2
 * fact extraction, and debounced context_prompt regen. Each schedule
 * runs async — memory creation returns to the caller immediately.
 */
async function schedulePostCreate(
  ctx: ActionCtx,
  params: PostCreateParams,
): Promise<void> {
  await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
    clerkId: params.clerkId,
    eventType: "memory_created",
    memoryId: params.memoryId,
    payload: JSON.stringify({ title: params.title }),
  });

  await ctx.scheduler.runAfter(
    0,
    internal.neo4jActions.enrichment.enrichMemoryInternal,
    {
      clerkId: params.clerkId,
      memoryId: params.memoryId,
      title: params.title,
      content: params.content,
      profileId: params.profileId,
    },
  );

  // Long memories (>2 KB) get paragraph-level chunks so retrieval can
  // hit a specific passage instead of the whole document.
  if (shouldChunk(params.content)) {
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.memories.chunkMemoryInternal,
      {
        clerkId: params.clerkId,
        memoryId: params.memoryId,
        content: params.content,
        profileId: params.profileId,
      },
    );
  }

  // V2 ADD/UPDATE/DELETE/NONE pipeline. Only for prompt-capture so we
  // don't waste tokens on every dashboard save / file upload. The
  // `v2-extracted` guard prevents recursion: facts the V2 action ADDs
  // are themselves saved via createMemoryInternal but with sourceType
  // "v2-extracted", which we exclude here.
  if (
    params.source === "prompt-capture" &&
    params.sourceType !== "v2-extracted"
  ) {
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.factExtraction.extractFactsAndDecideInternal,
      {
        clerkId: params.clerkId,
        sourceMemoryId: params.memoryId,
        capturedPrompt: params.content,
        profileId: params.profileId,
      },
    );
  }

  await scheduleContextPromptInvalidation(ctx, params.clerkId);
}
