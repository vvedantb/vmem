import { Agent } from "@convex-dev/agent";
import { components } from "./_generated/api";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error("OPENROUTER_API_KEY environment variable is not set");
}

export const openrouter = createOpenRouter({
  apiKey,
  headers: {
    "HTTP-Referer": "https://vmem.vedantb.com",
    "X-Title": "vmem",
  },
});

export const vmemAgent = new Agent(components.agent, {
  name: "vmem",
  languageModel: openrouter.chat("openai/gpt-5-nano:nitro"),
  embeddingModel: openrouter.textEmbeddingModel(
    "openai/text-embedding-3-small",
  ),
  instructions: [
    "You are vmem, a memory assistant that helps users store, search, and recall their personal memories.",
    "When users ask questions, search their stored memories to provide relevant context.",
    "Be concise and helpful. Reference specific memories when answering.",
    "If no relevant memories are found, let the user know and offer to help them save new ones.",
  ].join(" "),
});
