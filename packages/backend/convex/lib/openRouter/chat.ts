/**
 * OpenRouter chat completion wrapper. Owns the chat-specific request
 * shape, response parsing, and metric extraction (cost, finish reason,
 * cached/cache-write/reasoning token breakdown). Logs one
 * `openRouterLogs` row per attempt via `scheduleLog`.
 *
 * Uses `@openrouter/sdk` — cost arrives in `usage.cost` when available.
 */

import type { ChatResult as SdkChatResult } from "@openrouter/sdk/models";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { createOpenRouterClient, readOpenRouterError } from "./client";
import {
  COMPLETION_PREVIEW_BYTES,
  PROMPT_PREVIEW_BYTES,
  classifyHttpStatus,
  numberOrUndef,
  previewsEnabled,
  scheduleLog,
  truncate,
  type ErrorClass,
  type OpenRouterFeature,
} from "./shared";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

  let status: number;
  let ok: boolean;
  let errorClass: ErrorClass | undefined;
  let errorMessage: string | undefined;
  let content: string | null = null;
  let generationId: string | undefined;
  let finishReason: string | undefined;
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
    const client = createOpenRouterClient(args.apiKey);
    const json = await client.chat.send({
      chatRequest: {
        model: args.model,
        messages: args.messages,
        temperature: args.temperature ?? 0.1,
        stream: false,
      },
    });

    status = 200;
    ok = true;
    content = extractChatContent(json);
    generationId = json.id;
    const first = json.choices[0];
    finishReason =
      typeof first?.finishReason === "string" ? first.finishReason : undefined;

    const usage = json.usage;
    promptTokens = numberOrUndef(usage?.promptTokens);
    completionTokens = numberOrUndef(usage?.completionTokens);
    totalTokens = numberOrUndef(usage?.totalTokens);
    cachedTokens = numberOrUndef(usage?.promptTokensDetails?.cachedTokens);
    cacheWriteTokens = numberOrUndef(
      usage?.promptTokensDetails?.cacheWriteTokens,
    );
    reasoningTokens = numberOrUndef(
      usage?.completionTokensDetails?.reasoningTokens,
    );
    costUsd = numberOrUndef(usage?.cost);
    upstreamCostUsd = numberOrUndef(usage?.costDetails?.upstreamInferenceCost);
    isByok = usage?.isByok;

    if (content === null) {
      ok = false;
      errorClass = "parse";
      errorMessage = "no string content in choices[0].message";
    }
  } catch (e) {
    ok = false;
    const err = readOpenRouterError(e);
    status = err.status;
    errorMessage = err.message;
    errorClass =
      status > 0 ? (classifyHttpStatus(status) ?? "network") : "network";
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
    finishReason,
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

function extractChatContent(json: SdkChatResult): string | null {
  const messageContent = json.choices[0]?.message?.content;
  return typeof messageContent === "string" ? messageContent : null;
}
