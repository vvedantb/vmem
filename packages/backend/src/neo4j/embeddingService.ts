/**
 * OpenRouter embedding client.
 *
 * Pure function layer: caller supplies the API key (resolved elsewhere from
 * user-owned encrypted env vars). No access to ActionCtx, no env var reads,
 * no Convex imports — safe to use from any node-side code.
 *
 * Model: openai/text-embedding-3-small, 1536 dims. Batches up to 20 texts
 * per HTTP request; retries on 429 with exponential backoff.
 *
 * Response validation is defensive runtime structural checks (no zod dep —
 * shape is narrow and stable). Matches the codebase convention of typing
 * `.json()` results directly (see `convex/codebases.ts:121`, `convex/github.ts`).
 */

const EMBEDDING_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

/**
 * text-embedding-3-small allows up to ~8191 tokens. 6000 characters is a
 * conservative byte-level cap that keeps well under the limit even for
 * token-dense content. Memories longer than this are truncated — the first
 * ~6k chars of a memory are almost always the most semantically dense part.
 */
const MAX_INPUT_CHARS = 6000;

/**
 * Max inputs per POST. OpenRouter / OpenAI accept larger batches, but 20
 * keeps latency bounded and aligns with our migration batch sizing.
 */
const BATCH_SIZE = 20;

/** Max retry attempts on 429 Too Many Requests before giving up. */
const MAX_RETRY_ATTEMPTS = 4;

interface EmbeddingItem {
  embedding: number[];
  index: number;
}

interface EmbeddingResponse {
  data: EmbeddingItem[];
}

function truncateForEmbedding(text: string): string {
  return text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
}

/**
 * Defensive post-parse validation. We type-declare the `.json()` result and
 * then verify the observed shape matches before trusting it. Throws a
 * descriptive error on mismatch so upstream try/catch can degrade gracefully.
 */
function validateEmbeddingResponse(resp: EmbeddingResponse): void {
  if (!Array.isArray(resp.data)) {
    throw new Error("embedding response: missing data array");
  }
  for (const item of resp.data) {
    if (!Array.isArray(item.embedding)) {
      throw new Error("embedding response: item missing embedding array");
    }
    if (typeof item.index !== "number") {
      throw new Error("embedding response: item missing numeric index");
    }
    if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `embedding response: expected ${EMBEDDING_DIMENSIONS} dims, got ${item.embedding.length}`,
      );
    }
    for (const n of item.embedding) {
      if (typeof n !== "number") {
        throw new Error("embedding response: vector contains non-number");
      }
    }
  }
}

async function postWithRetry(
  apiKey: string,
  input: string[],
  attempt = 0,
): Promise<EmbeddingResponse> {
  const res = await fetch(EMBEDDING_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vmem.vedantb.com",
      "X-Title": "vmem",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });

  if (res.status === 429 && attempt < MAX_RETRY_ATTEMPTS) {
    // Exponential backoff: 500ms, 1s, 2s, 4s
    const delay = 2 ** attempt * 500;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return postWithRetry(apiKey, input, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter embedding ${res.status}: ${body}`);
  }

  const parsed: EmbeddingResponse = await res.json();
  validateEmbeddingResponse(parsed);
  return parsed;
}

/** Generate a single embedding vector. */
export async function generateEmbedding(
  apiKey: string,
  text: string,
): Promise<number[]> {
  const vectors = await generateEmbeddings(apiKey, [text]);
  const first = vectors[0];
  if (!first) throw new Error("no embedding returned");
  return first;
}

/**
 * Generate embeddings for a batch of inputs. Splits into BATCH_SIZE chunks
 * internally; each chunk is one HTTP request. Returns vectors in the same
 * order as inputs.
 */
export async function generateEmbeddings(
  apiKey: string,
  texts: string[],
): Promise<number[][]> {
  const out: number[][] = new Array(texts.length);
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE).map(truncateForEmbedding);
    const response = await postWithRetry(apiKey, chunk);
    for (const item of response.data) {
      out[i + item.index] = item.embedding;
    }
  }
  return out;
}

export { EMBEDDING_DIMENSIONS };
