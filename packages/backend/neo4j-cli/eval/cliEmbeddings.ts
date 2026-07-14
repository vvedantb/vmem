// openRouter embeddings when configured; otherwise deterministic synthetic vectors

import { createOpenRouterClient } from "../../convex/lib/openRouter/client";
import { validateEmbeddingItems } from "../../engine/llm/embeddingResponse";
import pRetry from "p-retry";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_MAX_INPUT_CHARS = 6000;
const EMBEDDING_MAX_ATTEMPTS = 5;
const EMBEDDING_RETRY_BASE_MS = 800;

function truncateForEmbedding(text: string): string {
  return text.slice(0, EMBEDDING_MAX_INPUT_CHARS);
}

function rollingHash(text: string, multiplier: number): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * multiplier + text.charCodeAt(i)) | 0;
  }
  return hash;
}

function l2Normalize(vec: number[]): number[] {
  let sumSquares = 0;
  for (const value of vec) {
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return vec;
  return vec.map((value) => value / norm);
}

function syntheticEmbed(text: string): number[] {
  const normalized = text.toLowerCase();
  const vec = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = normalized.match(/[a-z0-9]+/g) ?? [];

  for (const token of tokens) {
    const hash = rollingHash(token, 31);
    for (let slot = 0; slot < 4; slot++) {
      const index = Math.abs((hash + slot * 9973) % EMBEDDING_DIMENSIONS);
      vec[index] = (vec[index] ?? 0) + 1;
    }
  }

  for (let i = 0; i < normalized.length - 1; i++) {
    const bigram = normalized.slice(i, i + 2);
    if (!/\w/.test(bigram)) continue;
    const index = Math.abs(rollingHash(bigram, 37) % EMBEDDING_DIMENSIONS);
    vec[index] = (vec[index] ?? 0) + 0.5;
  }

  return l2Normalize(vec);
}

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
      slots[offset + i] = vectors[i];
    }
  }

  return requireFilledVectors(slots, "embedding generation");
}

async function generateBatchWithRetry(
  client: ReturnType<typeof createOpenRouterClient>,
  input: string[],
): Promise<number[][]> {
  return pRetry(
    async () => {
      const response = await client.embeddings.generate({
        requestBody: { model: EMBEDDING_MODEL, input },
      });
      if (typeof response === "string") {
        throw new Error("embedding response: unexpected string body");
      }
      const slots: (number[] | undefined)[] = Array.from({
        length: input.length,
      });
      for (const item of validateEmbeddingItems(
        response.data,
        input.length,
        EMBEDDING_DIMENSIONS,
      )) {
        slots[item.index] = item.embedding;
      }
      return requireFilledVectors(slots, "embedding response");
    },
    {
      retries: EMBEDDING_MAX_ATTEMPTS - 1,
      factor: 1,
      randomize: true,
      minTimeout: EMBEDDING_RETRY_BASE_MS,
    },
  );
}

let syntheticWarningShown = false;

export function embeddingMode(): "openrouter" | "synthetic" {
  return process.env.OPENROUTER_API_KEY ? "openrouter" : "synthetic";
}

export async function generateCliEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (embeddingMode() === "openrouter") {
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
