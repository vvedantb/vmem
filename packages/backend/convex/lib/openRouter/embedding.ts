import {
  validateEmbeddingItems,
  type EmbeddingItem,
} from "../../../engine/llm/embeddingResponse";
import { MEMORY_EMBEDDING_DIMENSIONS } from "../../../engine/memory/searchableText";
import {
  AI_GATEWAY_EMBEDDING_MODEL,
  embedGatewayTexts,
} from "../../../engine/llm/aiGateway";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  PROMPT_PREVIEW_BYTES,
  previewsEnabled,
  scheduleLog,
  truncate,
  type OpenRouterFeature,
} from "./shared";

const EMBEDDING_MODEL = AI_GATEWAY_EMBEDDING_MODEL;
const EMBEDDING_DIMENSIONS = MEMORY_EMBEDDING_DIMENSIONS;

const EMBEDDING_PRICE_USD_PER_1K: Record<string, number> = {
  "openai/text-embedding-3-small": 0.00002,
};

const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_MAX_INPUT_CHARS = 6000;

interface EmbeddingCallArgs {
  ctx: ActionCtx;
  apiKey: string;
  userId: Id<"users">;
  profileId?: string;
  feature: OpenRouterFeature;
}

export async function generateEmbedding(
  args: EmbeddingCallArgs & { text: string },
): Promise<number[]> {
  const { text, ...rest } = args;
  const vectors = await generateEmbeddings({ ...rest, texts: [text] });
  const first = vectors[0];
  if (!first) throw new Error("openRouter: embedding response missing vector");
  return first;
}

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
    const response = await postEmbeddingChunk({
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

async function postEmbeddingChunk(
  args: EmbeddingChunkArgs,
): Promise<EmbeddingItem[]> {
  const previews = previewsEnabled();
  const promptPreview = previews
    ? truncate(args.input.join("\n---\n"), PROMPT_PREVIEW_BYTES)
    : undefined;

  try {
    if (args.apiKey.length === 0) {
      throw new Error("AI_GATEWAY_API_KEY is not set");
    }
    const response = await embedGatewayTexts({
      model: EMBEDDING_MODEL,
      values: args.input,
    });
    const items = validateEmbeddingItems(
      response.embeddings.map((embedding, index) => ({ embedding, index })),
      args.input.length,
      EMBEDDING_DIMENSIONS,
    );
    const promptTokens = response.tokens;
    const totalTokens = response.tokens;
    const costUsd = response.costUsd ?? computeEmbeddingCost(totalTokens);

    await scheduleLog(args.ctx, {
      userId: args.userId,
      profileId: args.profileId,
      feature: args.feature,
      endpoint: "embedding",
      model: EMBEDDING_MODEL,
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
