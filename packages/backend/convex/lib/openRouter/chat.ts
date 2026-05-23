/**
 * OpenRouter chat completion wrapper. Owns the chat-specific HTTP
 * shape, response parsing, and metric extraction (cost, finish reason,
 * cached/cache-write/reasoning token breakdown). Logs one
 * `openRouterLogs` row per attempt via `scheduleLog`.
 *
 * Inline `usage:{include:true}` is on by default — cost arrives in the
 * response so we never need a follow-up `/generation` call.
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  COMPLETION_PREVIEW_BYTES,
  PROMPT_PREVIEW_BYTES,
  classifyHttpStatus,
  numberOrUndef,
  openRouterHeaders,
  previewsEnabled,
  readErrorBody,
  scheduleLog,
  truncate,
  type ErrorClass,
  type OpenRouterFeature,
} from "./shared";

const CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatChoice {
  message?: { content?: string };
  finish_reason?: string;
  native_finish_reason?: string;
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  cost_details?: { upstream_inference_cost?: number };
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  completion_tokens_details?: { reasoning_tokens?: number };
  is_byok?: boolean;
}

interface ChatCompletionResponse {
  id?: string;
  provider?: string;
  choices?: ChatChoice[];
  usage?: ChatUsage;
}

interface ChatArgs {
  apiKey: string;
  userId: Id<"users">;
  /**
   * Plain-string profile id — most callers thread profileId through
   * string-typed action args (string-typed at the Neo4j boundary).
   * `recordInternal` normalises to `Id<"profiles">` before insert.
   */
  profileId?: string;
  feature: OpenRouterFeature;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

export interface ChatResult {
  /** `null` when the call failed or the response was unparseable. */
  content: string | null;
  status: number;
  ok: boolean;
}

/**
 * Fire one chat-completion call and log the outcome. Single shared
 * implementation handles cost/usage extraction, privacy-gated previews,
 * and latency timing — call sites only see `{ content, status, ok }`.
 */
export async function callOpenRouterChat(
  ctx: ActionCtx,
  args: ChatArgs,
): Promise<ChatResult> {
  const start = performance.now();
  const previews = previewsEnabled();
  const promptPreview = previews
    ? truncate(joinMessagesForPreview(args.messages), PROMPT_PREVIEW_BYTES)
    : undefined;

  let status = 0;
  let ok = false;
  let errorClass: ErrorClass | undefined;
  let errorMessage: string | undefined;
  let content: string | null = null;
  let generationId: string | undefined;
  let provider: string | undefined;
  let finishReason: string | undefined;
  let nativeFinishReason: string | undefined;
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let totalTokens: number | undefined;
  let cachedTokens: number | undefined;
  let cacheWriteTokens: number | undefined;
  let reasoningTokens: number | undefined;
  let costUsd: number | undefined;
  let upstreamCostUsd: number | undefined;
  let isByok: boolean | undefined;

  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: openRouterHeaders(args.apiKey),
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        temperature: args.temperature ?? 0.1,
        // Inline cost accounting — saves a follow-up /generation call.
        usage: { include: true },
      }),
    });

    status = res.status;
    ok = res.ok;
    if (!res.ok) {
      errorClass = classifyHttpStatus(status);
      errorMessage = await readErrorBody(res, status);
    } else {
      try {
        const json: ChatCompletionResponse = await res.json();
        content = extractChatContent(json);
        generationId = typeof json.id === "string" ? json.id : undefined;
        provider =
          typeof json.provider === "string" ? json.provider : undefined;
        const first = json.choices?.[0];
        finishReason =
          typeof first?.finish_reason === "string"
            ? first.finish_reason
            : undefined;
        nativeFinishReason =
          typeof first?.native_finish_reason === "string"
            ? first.native_finish_reason
            : undefined;

        const usage = json.usage;
        promptTokens = numberOrUndef(usage?.prompt_tokens);
        completionTokens = numberOrUndef(usage?.completion_tokens);
        totalTokens = numberOrUndef(usage?.total_tokens);
        cachedTokens = numberOrUndef(
          usage?.prompt_tokens_details?.cached_tokens,
        );
        cacheWriteTokens = numberOrUndef(
          usage?.prompt_tokens_details?.cache_write_tokens,
        );
        reasoningTokens = numberOrUndef(
          usage?.completion_tokens_details?.reasoning_tokens,
        );
        costUsd = numberOrUndef(usage?.cost);
        upstreamCostUsd = numberOrUndef(
          usage?.cost_details?.upstream_inference_cost,
        );
        isByok =
          typeof usage?.is_byok === "boolean" ? usage.is_byok : undefined;

        if (content === null) {
          // Successful HTTP, malformed body — flag so the dashboard
          // can surface "ok response but no content" rows distinctly.
          errorClass = "parse";
          errorMessage = "no string content in choices[0].message";
        }
      } catch (e) {
        ok = false;
        errorClass = "parse";
        errorMessage = e instanceof Error ? e.message : "parse failed";
      }
    }
  } catch (e) {
    ok = false;
    errorClass = "network";
    errorMessage = e instanceof Error ? e.message : "network error";
  }

  const latencyMs = Math.round(performance.now() - start);
  const completionPreview =
    previews && content !== null
      ? truncate(content, COMPLETION_PREVIEW_BYTES)
      : undefined;

  await scheduleLog(ctx, {
    userId: args.userId,
    profileId: args.profileId,
    feature: args.feature,
    endpoint: "chat",
    model: args.model,
    status,
    ok,
    errorClass,
    errorMessage,
    latencyMs,
    generationId,
    provider,
    finishReason,
    nativeFinishReason,
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    cacheWriteTokens,
    reasoningTokens,
    costUsd,
    upstreamCostUsd,
    isByok,
    promptPreview,
    completionPreview,
  });

  return { content, status, ok };
}

function joinMessagesForPreview(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
}

function extractChatContent(json: ChatCompletionResponse): string | null {
  const c = json.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : null;
}
