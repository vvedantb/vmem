/**
 * Shared types, constants, and helpers for OpenRouter API calls.
 *
 * Both chat completions and embeddings need: feature taxonomy for
 * spend attribution, error-class taxonomy for log dashboards,
 * privacy-gated prompt previews, and a scheduled `openRouterLogs`
 * row per HTTP attempt. This file owns the shared bits; `chat.ts`
 * and `embedding.ts` own the per-endpoint shapes.
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";

export type OpenRouterFeature =
  // Chat completions
  | "chat"
  | "enrichment"
  | "dream-synthesis"
  | "context-prompt"
  | "fact-extraction"
  | "entity-backfill"
  // Embeddings
  | "memory-save"
  | "memory-search"
  | "mcp-embed"
  | "connector-sync"
  | "dream-materialize"
  | "proposal-accept"
  | "embedding-backfill";

export type ErrorClass =
  | "network"
  | "http_4xx"
  | "http_5xx"
  | "parse"
  | "timeout";

/** Privacy default — only populate prompt/completion previews when the
 *  deploy explicitly opts in. */
export const PROMPT_PREVIEW_BYTES = 4096;
export const COMPLETION_PREVIEW_BYTES = 2048;

export interface LogPayload {
  userId: Id<"users">;
  profileId?: string;
  feature: OpenRouterFeature;
  endpoint: "chat" | "embedding";
  model: string;
  status: number;
  ok: boolean;
  errorClass?: ErrorClass;
  errorMessage?: string;
  latencyMs: number;
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

export function classifyHttpStatus(status: number): ErrorClass | undefined {
  if (status >= 500 && status < 600) return "http_5xx";
  if (status >= 400 && status < 500) return "http_4xx";
  return undefined;
}

export function numberOrUndef(
  n: number | undefined | null,
): number | undefined {
  return typeof n === "number" ? n : undefined;
}
