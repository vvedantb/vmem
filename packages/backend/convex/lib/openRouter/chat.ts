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
import { createOpenRouterClient } from "./client";
import {
  COMPLETION_PREVIEW_BYTES,
  PROMPT_PREVIEW_BYTES,
  previewsEnabled,
  scheduleLog,
  truncate,
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
}

/**
 * Fire one chat-completion call and log the outcome. Single shared
 * implementation handles cost/usage extraction and privacy-gated
 * previews — call sites only see `{ content }`.
 */
export async function callOpenRouterChat(
  ctx: ActionCtx,
  args: ChatArgs,
): Promise<ChatResult> {
  const previews = previewsEnabled();
  const promptPreview = previews
    ? truncate(joinMessagesForPreview(args.messages), PROMPT_PREVIEW_BYTES)
    : undefined;

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

    content = extractChatContent(json);
    generationId = json.id;
    const finishReasonRaw = json.choices.at(0)?.finishReason;
    finishReason =
      typeof finishReasonRaw === "string" ? finishReasonRaw : undefined;

    const usage = json.usage;
    promptTokens = usage?.promptTokens ?? undefined;
    completionTokens = usage?.completionTokens ?? undefined;
    totalTokens = usage?.totalTokens ?? undefined;
    cachedTokens = usage?.promptTokensDetails?.cachedTokens ?? undefined;
    cacheWriteTokens =
      usage?.promptTokensDetails?.cacheWriteTokens ?? undefined;
    reasoningTokens =
      usage?.completionTokensDetails?.reasoningTokens ?? undefined;
    costUsd = usage?.cost ?? undefined;
    upstreamCostUsd = usage?.costDetails?.upstreamInferenceCost ?? undefined;
    isByok = usage?.isByok;

    if (content === null) {
      errorMessage = "no string content in choices[0].message";
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
  }

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
    errorMessage,
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

  return { content };
}

function joinMessagesForPreview(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
}

function extractChatContent(json: SdkChatResult): string | null {
  const messageContent = json.choices.at(0)?.message?.content;
  return typeof messageContent === "string" ? messageContent : null;
}
