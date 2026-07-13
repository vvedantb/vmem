/**
 * Shared types, constants, and helpers for OpenRouter API calls.
 *
 * Both chat completions and embeddings need: feature taxonomy for
 * spend attribution, privacy-gated prompt previews, and a scheduled
 * `openRouterLogs` row per HTTP attempt. This file owns the shared
 * bits; `chat.ts` and `embedding.ts` own the per-endpoint shapes.
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import type { OpenRouterEndpoint, OpenRouterFeature } from "./schemas";

export type { OpenRouterEndpoint, OpenRouterFeature };

/**
 * Default model for every server-side LLM reasoning call — enrichment,
 * fact extraction, dream synthesis, context-prompt summary, retrieval
 * helper, and entity backfill. Single source of truth: change it here
 * and all callers follow.
 */
export const LLM_MODEL = "qwen/qwen3-235b-a22b-2507";

/** Privacy default — only populate prompt/completion previews when the
 *  deploy explicitly opts in. */
export const PROMPT_PREVIEW_BYTES = 4096;
export const COMPLETION_PREVIEW_BYTES = 2048;

export interface LogPayload {
  userId: Id<"users">;
  profileId?: string;
  feature: OpenRouterFeature;
  endpoint: OpenRouterEndpoint;
  model: string;
  errorMessage?: string;
  generationId?: string;
  provider?: string;
  finishReason?: string;
  nativeFinishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  upstreamCostUsd?: number;
  isByok?: boolean;
  promptPreview?: string;
  completionPreview?: string;
}

/**
 * Schedule one `openRouterLogs` row per HTTP attempt. Wrapped in
 * try/catch — observability must not take down the user's request.
 */
export async function scheduleLog(
  ctx: ActionCtx,
  payload: LogPayload,
): Promise<void> {
  try {
    await ctx.scheduler.runAfter(
      0,
      internal.openRouterLogs.recordInternal,
      payload,
    );
  } catch (e) {
    console.error("[openRouter] failed to schedule log row", e);
  }
}

export function previewsEnabled(): boolean {
  return process.env.OPENROUTER_LOG_PROMPTS === "1";
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}
