/**
 * OpenRouter embedding wrapper. Splits inputs into batches of 20,
 * fires one SDK call per batch, retries on 429 with exponential
 * backoff (each retry logs as its own row). Throws on any
 * non-recoverable failure — callers wrap in try/catch and degrade
 * to fulltext-only / no-embedding.
 */

import type { CreateEmbeddingsResponseBody } from "@openrouter/sdk/models/operations";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { createOpenRouterClient } from "./client";
import {
  PROMPT_PREVIEW_BYTES,
  classifyOpenRouterFailure,
  numberOrUndef,
  previewsEnabled,
  scheduleLog,
  truncate,
  type ErrorClass,
  type OpenRouterFeature,
} from "./shared";

/**
 * Hardcoded embedding model — the only one the codebase has ever used.
 * Exposed so the rest of the codebase can keep importing
 * `EMBEDDING_DIMENSIONS` from a single canonical place.
 */
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** Per-1k-token USD cost per embedding model — fallback when the API
 *  does not return inline cost. Numbers from openrouter.ai/models. */
const EMBEDDING_PRICE_USD_PER_1K: Record<string, number> = {
  "openai/text-embedding-3-small": 0.00002,
};

const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_MAX_RETRY_ATTEMPTS = 4;
/** text-embedding-3-small allows up to ~8191 tokens. 6000 chars is a
 *  conservative byte-level cap that stays well under the limit. */
const EMBEDDING_MAX_INPUT_CHARS = 6000;

interface EmbeddingItem {
  embedding: number[];
  index: number;
}

export interface EmbeddingCallArgs {
  ctx: ActionCtx;
  apiKey: string;
  userId: Id<"users">;
  /** Plain-string profile id — see `chat.ts`'s `ChatArgs.profileId`. */
  profileId?: string;
  feature: OpenRouterFeature;
}

/**
 * Generate one embedding vector. Throws on any non-recoverable failure
 * after retries. Callers wrap in try/catch to fall back to fulltext
 * search or skip the embedding altogether.
 */
export async function generateEmbedding(
  args: EmbeddingCallArgs & { text: string },
): Promise<number[]> {
  const { text, ...rest } = args;
  const vectors = await generateEmbeddings({ ...rest, texts: [text] });
  const first = vectors[0];
  if (!first) throw new Error("openRouter: embedding response missing vector");
  return first;
}

/**
 * Generate embeddings for many inputs. Splits into 20-input SDK
 * requests internally; each chunk is one log row + one retry envelope.
 * Returned vectors are in the same order as the `texts` input.
 */
export async function generateEmbeddings(
  args: EmbeddingCallArgs & { texts: string[] },
): Promise<number[][]> {
  const out: number[][] = Array.from({ length: args.texts.length });
  for (
    let offset = 0;
    offset < args.texts.length;
    offset += EMBEDDING_BATCH_SIZE
  ) {
    const slice = args.texts
      .slice(offset, offset + EMBEDDING_BATCH_SIZE)
      .map((text) => truncate(text, EMBEDDING_MAX_INPUT_CHARS));
    const response = await postEmbeddingChunkWithRetry({
      ctx: args.ctx,
      apiKey: args.apiKey,
      userId: args.userId,
      profileId: args.profileId,
      feature: args.feature,
      input: slice,
    });
    for (const item of response) {
      out[offset + item.index] = item.embedding;
    }
  }
  return out;
}

interface EmbeddingChunkArgs {
  ctx: ActionCtx;
  apiKey: string;
  userId: Id<"users">;
  profileId?: string;
  feature: OpenRouterFeature;
  input: string[];
}

/**
 * Fire one embedding SDK call, log the outcome, return validated
 * vectors. Retries on 429 with exponential backoff; each retry is its
 * own log row (so the dashboard reflects actual provider load).
 */
async function postEmbeddingChunkWithRetry(
  args: EmbeddingChunkArgs,
  attempt = 0,
): Promise<EmbeddingItem[]> {
  const start = performance.now();
  const previews = previewsEnabled();
  const promptPreview = previews
    ? truncate(args.input.join("\n---\n"), PROMPT_PREVIEW_BYTES)
    : undefined;

  let status: number;
  let ok: boolean;
  let errorClass: ErrorClass | undefined;
  let errorMessage: string | undefined;
  let items: EmbeddingItem[] | null = null;
  let generationId: string | undefined;
  let promptTokens: number | undefined;
  let totalTokens: number | undefined;
  let inlineCostUsd: number | undefined;

  try {
    const client = createOpenRouterClient(args.apiKey);
    const response = await client.embeddings.generate({
      requestBody: {
        model: EMBEDDING_MODEL,
        input: args.input,
      },
    });

    if (typeof response === "string") {
      throw new Error("embedding response: unexpected string body");
    }

    status = 200;
    ok = true;
    items = validateEmbeddingItems(response.data, args.input.length);
    generationId = response.id;
    promptTokens = numberOrUndef(response.usage?.promptTokens);
    totalTokens = numberOrUndef(response.usage?.totalTokens);
    inlineCostUsd = numberOrUndef(response.usage?.cost);
  } catch (e) {
    ok = false;
    ({ status, errorMessage, errorClass } = classifyOpenRouterFailure(e));
  }

  const latencyMs = Math.round(performance.now() - start);
  const costUsd = inlineCostUsd ?? computeEmbeddingCost(totalTokens);

  await scheduleLog(args.ctx, {
    userId: args.userId,
    profileId: args.profileId,
    feature: args.feature,
    endpoint: "embedding",
    model: EMBEDDING_MODEL,
    status,
    ok,
    errorClass,
    errorMessage,
    latencyMs,
    generationId,
    promptTokens,
    totalTokens,
    costUsd,
    promptPreview,
  });

  // Retry only on 429 (transient rate limit). All other failures
  // bubble up to the caller, which already wraps the call in
  // try/catch and degrades to fulltext-only / no-embedding.
  if (status === 429 && attempt < EMBEDDING_MAX_RETRY_ATTEMPTS) {
    const delay = 2 ** attempt * 500;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return postEmbeddingChunkWithRetry(args, attempt + 1);
  }

  if (!ok || items === null) {
    throw new Error(
      `openRouter embedding ${String(status)}: ${errorMessage ?? "unknown"}`,
    );
  }

  return items;
}

function validateEmbeddingItems(
  data: CreateEmbeddingsResponseBody["data"],
  expectedCount: number,
): EmbeddingItem[] {
  if (data.length !== expectedCount) {
    throw new Error(
      `embedding response: expected ${String(expectedCount)} and got ${String(data.length)}`,
    );
  }

  const items: EmbeddingItem[] = [];
  for (const item of data) {
    const embedding = readFloatEmbedding(item.embedding);
    const index = item.index ?? items.length;
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `embedding response: expected ${String(EMBEDDING_DIMENSIONS)} dims, got ${String(embedding.length)}`,
      );
    }
    items.push({ embedding, index });
  }

  return items;
}

function readFloatEmbedding(embedding: Array<number> | string): number[] {
  if (Array.isArray(embedding)) {
    return embedding;
  }
  throw new Error("embedding response: expected float array");
}

function computeEmbeddingCost(
  totalTokens: number | undefined,
): number | undefined {
  const pricePer1k = EMBEDDING_PRICE_USD_PER_1K[EMBEDDING_MODEL];
  if (typeof totalTokens !== "number" || typeof pricePer1k !== "number") {
    return undefined;
  }
  return (totalTokens / 1000) * pricePer1k;
}
