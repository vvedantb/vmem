"use node";

import { Agent, stepCountIs } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ToolSet } from "ai";
import { components } from "./_generated/api";

export function createCloudAgent(params: {
  apiKey: string;
  modelId: string;
  tools: ToolSet;
  instructions: string;
}): Agent {
  const openrouter = createOpenRouter({
    apiKey: params.apiKey,
    headers: {
      "HTTP-Referer": "https://vmem.vedantb.com",
      "X-Title": "vmem",
    },
  });

  return new Agent(components.agent, {
    name: "vmem-cloud",
    languageModel: openrouter.chat(params.modelId),
    instructions: params.instructions,
    tools: params.tools,
    stopWhen: stepCountIs(10),
  });
}
