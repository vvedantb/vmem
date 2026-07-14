import { z } from "zod";

export const openRouterFeatureSchema = z.enum([
  // chat completions
  "chat",
  "enrichment",
  "dream-synthesis",
  "dream-portrait",
  "context-prompt",
  "fact-extraction",
  "entity-backfill",
  "tag-consolidation",
  "entity-aliases",
  // embeddings
  "memory-save",
  "memory-search",
  "mcp-embed",
  "connector-sync",
  "dream-materialize",
  "proposal-accept",
  "embedding-backfill",
]);

export type OpenRouterFeature = z.infer<typeof openRouterFeatureSchema>;

export const openRouterEndpointSchema = z.enum(["chat", "embedding"]);

export type OpenRouterEndpoint = z.infer<typeof openRouterEndpointSchema>;
