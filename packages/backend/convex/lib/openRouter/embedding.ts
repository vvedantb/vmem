/**
 * OpenRouter embedding wrapper. Splits inputs into batches of 20,
 * fires one SDK call per batch, retries on 429 with exponential
 * backoff (each retry logs as its own row). Throws on any
 * non-recoverable failure — callers wrap in try/catch and degrade
 * to fulltext-only / no-embedding.
 */

import type { CreateEmbeddingsResponseBody } from "@openrouter/sdk/models/operations";
import pRetry from "p-retry";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { createOpenRouterClient } from "./client";
import {
  PROMPT_PREVIEW_BYTES,
  previewsEnabled,
  scheduleLog,
  truncate,
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
 * vectors. `p-retry` retries any thrown failure; each attempt logs as
 * its own row (so the dashboard reflects provider load).
 */
async function postEmbeddingChunkWithRetry(
  args: EmbeddingChunkArgs,
): Promise<EmbeddingItem[]> {
  return pRetry(
    async () => {
      const previews = previewsEnabled();
      const promptPreview = previews
        ? truncate(args.input.join("\n---\n"), PROMPT_PREVIEW_BYTES)
        : undefined;

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

        const items = validateEmbeddingItems(response.data, args.input.length);
        const promptTokens = response.usage?.promptTokens ?? undefined;
        const totalTokens = response.usage?.totalTokens ?? undefined;
        const costUsd =
          response.usage?.cost ?? computeEmbeddingCost(totalTokens);

        await scheduleLog(args.ctx, {
          userId: args.userId,
          profileId: args.profileId,
          feature: args.feature,
          endpoint: "embedding",
          model: EMBEDDING_MODEL,
          generationId: response.id,
          promptTokens,
          totalTokens,
          costUsd,
          promptPreview,
        });

        return items;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        await scheduleLog(args.ctx, {
          userId: args.userId,
          profileId: args.profileId,
          feature: args.feature,
          endpoint: "embedding",
          model: EMBEDDING_MODEL,
          errorMessage,
          promptPreview,
        });
        throw e instanceof Error ? e : new Error(errorMessage);
      }
    },
    {
      retries: EMBEDDING_MAX_RETRY_ATTEMPTS,
      minTimeout: 500,
      factor: 2,
      randomize: true,
    },
  );
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
