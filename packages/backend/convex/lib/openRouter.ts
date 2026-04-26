/**
 * Single source of truth for every OpenRouter API call.
 *
 * Two public entry points: `callOpenRouterChat` (chat completions) and
 * `generateEmbedding[s]` (text-embedding-3-small batches). Both:
 *
 *  - inject the standard `Authorization` / `HTTP-Referer` / `X-Title`
 *    headers, so call-sites no longer scatter the same boilerplate
 *  - turn on OpenRouter's inline `usage:{include:true}` accounting for
 *    chat (cost arrives in the response, no follow-up `/generation`
 *    call needed)
 *  - measure latency with `performance.now()`
 *  - schedule one `openRouterLogs` row per HTTP attempt — including
 *    failed attempts and embedding 429-retries — via the recordInternal
 *    mutation
 *  - populate `promptPreview` / `completionPreview` only when the deploy
 *    sets `OPENROUTER_LOG_PROMPTS=1` (see CLAUDE.md privacy default)
 *
 * The wrapper never throws on a logging failure — observability must
 * not take down the user's actual request.
 */

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type OpenRouterFeature =
  // Chat completions
  | "enrichment"
  | "dream-synthesis"
  | "context-prompt"
  | "fact-extraction"
  | "entity-backfill"
  // Embeddings
  | "memory-save"
  | "memory-search"
  | "mcp-embed"
  | "connector-sync"
  | "dream-materialize"
  | "proposal-accept"
  | "embedding-backfill";

type ErrorClass = "network" | "http_4xx" | "http_5xx" | "parse" | "timeout";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatChoice {
  message?: { content?: string };
  finish_reason?: string;
  native_finish_reason?: string;
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  cost_details?: { upstream_inference_cost?: number };
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  completion_tokens_details?: { reasoning_tokens?: number };
  is_byok?: boolean;
}

interface ChatCompletionResponse {
  id?: string;
  provider?: string;
  choices?: ChatChoice[];
  usage?: ChatUsage;
}

interface EmbeddingItem {
  embedding: number[];
  index: number;
}

interface EmbeddingUsage {
  prompt_tokens?: number;
  total_tokens?: number;
}

interface EmbeddingCompletionResponse {
  id?: string;
  provider?: string;
  data?: EmbeddingItem[];
  usage?: EmbeddingUsage;
}

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

const CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const EMBEDDING_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";

/**
 * Hardcoded embedding model — the only one the codebase has ever used.
 * Exposed so the rest of the codebase can keep importing
 * `EMBEDDING_DIMENSIONS` from a single canonical place.
 */
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** Per-1k-token USD cost per embedding model — used to compute `costUsd`
 *  on logged rows since OpenRouter's embedding endpoint doesn't return
 *  cost inline. Numbers from openrouter.ai/models on 2026-04. */
const EMBEDDING_PRICE_USD_PER_1K: Record<string, number> = {
  "openai/text-embedding-3-small": 0.00002,
};

/** Privacy default — only populate prompt/completion previews when the
 *  deploy explicitly opts in. */
const PROMPT_PREVIEW_BYTES = 4096;
const COMPLETION_PREVIEW_BYTES = 2048;

const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_MAX_RETRY_ATTEMPTS = 4;
/** text-embedding-3-small allows up to ~8191 tokens. 6000 chars is a
 *  conservative byte-level cap that stays well under the limit. */
const EMBEDDING_MAX_INPUT_CHARS = 6000;

// ─────────────────────────────────────────────────────────────────────
// Public chat entry point
// ─────────────────────────────────────────────────────────────────────

