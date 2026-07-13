"use node";

/**
 * Memory create handler — Convex-local orchestration over Neo4j CRUD + post-create schedules.
 */

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Driver } from "neo4j-driver";
import { computeContentHash } from "../../../engine/neo4j/memory/mappers";
import {
  createMemory,
  findMemoryByContentHash,
  findMemoryByExternalId,
  findMemoryBySimilarity,
  findMemoryByTitleAndOrigin,
  shortCircuitOnDedupMatch,
  findMemoryByUrl,
} from "../../../engine/neo4j/memory/crud";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import { getDriver } from "../../../engine/neo4j/driver";
import { normalizeUrl } from "../../../engine/neo4j/url";
import {
  resolveProfileIdForClerkId,
  scheduleChunkSyncForContent,
  scheduleContextPromptInvalidation,
  toMemoryType,
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
  const memoryType = toMemoryType(args.type) ?? "knowledge";
  const normalizedUrl = args.url
    ? (normalizeUrl(args.url) ?? undefined)
    : undefined;

  async function checkDuplicate(
    finder: () => Promise<{
      id: string;
      title: string;
      updatedAt: string;
    } | null>,
  ): Promise<MemoryWithTags | null> {
    const ref = await finder();
    return shortCircuitOnDedupMatch(driver, args.clerkId, ref);
  }

  if (args.externalId && args.sourceType) {
    const sourceType = args.sourceType;
    const externalId = args.externalId;
    const hit = await checkDuplicate(() =>
      findMemoryByExternalId(driver, args.clerkId, sourceType, externalId),
    );
    if (hit) return hit;
  }

  if (normalizedUrl) {
    const hit = await checkDuplicate(() =>
      findMemoryByUrl(driver, args.clerkId, normalizedUrl),
    );
    if (hit) return hit;
  }

  if (normalizedUrl && BROWSER_SOURCES.has(args.source)) {
    try {
      const origin = new URL(normalizedUrl).origin;
      const hit = await checkDuplicate(() =>
        findMemoryByTitleAndOrigin(driver, args.clerkId, args.title, origin),
      );
      if (hit) return hit;
    } catch {
      // Invalid URL, skip this check
    }
  }

  const contentHash = computeContentHash(args.title, args.content);
  const hashHit = await checkDuplicate(() =>
    findMemoryByContentHash(driver, args.clerkId, contentHash),
  );
  if (hashHit) return hashHit;

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
    }
    const semanticHit = await shortCircuitOnDedupMatch(
      driver,
      args.clerkId,
      semanticMatch,
    );
    if (semanticHit) return semanticHit;
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

  await schedulePostCreate(ctx, driver, {
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
  driver: Driver,
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

  await scheduleChunkSyncForContent(ctx, driver, {
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
