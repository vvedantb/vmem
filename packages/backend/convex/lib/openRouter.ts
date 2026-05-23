/**
 * OpenRouter API wrapper barrel.
 *
 * The single 611-line file was split into the `./openRouter/`
 * subdirectory in 2026-Q2. Public surface preserved verbatim — every
 * import that worked against the old file still resolves.
 *
 *   chat        — chat.ts (callOpenRouterChat + ChatResult)
 *   embedding   — embedding.ts (generateEmbedding + generateEmbeddings + EMBEDDING_DIMENSIONS)
 *   shared      — shared.ts (OpenRouterFeature, scheduleLog, helpers)
 */

export type { OpenRouterFeature } from "./openRouter/shared";
export {
  callOpenRouterChat,
  type ChatMessage,
  type ChatResult,
} from "./openRouter/chat";
export {
  EMBEDDING_DIMENSIONS,
  generateEmbedding,
  generateEmbeddings,
  type EmbeddingCallArgs,
} from "./openRouter/embedding";
