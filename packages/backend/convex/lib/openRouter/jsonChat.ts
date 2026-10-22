import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { callOpenRouterChat, type ChatResult, type ChatThinking } from "./chat";
import { LLM_MODEL, type OpenRouterFeature } from "./shared";

const JSON_SYSTEM_INSTRUCTION =
  "Respond with ONLY valid JSON. No thinking, no markdown, no commentary.";

interface JsonChatArgs {
  apiKey: string;
  userId: Id<"users">;
  profileId?: string;
  feature: OpenRouterFeature;
  prompt: string;
  role?: string;
  model?: string;
  temperature?: number;
  thinking?: ChatThinking;
}

export async function callJsonChat(
  ctx: ActionCtx,
  args: JsonChatArgs,
): Promise<string | null> {
  const { content } = await callJsonChatWithUsage(ctx, args);
  return content;
}

// same call, plus the token and cost counts for callers that store them
export async function callJsonChatWithUsage(
  ctx: ActionCtx,
  args: JsonChatArgs,
): Promise<ChatResult> {
  const system = args.role
    ? `${args.role} ${JSON_SYSTEM_INSTRUCTION}`
    : JSON_SYSTEM_INSTRUCTION;

  return await callOpenRouterChat(ctx, {
    apiKey: args.apiKey,
    userId: args.userId,
    profileId: args.profileId,
    feature: args.feature,
    model: args.model ?? LLM_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: args.prompt },
    ],
    temperature: args.temperature ?? 0.1,
    thinking: args.thinking,
  });
}
