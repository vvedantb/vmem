/**
 * Embedding client for CLI scripts (seed, retrieval eval). Uses OpenRouter
 * when OPENROUTER_API_KEY is set; otherwise falls back to deterministic
 * synthetic vectors so eval can run offline.
 */

import {
  createOpenRouterClient,
  isTransientNetworkError,
  readOpenRouterError,
} from "../../convex/lib/openRouter/client";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_MAX_INPUT_CHARS = 6000;
// Embeddings are the most-called endpoint in an eval run (one per memory at
// seed time, one per query). A single transient socket reset must not abort the
// whole run, so retry transient faults / 429 / 5xx with backoff before giving up.
const EMBEDDING_MAX_ATTEMPTS = 5;
const EMBEDDING_RETRY_BASE_MS = 800;
const EMBEDDING_RATE_LIMIT_BASE_MS = 6000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateForEmbedding(text: string): string {
  return text.length > EMBEDDING_MAX_INPUT_CHARS
    ? text.slice(0, EMBEDDING_MAX_INPUT_CHARS)
    : text;
}

function syntheticEmbed(text: string): number[] {
  const normalized = text.toLowerCase();
  const vec = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = normalized.match(/[a-z0-9]+/g) ?? [];

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) | 0;
    }

    for (let slot = 0; slot < 4; slot++) {
      const index = Math.abs((hash + slot * 9973) % EMBEDDING_DIMENSIONS);
      vec[index] = (vec[index] ?? 0) + 1;
    }
  }

  for (let i = 0; i < normalized.length - 1; i++) {
    const bigram = normalized.slice(i, i + 2);
    if (!/\w/.test(bigram)) continue;
    let hash = 0;
    for (let j = 0; j < bigram.length; j++) {
      hash = (hash * 37 + bigram.charCodeAt(j)) | 0;
    }
    const index = Math.abs(hash % EMBEDDING_DIMENSIONS);
    vec[index] = (vec[index] ?? 0) + 0.5;
  }

  let sumSquares = 0;
  for (const value of vec) {
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return vec;

  return vec.map((value) => value / norm);
}

function validateEmbeddingItems(
  data: Array<{ embedding: Array<number> | string; index?: number }>,
  expectedCount: number,
): number[][] {
  if (data.length !== expectedCount) {
    throw new Error(
      `embedding response: expected ${String(expectedCount)} items, got ${String(data.length)}`,
    );
  }

  const slots: (number[] | undefined)[] = Array.from({
    length: expectedCount,
  });
  for (const item of data) {
    if (!Array.isArray(item.embedding)) {
      throw new Error("embedding response: item missing embedding array");
    }
    const index = item.index ?? 0;
    if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `embedding response: expected ${String(EMBEDDING_DIMENSIONS)} dims, got ${String(item.embedding.length)}`,
      );
    }
    slots[index] = item.embedding;
  }

  return requireFilledVectors(slots, "embedding response");
}

/** Narrow sparse slot array after every index has been validated present. */
function requireFilledVectors(
  slots: (number[] | undefined)[],
  label: string,
): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < slots.length; i++) {
    const vector = slots[i];
    if (vector === undefined) {
      throw new Error(`${label}: missing vector at index ${String(i)}`);
    }
    result.push(vector);
  }
  return result;
}

async function generateOpenRouterEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const client = createOpenRouterClient(apiKey);
  const slots: (number[] | undefined)[] = Array.from({
    length: texts.length,
  });
  for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
    const input = texts
      .slice(offset, offset + EMBEDDING_BATCH_SIZE)
      .map(truncateForEmbedding);

    const vectors = await generateBatchWithRetry(client, input);
    for (let i = 0; i < vectors.length; i++) {
      const vector = vectors[i];
      if (vector !== undefined) {
        slots[offset + i] = vector;
      }
    }
  }

  return requireFilledVectors(slots, "embedding generation");
}

async function generateBatchWithRetry(
  client: ReturnType<typeof createOpenRouterClient>,
  input: string[],
): Promise<number[][]> {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= EMBEDDING_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.embeddings.generate({
        requestBody: { model: EMBEDDING_MODEL, input },
      });
      if (typeof response === "string") {
        throw new Error("embedding response: unexpected string body");
      }
      return validateEmbeddingItems(response.data, input.length);
    } catch (err) {
      const { status, message } = readOpenRouterError(err);
      lastError = `${String(status)}: ${message.slice(0, 200)}`;
      const retryable =
        status === 429 ||
        status >= 500 ||
        (status === 0 && isTransientNetworkError(err));
      if (attempt < EMBEDDING_MAX_ATTEMPTS && retryable) {
        const base =
          status === 429
            ? EMBEDDING_RATE_LIMIT_BASE_MS
            : EMBEDDING_RETRY_BASE_MS;
        await sleep(base * attempt);
        continue;
      }
      throw new Error(`openRouter embedding ${lastError}`, { cause: err });
    }
  }
  throw new Error(`openRouter embedding exhausted retries (${lastError})`);
}

let syntheticWarningShown = false;

export function embeddingMode(): "openrouter" | "synthetic" {
  return process.env.OPENROUTER_API_KEY ? "openrouter" : "synthetic";
}

export async function generateCliEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (process.env.OPENROUTER_API_KEY) {
    return generateOpenRouterEmbeddings(texts);
  }

  if (!syntheticWarningShown) {
    console.warn(
      "OPENROUTER_API_KEY not set — using deterministic synthetic embeddings for CLI eval",
    );
    syntheticWarningShown = true;
  }

  return texts.map(syntheticEmbed);
}

export async function generateCliEmbedding(text: string): Promise<number[]> {
  const vectors = await generateCliEmbeddings([text]);
  const first = vectors[0];
  if (!first) {
    throw new Error("embedding generation returned no vector");
  }
  return first;
}