interface ChatArgs {
  apiKey: string;
  userId: Id<"users">;
  /**
   * Plain-string profile id — most callers thread profileId through
   * string-typed action args (string-typed at the Neo4j boundary).
   * `recordInternal` normalises to `Id<"profiles">` before insert.
   */
  profileId?: string;
  feature: OpenRouterFeature;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

export interface ChatResult {
  /** `null` when the call failed or the response was unparseable. */
  content: string | null;
  status: number;
  ok: boolean;
}

/**
 * Fire one chat-completion call and log the outcome. Mirrors the
 * old per-call-site `fetch + extractContent` boilerplate, but the
 * single shared implementation also handles cost/usage extraction,
 * privacy-gated previews, and latency timing.
 */
export async function callOpenRouterChat(
  ctx: ActionCtx,
  args: ChatArgs,
): Promise<ChatResult> {
  const start = performance.now();
  const previews = previewsEnabled();
  const promptPreview = previews
    ? truncate(joinMessagesForPreview(args.messages), PROMPT_PREVIEW_BYTES)
    : undefined;

  let status = 0;
  let ok = false;
  let errorClass: ErrorClass | undefined;
  let errorMessage: string | undefined;
  let content: string | null = null;
  let generationId: string | undefined;
  let provider: string | undefined;
  let finishReason: string | undefined;
  let nativeFinishReason: string | undefined;
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let totalTokens: number | undefined;
  let cachedTokens: number | undefined;
  let cacheWriteTokens: number | undefined;
  let reasoningTokens: number | undefined;
  let costUsd: number | undefined;
  let upstreamCostUsd: number | undefined;
  let isByok: boolean | undefined;

  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://vmem.vedantb.com",
        "X-Title": "vmem",
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        temperature: args.temperature ?? 0.1,
        // Inline cost accounting — saves a follow-up /generation call.
        usage: { include: true },
      }),
    });

    status = res.status;
    ok = res.ok;
    if (!res.ok) {
      errorClass = classifyHttpStatus(status);
      errorMessage = await readErrorBody(res, status);
    } else {
      try {
        const json: ChatCompletionResponse = await res.json();
        content = extractChatContent(json);
        generationId = typeof json.id === "string" ? json.id : undefined;
        provider =
          typeof json.provider === "string" ? json.provider : undefined;
        const first = json.choices?.[0];
        finishReason =
          typeof first?.finish_reason === "string"
            ? first.finish_reason
            : undefined;
        nativeFinishReason =
          typeof first?.native_finish_reason === "string"
            ? first.native_finish_reason
            : undefined;

        const usage = json.usage;
        promptTokens = numberOrUndef(usage?.prompt_tokens);
        completionTokens = numberOrUndef(usage?.completion_tokens);
        totalTokens = numberOrUndef(usage?.total_tokens);
        cachedTokens = numberOrUndef(
          usage?.prompt_tokens_details?.cached_tokens,
        );
        cacheWriteTokens = numberOrUndef(
          usage?.prompt_tokens_details?.cache_write_tokens,
        );
        reasoningTokens = numberOrUndef(
          usage?.completion_tokens_details?.reasoning_tokens,
        );
        costUsd = numberOrUndef(usage?.cost);
        upstreamCostUsd = numberOrUndef(
          usage?.cost_details?.upstream_inference_cost,
        );
        isByok =
          typeof usage?.is_byok === "boolean" ? usage.is_byok : undefined;

        if (content === null) {
          // Successful HTTP, malformed body — flag so the dashboard
          // can surface "ok response but no content" rows distinctly.
          errorClass = "parse";
          errorMessage = "no string content in choices[0].message";
        }
      } catch (e) {
        ok = false;
        errorClass = "parse";
        errorMessage = e instanceof Error ? e.message : "parse failed";
      }
    }
  } catch (e) {
    ok = false;
    errorClass = "network";
    errorMessage = e instanceof Error ? e.message : "network error";
  }

  const latencyMs = Math.round(performance.now() - start);
  const completionPreview =
    previews && content !== null
      ? truncate(content, COMPLETION_PREVIEW_BYTES)
      : undefined;

  await scheduleLog(ctx, {
    userId: args.userId,
    profileId: args.profileId,
    feature: args.feature,
    endpoint: "chat",
    model: args.model,
    status,
    ok,
    errorClass,
    errorMessage,
    latencyMs,
    generationId,
    provider,
    finishReason,
    nativeFinishReason,
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    cacheWriteTokens,
    reasoningTokens,
    costUsd,
    upstreamCostUsd,
    isByok,
    promptPreview,
    completionPreview,
  });

  return { content, status, ok };
}

// ─────────────────────────────────────────────────────────────────────
// Public embedding entry points
// ─────────────────────────────────────────────────────────────────────

