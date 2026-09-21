export const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

export const AI_GATEWAY_CHAT_MODEL = "alibaba/qwen3.7-flash";
export const AI_GATEWAY_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export interface GatewayChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GatewayUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
}

export interface GatewayChatCompletion {
  id?: string;
  content: string | null;
  finishReason?: string;
  usage: GatewayUsage;
}

export interface GatewayEmbeddingItem {
  embedding: number[] | string;
  index?: number;
}

export interface GatewayEmbeddingResponse {
  id?: string;
  data: GatewayEmbeddingItem[];
  usage: GatewayUsage;
}

type FetchImpl = typeof fetch;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function costNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function parseGatewayUsage(body: unknown): GatewayUsage {
  const root = asRecord(body);
  const usage = asRecord(root?.usage);
  const promptDetails = asRecord(usage?.prompt_tokens_details);
  const completionDetails = asRecord(usage?.completion_tokens_details);
  const providerMetadata =
    asRecord(root?.providerMetadata) ?? asRecord(root?.provider_metadata);
  const gateway = asRecord(providerMetadata?.gateway);
  return {
    promptTokens: finiteNumber(usage?.prompt_tokens),
    completionTokens: finiteNumber(usage?.completion_tokens),
    totalTokens: finiteNumber(usage?.total_tokens),
    cachedTokens: finiteNumber(promptDetails?.cached_tokens),
    reasoningTokens: finiteNumber(completionDetails?.reasoning_tokens),
    costUsd: costNumber(gateway?.cost) ?? costNumber(usage?.cost),
  };
}

function errorMessageFromBody(
  body: unknown,
  status: number,
  raw: string,
): string {
  const error = asRecord(asRecord(body)?.error);
  const message = error?.message;
  if (typeof message === "string" && message.length > 0) {
    return `ai gateway http ${String(status)}: ${message}`;
  }
  const trimmed = raw.trim();
  if (trimmed.length > 0) {
    return `ai gateway http ${String(status)}: ${trimmed.slice(0, 500)}`;
  }
  return `ai gateway http ${String(status)}`;
}

async function postGateway(args: {
  apiKey: string;
  path: "/chat/completions" | "/embeddings";
  body: unknown;
  fetchImpl?: FetchImpl;
}): Promise<unknown> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(`${AI_GATEWAY_BASE_URL}${args.path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.body),
  });
  const text = await response.text();
  let json: unknown;
  if (text.length > 0) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      if (!response.ok) {
        throw new Error(errorMessageFromBody(undefined, response.status, text));
      }
      throw new Error("ai gateway: response was not JSON");
    }
  }
  if (!response.ok) {
    throw new Error(errorMessageFromBody(json, response.status, text));
  }
  if (json === undefined) {
    throw new Error("ai gateway: empty response");
  }
  return json;
}

export async function createGatewayChatCompletion(args: {
  apiKey: string;
  model: string;
  messages: GatewayChatMessage[];
  temperature?: number;
  fetchImpl?: FetchImpl;
}): Promise<GatewayChatCompletion> {
  const json = await postGateway({
    apiKey: args.apiKey,
    path: "/chat/completions",
    fetchImpl: args.fetchImpl,
    body: {
      model: args.model,
      messages: args.messages,
      temperature: args.temperature ?? 0.1,
      stream: false,
    },
  });
  const root = asRecord(json);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const choice = asRecord(choices[0]);
  const message = asRecord(choice?.message);
  const content = message?.content;
  const finishReason = choice?.finish_reason;
  const id = root?.id;
  return {
    id: typeof id === "string" ? id : undefined,
    content: typeof content === "string" ? content : null,
    finishReason: typeof finishReason === "string" ? finishReason : undefined,
    usage: parseGatewayUsage(json),
  };
}

export async function createGatewayEmbeddings(args: {
  apiKey: string;
  model: string;
  input: string[];
  dimensions?: number;
  fetchImpl?: FetchImpl;
}): Promise<GatewayEmbeddingResponse> {
  const json = await postGateway({
    apiKey: args.apiKey,
    path: "/embeddings",
    fetchImpl: args.fetchImpl,
    body: {
      model: args.model,
      input: args.input,
      ...(args.dimensions === undefined ? {} : { dimensions: args.dimensions }),
    },
  });
  const root = asRecord(json);
  const data = Array.isArray(root?.data) ? root.data : [];
  const id = root?.id;
  return {
    id: typeof id === "string" ? id : undefined,
    data: data.map((item) => {
      const record = asRecord(item);
      const embedding = record?.embedding;
      const index = record?.index;
      return {
        embedding: Array.isArray(embedding)
          ? (embedding as number[])
          : typeof embedding === "string"
            ? embedding
            : [],
        index: typeof index === "number" ? index : undefined,
      };
    }),
    usage: parseGatewayUsage(json),
  };
}
