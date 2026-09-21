import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { generateGatewayText } from "../../../engine/llm/aiGateway";
import {
  COMPLETION_PREVIEW_BYTES,
  PROMPT_PREVIEW_BYTES,
  previewsEnabled,
  scheduleLog,
  truncate,
  type OpenRouterFeature,
} from "./shared";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatArgs {
  apiKey: string;
  userId: Id<"users">;
  profileId?: string;
  feature: OpenRouterFeature;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

export async function callOpenRouterChat(
  ctx: ActionCtx,
  args: ChatArgs,
): Promise<{ content: string | null }> {
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

  try {
    if (args.apiKey.length === 0) {
      throw new Error("AI_GATEWAY_API_KEY is not set");
    }
    const json = await generateGatewayText({
      model: args.model,
      messages: args.messages,
      temperature: args.temperature ?? 0.1,
    });

    content = json.text.length > 0 ? json.text : null;
    generationId = json.responseId;
    finishReason = json.finishReason;
    promptTokens = json.promptTokens;
    completionTokens = json.completionTokens;
    totalTokens = json.totalTokens;
    cachedTokens = json.cachedTokens;
    cacheWriteTokens = json.cacheWriteTokens;
    reasoningTokens = json.reasoningTokens;
    costUsd = json.costUsd;

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
    promptPreview,
    completionPreview,
  });

  return { content };
}

function joinMessagesForPreview(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
}
