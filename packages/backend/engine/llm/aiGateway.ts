import {
  embedMany,
  generateText,
  type JSONValue,
  type ProviderMetadata,
} from "ai";

export const AI_GATEWAY_CHAT_MODEL = "alibaba/qwen3.7-flash";
export const AI_GATEWAY_EMBEDDING_MODEL = "openai/text-embedding-3-small";

/** Cheapest AI Gateway service tier. No-op when the provider/model does not support tiers. */
export const FLEX_GATEWAY_PROVIDER_OPTIONS = {
  gateway: {
    serviceTier: "flex" as const,
  },
};

/** Per-provider options passed through to the AI SDK call. */
export type GatewayProviderOptions = Record<string, Record<string, JSONValue>>;

/**
 * Turns Qwen thinking off. The AI SDK Alibaba provider maps `enableThinking`
 * to `enable_thinking: false`; through the Gateway the provider key is
 * `alibaba`.
 */
export const THINKING_OFF: GatewayProviderOptions = {
  alibaba: { enableThinking: false },
};

const CHAT_MAX_RETRIES = 0;
const EMBEDDING_MAX_RETRIES = 4;

export interface GatewayChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GatewayTextResult {
  text: string;
  finishReason?: string;
  responseId?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
}

export interface GatewayEmbeddingResult {
  embeddings: number[][];
  tokens?: number;
  costUsd?: number;
}

export interface GatewayTextCall {
  model: string;
  messages: GatewayChatMessage[];
  temperature?: number;
  providerOptions?: GatewayProviderOptions;
}

export async function generateGatewayText(
  args: GatewayTextCall,
  generate: (
    call: GatewayTextCall,
  ) => Promise<GatewayTextResult> = generateWithSdk,
): Promise<GatewayTextResult> {
  return generate({
    model: args.model,
    messages: args.messages,
    temperature: args.temperature ?? 0.1,
    ...(args.providerOptions ? { providerOptions: args.providerOptions } : {}),
  });
}

/** Flex tier always; caller options (e.g. THINKING_OFF) are added on top. */
export function buildChatProviderOptions(
  extra: GatewayProviderOptions | undefined,
): GatewayProviderOptions {
  return { ...FLEX_GATEWAY_PROVIDER_OPTIONS, ...extra };
}

async function generateWithSdk(
  call: GatewayTextCall,
): Promise<GatewayTextResult> {
  const result = await generateText({
    model: call.model,
    messages: call.messages,
    temperature: call.temperature,
    maxRetries: CHAT_MAX_RETRIES,
    allowSystemInMessages: true,
    providerOptions: buildChatProviderOptions(call.providerOptions),
  });
  return {
    text: result.text,
    finishReason: result.finishReason,
    responseId: result.response.id,
    promptTokens: result.usage.inputTokens,
    completionTokens: result.usage.outputTokens,
    totalTokens: result.usage.totalTokens,
    cachedTokens: result.usage.inputTokenDetails.cacheReadTokens,
    cacheWriteTokens: result.usage.inputTokenDetails.cacheWriteTokens,
    reasoningTokens: result.usage.outputTokenDetails.reasoningTokens,
    costUsd: readGatewayCost(result.providerMetadata),
  };
}

export async function embedGatewayTexts(args: {
  model: string;
  values: string[];
  maxRetries?: number;
}): Promise<GatewayEmbeddingResult> {
  const result = await embedMany({
    model: args.model,
    values: args.values,
    maxRetries: args.maxRetries ?? EMBEDDING_MAX_RETRIES,
    providerOptions: {
      ...FLEX_GATEWAY_PROVIDER_OPTIONS,
    },
  });
  return {
    embeddings: result.embeddings,
    tokens: result.usage.tokens,
    costUsd: readGatewayCost(result.providerMetadata),
  };
}

export function readGatewayCost(
  metadata: ProviderMetadata | undefined,
): number | undefined {
  const cost = metadata?.gateway?.cost;
  if (typeof cost === "number" && Number.isFinite(cost)) return cost;
  if (typeof cost !== "string" || cost.trim().length === 0) return undefined;
  const parsed = Number(cost);
  return Number.isFinite(parsed) ? parsed : undefined;
}
