import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { createGatewayChatCompletion } from "../../../engine/llm/aiGatewayClient";
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
  let reasoningTokens: number | undefined;
  let costUsd: number | undefined;

  try {
    const json = await createGatewayChatCompletion({
      apiKey: args.apiKey,
      model: args.model,
      messages: args.messages,
      temperature: args.temperature ?? 0.1,
    });

    content = json.content;
    generationId = json.id;
    finishReason = json.finishReason;
    promptTokens = json.usage.promptTokens;
    completionTokens = json.usage.completionTokens;
    totalTokens = json.usage.totalTokens;
    cachedTokens = json.usage.cachedTokens;
    reasoningTokens = json.usage.reasoningTokens;
    costUsd = json.usage.costUsd;

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
