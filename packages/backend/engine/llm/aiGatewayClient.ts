import { z } from "zod";

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

const finite = z.number().finite();
const costSchema = z.union([finite, z.string()]);

const usageSchema = z
  .object({
    prompt_tokens: finite.optional(),
    completion_tokens: finite.optional(),
    total_tokens: finite.optional(),
    cost: costSchema.optional(),
    prompt_tokens_details: z
      .object({ cached_tokens: finite.optional() })
      .passthrough()
      .optional(),
    completion_tokens_details: z
      .object({ reasoning_tokens: finite.optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const providerMetadataSchema = z
  .object({
    gateway: z.object({ cost: costSchema.optional() }).passthrough().optional(),
  })
  .passthrough();

const gatewayBodySchema = z
  .object({
    id: z.string().optional(),
    usage: usageSchema.optional(),
    providerMetadata: providerMetadataSchema.optional(),
    provider_metadata: providerMetadataSchema.optional(),
    choices: z
      .array(
        z
          .object({
            finish_reason: z.string().nullable().optional(),
            message: z
              .object({ content: z.string().nullable().optional() })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    data: z
      .array(
        z
          .object({
            index: finite.optional(),
            embedding: z.union([z.array(finite), z.string()]).optional(),
          })
          .passthrough(),
      )
      .optional(),
    error: z
      .object({ message: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

type GatewayBody = z.infer<typeof gatewayBodySchema>;

function readCost(value: number | string | undefined): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function emptyUsage(): GatewayUsage {
  return {
    promptTokens: undefined,
    completionTokens: undefined,
    totalTokens: undefined,
    cachedTokens: undefined,
    reasoningTokens: undefined,
    costUsd: undefined,
  };
}

function usageFromBody(body: GatewayBody): GatewayUsage {
  const metadata = body.providerMetadata ?? body.provider_metadata;
  return {
    promptTokens: body.usage?.prompt_tokens,
    completionTokens: body.usage?.completion_tokens,
    totalTokens: body.usage?.total_tokens,
    cachedTokens: body.usage?.prompt_tokens_details?.cached_tokens,
    reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens,
    costUsd: readCost(metadata?.gateway?.cost) ?? readCost(body.usage?.cost),
  };
}

export function parseGatewayUsage(body: unknown): GatewayUsage {
  const parsed = gatewayBodySchema.safeParse(body);
  if (!parsed.success) return emptyUsage();
  return usageFromBody(parsed.data);
}

function errorMessageFromBody(
  body: unknown,
  status: number,
  raw: string,
): string {
  const parsed = gatewayBodySchema.safeParse(body);
  const message = parsed.success ? parsed.data.error?.message : undefined;
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

function parseGatewayBody(json: unknown, label: string): GatewayBody {
  const parsed = gatewayBodySchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`ai gateway: ${label} response failed validation`);
  }
  return parsed.data;
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
  const body = parseGatewayBody(json, "chat");
  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  return {
    id: body.id,
    content: typeof content === "string" ? content : null,
    finishReason: choice?.finish_reason ?? undefined,
    usage: usageFromBody(body),
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
  const body = parseGatewayBody(json, "embedding");
  return {
    id: body.id,
    data: (body.data ?? []).map((item) => ({
      embedding: item.embedding ?? [],
      index: item.index,
    })),
    usage: usageFromBody(body),
  };
}
