import { validateEmbeddingItems } from "../engine/llm/embeddingResponse";
import {
  AI_GATEWAY_EMBEDDING_MODEL,
  embedGatewayTexts,
} from "../engine/llm/aiGateway";

const EMBEDDING_MODEL = AI_GATEWAY_EMBEDDING_MODEL;
export const EVAL_EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_MAX_INPUT_CHARS = 6000;

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

export function syntheticEmbed(text: string): number[] {
  const normalized = text.toLowerCase();
  const vec = Array.from({ length: EVAL_EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = normalized.match(/[a-z0-9]+/g) ?? [];

  for (const token of tokens) {
    const hash = rollingHash(token, 31);
    for (let slot = 0; slot < 4; slot++) {
      const index = Math.abs((hash + slot * 9973) % EVAL_EMBEDDING_DIMENSIONS);
      vec[index] = (vec[index] ?? 0) + 1;
    }
  }

  for (let i = 0; i < normalized.length - 1; i++) {
    const bigram = normalized.slice(i, i + 2);
    if (!/\w/.test(bigram)) continue;
    const index = Math.abs(rollingHash(bigram, 37) % EVAL_EMBEDDING_DIMENSIONS);
    vec[index] = (vec[index] ?? 0) + 0.5;
  }

  return l2Normalize(vec);
}

export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return Math.max(0, dot / denom);
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

function readGatewayApiKey(): string | undefined {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  return key && key.length > 0 ? key : undefined;
}

async function generateGatewayEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = readGatewayApiKey();
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is not set");
  }

  const result: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
    const input = texts
      .slice(offset, offset + EMBEDDING_BATCH_SIZE)
      .map((text) => text.slice(0, EMBEDDING_MAX_INPUT_CHARS));
    const vectors = await generateBatch(input);
    result.push(...vectors);
  }

  return result;
}

async function generateBatch(input: string[]): Promise<number[][]> {
  const response = await embedGatewayTexts({
    model: EMBEDDING_MODEL,
    values: input,
  });
  const slots: (number[] | undefined)[] = Array.from({
    length: input.length,
  });
  for (const item of validateEmbeddingItems(
    response.embeddings.map((embedding, index) => ({ embedding, index })),
    input.length,
    EVAL_EMBEDDING_DIMENSIONS,
  )) {
    slots[item.index] = item.embedding;
  }
  return requireFilledVectors(slots, "embedding response");
}

let syntheticWarningShown = false;

export function embeddingMode(): "gateway" | "synthetic" {
  return readGatewayApiKey() ? "gateway" : "synthetic";
}

export async function generateEvalEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (embeddingMode() === "gateway") {
    return generateGatewayEmbeddings(texts);
  }

  if (!syntheticWarningShown) {
    console.warn(
      "AI_GATEWAY_API_KEY not set — using deterministic synthetic embeddings for eval",
    );
    syntheticWarningShown = true;
  }

  return texts.map(syntheticEmbed);
}
