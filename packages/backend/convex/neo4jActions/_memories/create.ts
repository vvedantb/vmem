"use node";

/**
 * Memory create handler — Convex-local orchestration over Neo4j CRUD + post-create schedules.
 */

import { type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { computeContentHash } from "../../../engine/neo4j/memory/mappers";
import {
  createMemory,
  findMemoryByContentHash,
  findMemoryByExternalId,
  findMemoryBySimilarity,
  findMemoryByTitleAndOrigin,
  finalizeDedupHit,
  findMemoryByUrl,
} from "../../../engine/neo4j/memory/crud";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import { getDriver } from "../../../engine/neo4j/driver";
import { normalizeUrl } from "../../../engine/neo4j/url";
import {
  resolveProfileIdForClerkId,
  scheduleChunkSyncForContent,
  scheduleContextPromptInvalidation,
  tryEmbedOne,
} from "./shared";
import { scheduleMemoryEnrichment } from "./postMaterialize";
import { scheduleDreamTriggerCheck } from "../../lib/dreamTriggerInvalidate";

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
  externalId?: string;
  sourceType?: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
}

const BROWSER_SOURCES: ReadonlySet<string> = new Set([
  "browsing-history",
  "bookmarks",
]);

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

  if (args.externalId && args.sourceType) {
    const existing = await findMemoryByExternalId(
      driver,
      args.clerkId,
      args.sourceType,
      args.externalId,
    );
    if (existing) {
      const full = await finalizeDedupHit(driver, args.clerkId, existing.id);
      if (full) return full;
    }
  }

  if (normalizedUrl) {
    const existing = await findMemoryByUrl(driver, args.clerkId, normalizedUrl);
    if (existing) {
      const full = await finalizeDedupHit(driver, args.clerkId, existing.id);
      if (full) return full;
    }
  }

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
        const full = await finalizeDedupHit(
          driver,
          args.clerkId,
          titleMatch.id,
        );
        if (full) return full;
      }
    } catch {
      // Invalid URL, skip this check
    }
  }

  const contentHash = computeContentHash(args.title, args.content);
  const hashMatch = await findMemoryByContentHash(
    driver,
    args.clerkId,
    contentHash,
  );
  if (hashMatch) {
    const full = await finalizeDedupHit(driver, args.clerkId, hashMatch.id);
    if (full) return full;
  }

  const embedding = await tryEmbedOne(ctx, {
    clerkId: args.clerkId,
    profileId: resolvedProfileId,
    feature: "memory-save",
    text: `${args.title}\n\n${args.content}`,
    failureLog: "embedding failed on create",
  });

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
      const full = await finalizeDedupHit(
        driver,
        args.clerkId,
        semanticMatch.id,
      );
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

  await scheduleMemoryEnrichment(ctx, {
    clerkId: params.clerkId,
    memoryId: params.memoryId,
    title: params.title,
    content: params.content,
    profileId: params.profileId,
  });

  await scheduleChunkSyncForContent(ctx, getDriver(), {
    clerkId: params.clerkId,
    memoryId: params.memoryId,
    content: params.content,
    profileId: params.profileId,
    mode: "create",
  });

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

  // Dynamic Dreaming: count this write toward the trigger. Dream output
  // must never re-trigger dreaming (run loop).
  if (params.source !== "dream-mode") {
    await scheduleDreamTriggerCheck(ctx, params.clerkId);
  }
}