export interface EmbeddingCallArgs {
  ctx: ActionCtx;
  apiKey: string;
  userId: Id<"users">;
  /** Plain-string profile id — see `ChatArgs.profileId` for rationale. */
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
 * Generate embeddings for many inputs. Splits into 20-input HTTP
 * requests internally; each chunk is one log row + one retry envelope.
 * Returned vectors are in the same order as the `texts` input.
 */
export async function generateEmbeddings(
  args: EmbeddingCallArgs & { texts: string[] },
): Promise<number[][]> {
  const out: number[][] = new Array(args.texts.length);
  for (
    let offset = 0;
    offset < args.texts.length;
    offset += EMBEDDING_BATCH_SIZE
  ) {
    const slice = args.texts
      .slice(offset, offset + EMBEDDING_BATCH_SIZE)
      .map(truncateForEmbedding);
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

// ─────────────────────────────────────────────────────────────────────
// Internal embedding plumbing
// ─────────────────────────────────────────────────────────────────────

interface EmbeddingChunkArgs {
  ctx: ActionCtx;
  apiKey: string;
  userId: Id<"users">;
  profileId?: string;
  feature: OpenRouterFeature;
  input: string[];
}

/**
 * Fire one embedding HTTP call, log the outcome, return validated
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

  let status = 0;
  let ok = false;
  let errorClass: ErrorClass | undefined;
  let errorMessage: string | undefined;
  let items: EmbeddingItem[] | null = null;
  let generationId: string | undefined;
  let provider: string | undefined;
  let promptTokens: number | undefined;
  let totalTokens: number | undefined;

  try {
    const res = await fetch(EMBEDDING_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://vmem.vedantb.com",
        "X-Title": "vmem",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: args.input }),
    });

    status = res.status;
    ok = res.ok;
    if (!res.ok) {
      errorClass = classifyHttpStatus(status);
      errorMessage = await readErrorBody(res, status);
    } else {
      try {
        const json: EmbeddingCompletionResponse = await res.json();
        items = validateEmbeddingItems(json.data, args.input.length);
        generationId = typeof json.id === "string" ? json.id : undefined;
        provider =
          typeof json.provider === "string" ? json.provider : undefined;
        promptTokens = numberOrUndef(json.usage?.prompt_tokens);
        totalTokens = numberOrUndef(json.usage?.total_tokens);
      } catch (e) {
        ok = false;
        errorClass = "parse";
        errorMessage = e instanceof Error ? e.message : "parse failed";
      }
    }
  } catch (e) {
    ok = false;
    errorClass = "network";
    errorMessage = e instanceof Error ? e.message : "network error";
  }

  const latencyMs = Math.round(performance.now() - start);
  const costUsd = computeEmbeddingCost(totalTokens);

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
    provider,
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
  data: EmbeddingItem[] | undefined,
  expectedCount: number,
): EmbeddingItem[] {
  if (!Array.isArray(data)) {
    throw new Error("embedding response: missing data array");
  }
  if (data.length !== expectedCount) {
    throw new Error(
      `embedding response: expected ${String(expectedCount)} items, got ${String(data.length)}`,
    );
  }
  for (const item of data) {
    if (!Array.isArray(item.embedding)) {
      throw new Error("embedding response: item missing embedding array");
    }
    if (typeof item.index !== "number") {
      throw new Error("embedding response: item missing numeric index");
    }
    if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `embedding response: expected ${String(EMBEDDING_DIMENSIONS)} dims, got ${String(item.embedding.length)}`,
      );
    }
  }
  return data;
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

// ─────────────────────────────────────────────────────────────────────
// Logging plumbing
// ─────────────────────────────────────────────────────────────────────

interface LogPayload {
  userId: Id<"users">;
  profileId?: string;
  feature: OpenRouterFeature;
  endpoint: "chat" | "embedding";
  model: string;
  status: number;
  ok: boolean;
  errorClass?: ErrorClass;
  errorMessage?: string;
  latencyMs: number;
  generationId?: string;
  provider?: string;
  finishReason?: string;
  nativeFinishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  upstreamCostUsd?: number;
  isByok?: boolean;
  promptPreview?: string;
  completionPreview?: string;
}

async function scheduleLog(ctx: ActionCtx, payload: LogPayload): Promise<void> {
  try {
    await ctx.scheduler.runAfter(
      0,
      internal.openRouterLogs.recordInternal,
      payload,
    );
  } catch (e) {
    // Observability must not take down the user's request. Log to
    // server console and move on.
    console.error("[openRouter] failed to schedule log row", e);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function previewsEnabled(): boolean {
  return process.env.OPENROUTER_LOG_PROMPTS === "1";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function truncateForEmbedding(text: string): string {
  return text.length > EMBEDDING_MAX_INPUT_CHARS
    ? text.slice(0, EMBEDDING_MAX_INPUT_CHARS)
    : text;
}

function joinMessagesForPreview(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
}

function classifyHttpStatus(status: number): ErrorClass | undefined {
  if (status >= 500 && status < 600) return "http_5xx";
  if (status >= 400 && status < 500) return "http_4xx";
  return undefined;
}

function numberOrUndef(n: number | undefined): number | undefined {
  return typeof n === "number" ? n : undefined;
}

function extractChatContent(json: ChatCompletionResponse): string | null {
  const c = json.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : null;
}

async function readErrorBody(res: Response, status: number): Promise<string> {
  try {
    const text = await res.text();
    return truncate(text, 500);
  } catch {
    return `HTTP ${String(status)}`;
  }
}
