import { Agent } from "@convex-dev/agent";
import { components } from "./_generated/api";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter();

export const vmemAgent = new Agent(components.agent, {
  name: "vmem",
  languageModel: openrouter.chat("anthropic/claude-sonnet-4"),
  textEmbeddingModel: openrouter.textEmbeddingModel(
    "openai/text-embedding-3-small",
  ),
  instructions: [
    "You are vmem, a memory assistant that helps users store, search, and recall their personal memories.",
    "When users ask questions, search their stored memories to provide relevant context.",
    "Be concise and helpful. Reference specific memories when answering.",
    "If no relevant memories are found, let the user know and offer to help them save new ones.",
  ].join(" "),
});
