"use node";

/**
 * Shared mechanics for memory CRUD actions.
 *
 * - Type validators (`toMemoryType`, `toMemoryStatus`) for the
 *   string-typed `type`/`status` action args.
 * - `scheduleContextPromptInvalidation` — debounced context-prompt
 *   regeneration trigger called from create/update/delete paths.
 * - `tryEmbedOne` / `tryEmbedMany` — best-effort OpenRouter embedding
 *   wrappers. Return null (or array of null) when the user has no API
 *   key or the call fails. Memory writes still succeed; backfill
 *   migration fills in nulls later.
 */

import { type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  generateEmbedding,
  generateEmbeddings,
  type OpenRouterFeature,
} from "../../lib/openRouter";
import { tryUserAndApiKeyByClerkId } from "../../lib/envVars";

export type MemoryType = "profile" | "episodic" | "knowledge";
export type MemoryStatus = "active" | "pinned" | "suppressed" | "expired";

function isMemoryType(s: string): s is MemoryType {
  return s === "profile" || s === "episodic" || s === "knowledge";
}

function isMemoryStatus(s: string): s is MemoryStatus {
  return (
    s === "active" || s === "pinned" || s === "suppressed" || s === "expired"
  );
}

export function toMemoryType(s: string | undefined): MemoryType | undefined {
  return s !== undefined && isMemoryType(s) ? s : undefined;
}

export function toMemoryStatus(
  s: string | undefined,
): MemoryStatus | undefined {
  return s !== undefined && isMemoryStatus(s) ? s : undefined;
}

/**
 * Resolve the profileId for a memory operation.
 * Priority: explicit profileId > default profile (created if missing).
 */
export async function resolveProfileIdForClerkId(
  ctx: ActionCtx,
  clerkId: string,
  explicitProfileId?: string,
): Promise<string> {
  if (explicitProfileId) {
    return explicitProfileId;
  }
  const profile = await ctx.runMutation(
    internal.profiles.getOrCreateDefaultByClerkIdInternal,
    { clerkId },
  );
  return profile._id;
}

/**
 * Mark the user's context_prompt cache as pending and — only on the
 * first invalidation in a burst — schedule the 60s debounce check.
 * Memory writes (create / update / delete) all funnel through here so
 * the MCP profile prompt eventually catches up without us regenerating
 * once per write.
 */
export async function scheduleContextPromptInvalidation(
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

interface EmbedParams {
  clerkId: string;
  profileId?: string;
  feature: OpenRouterFeature;
  failureLog: string;
}

/**
 * Best-effort single embedding. Returns null when the user has no
 * OPENROUTER_API_KEY or the call fails — caller falls back to a
 * fulltext-only path or skips the embedding entirely.
 */
export async function tryEmbedOne(
  ctx: ActionCtx,
  params: EmbedParams & { text: string },
): Promise<number[] | null> {
  try {
    const auth = await tryUserAndApiKeyByClerkId(
      ctx,
      params.clerkId,
      "OPENROUTER_API_KEY",
    );
    if (!auth) return null;
    return await generateEmbedding({
      ctx,
      apiKey: auth.apiKey,
      userId: auth.userId,
      profileId: params.profileId,
      feature: params.feature,
      text: params.text,
    });
  } catch (e) {
    console.warn(params.failureLog, e);
    return null;
  }
}

/**
 * Best-effort batch embedding. Returns an array of `texts.length` —
 * either all real vectors (success) or all null (no API key / failure).
 * Mirrors the original chunk-pipeline semantic where chunks without
 * embeddings still persist; backfill fills them in later.
 */
export async function tryEmbedMany(
  ctx: ActionCtx,
  params: EmbedParams & { texts: string[] },
): Promise<(number[] | null)[]> {
  try {
    const auth = await tryUserAndApiKeyByClerkId(
      ctx,
      params.clerkId,
      "OPENROUTER_API_KEY",
    );
    if (!auth) return params.texts.map(() => null);
    return await generateEmbeddings({
      ctx,
      apiKey: auth.apiKey,
      userId: auth.userId,
      profileId: params.profileId,
      feature: params.feature,
      texts: params.texts,
    });
  } catch (e) {
    console.warn(params.failureLog, e);
    return params.texts.map(() => null);
  }
}
