/**
 * Embedding client for CLI scripts (seed, retrieval eval). Uses OpenRouter
 * when OPENROUTER_API_KEY is set; otherwise falls back to deterministic
 * synthetic vectors so eval can run offline.
 */

import {
  createOpenRouterClient,
  readOpenRouterError,
} from "../../../openRouter/client";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_MAX_INPUT_CHARS = 6000;

function truncateForEmbedding(text: string): string {
  return text.length > EMBEDDING_MAX_INPUT_CHARS
    ? text.slice(0, EMBEDDING_MAX_INPUT_CHARS)
    : text;
}

function syntheticEmbed(text: string): number[] {
  const normalized = text.toLowerCase();
  const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = normalized.match(/[a-z0-9]+/g) ?? [];

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) | 0;
    }

    for (let slot = 0; slot < 4; slot++) {
      const index = Math.abs((hash + slot * 9973) % EMBEDDING_DIMENSIONS);
      const current = vec[index];
      if (typeof current === "number") {
        vec[index] = current + 1;
      }
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
    const current = vec[index];
    if (typeof current === "number") {
      vec[index] = current + 0.5;
    }
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

  const out: number[][] = new Array(expectedCount);
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
    out[index] = item.embedding;
  }

  for (let i = 0; i < out.length; i++) {
    if (!out[i]) {
      throw new Error(
        `embedding response: missing vector at index ${String(i)}`,
      );
    }
  }

  return out;
}

async function generateOpenRouterEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const client = createOpenRouterClient(apiKey);
  const out: number[][] = new Array(texts.length);
  for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
    const input = texts
      .slice(offset, offset + EMBEDDING_BATCH_SIZE)
      .map(truncateForEmbedding);

    try {
      const response = await client.embeddings.generate({
        requestBody: {
          model: EMBEDDING_MODEL,
          input,
        },
      });

      if (typeof response === "string") {
        throw new Error("embedding response: unexpected string body");
      }

      const vectors = validateEmbeddingItems(response.data, input.length);
      for (let i = 0; i < vectors.length; i++) {
        const vector = vectors[i];
        if (vector) out[offset + i] = vector;
      }
    } catch (err) {
      const { status, message } = readOpenRouterError(err);
      throw new Error(
        `openRouter embedding ${String(status)}: ${message.slice(0, 200)}`,
      );
    }
  }

  return out;
}

function generateSyntheticEmbeddings(texts: string[]): number[][] {
  return texts.map(syntheticEmbed);
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

  return generateSyntheticEmbeddings(texts);
}

export async function generateCliEmbedding(text: string): Promise<number[]> {
  const vectors = await generateCliEmbeddings([text]);
  const first = vectors[0];
  if (!first) {
    throw new Error("embedding generation returned no vector");
  }
  return first;
}
