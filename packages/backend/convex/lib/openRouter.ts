/** OpenRouter API wrappers — chat, embeddings, best-effort auth helpers. */

export type { OpenRouterFeature } from "./openRouter/shared";
export { LLM_MODEL } from "./openRouter/shared";
export {
  callOpenRouterChat,
  type ChatMessage,
  type ChatResult,
} from "./openRouter/chat";
export { callJsonChat, type JsonChatArgs } from "./openRouter/jsonChat";
export {
  EMBEDDING_DIMENSIONS,
  generateEmbedding,
  generateEmbeddings,
  type EmbeddingCallArgs,
} from "./openRouter/embedding";
export {
  bestEffortEmbedMany,
  bestEffortEmbedManyWithAuth,
  bestEffortEmbedOne,
  bestEffortEmbedOneWithAuth,
  resolveBestEffortEmbedAuth,
  type BestEffortEmbedAuth,
} from "./openRouter/bestEffortEmbed";
