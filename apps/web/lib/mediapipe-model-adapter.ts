/**
 * MediaPipe AI SDK adapter.
 * Wraps MediaPipe's LlmInference to work with Vercel AI SDK's streamText().
 */

import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import type { LlmInference } from "@mediapipe/tasks-genai";
import { formatGemmaPrompt } from "./mediapipe-engine";

/**
 * Create a properly structured V3 usage object.
 */
function createUsage(
  inputTokens: number,
  outputTokens: number,
): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: inputTokens,
      noCache: inputTokens,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTokens,
      text: outputTokens,
      reasoning: undefined,
    },
  };
}

/**
 * Creates a LanguageModelV3 adapter for MediaPipe's LlmInference.
 * This allows MediaPipe models to be used with Vercel AI SDK's streamText().
 */
export function createMediaPipeLanguageModel(
  inference: LlmInference,
  modelId: string,
): LanguageModelV3 {
  return {
    specificationVersion: "v3",
    provider: "mediapipe",
    modelId,
    supportedUrls: {}, // MediaPipe doesn't support external URLs

    async doGenerate(
      options: LanguageModelV3CallOptions,
    ): Promise<LanguageModelV3GenerateResult> {
      const prompt = buildPromptFromMessages(options);
      const response = await inference.generateResponse(prompt);

      // Estimate token counts (rough approximation: ~4 chars per token)
      const inputTokens = Math.ceil(prompt.length / 4);
      const outputTokens = Math.ceil(response.length / 4);

      return {
        content: [{ type: "text", text: response }],
        finishReason: { unified: "stop", raw: undefined },
        usage: createUsage(inputTokens, outputTokens),
        warnings: [],
      };
    },

    async doStream(
      options: LanguageModelV3CallOptions,
    ): Promise<LanguageModelV3StreamResult> {
      const prompt = buildPromptFromMessages(options);
      let lastPartialResult = "";
      const textId = `mp-${Date.now()}`;
      let isFirstChunk = true;

      const stream = new ReadableStream({
        async start(controller) {
          try {
            await inference.generateResponse(
              prompt,
              (partialResult: string) => {
                // Emit text-start on first chunk
                if (isFirstChunk) {
                  controller.enqueue({
                    type: "text-start",
                    id: textId,
                  });
                  isFirstChunk = false;
                }

                // MediaPipe gives us the full accumulated text, not just the delta
                // Extract the new text since last callback
                const newText = partialResult.slice(lastPartialResult.length);
                lastPartialResult = partialResult;

                if (newText) {
                  controller.enqueue({
                    type: "text-delta",
                    id: textId,
                    delta: newText,
                  });
                }
              },
            );

            // Emit text-end
            controller.enqueue({
              type: "text-end",
              id: textId,
            });

            // Estimate token counts
            const inputTokens = Math.ceil(prompt.length / 4);
            const outputTokens = Math.ceil(lastPartialResult.length / 4);

            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: createUsage(inputTokens, outputTokens),
            });

            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return {
        stream,
      };
    },
  };
}

/**
 * Build a Gemma-formatted prompt from AI SDK message format.
 */
function buildPromptFromMessages(options: LanguageModelV3CallOptions): string {
  let systemPrompt = "";
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  // Extract system prompt and messages from prompt array
  if (options.prompt) {
    for (const part of options.prompt) {
      if (part.role === "system") {
        // System message - extract text content
        if (typeof part.content === "string") {
          systemPrompt = part.content;
        }
      } else if (part.role === "user") {
        // User message - extract text content
        let content = "";
        for (const item of part.content) {
          if (item.type === "text") {
            content += item.text;
          }
        }
        if (content) {
          messages.push({ role: "user", content });
        }
      } else if (part.role === "assistant") {
        // Assistant message - extract text content
        let content = "";
        for (const item of part.content) {
          if (item.type === "text") {
            content += item.text;
          }
        }
        if (content) {
          messages.push({ role: "assistant", content });
        }
      }
    }
  }

  return formatGemmaPrompt(systemPrompt, messages);
}

/**
 * Type for the wrapped MediaPipe model that works with AI SDK.
 */
export type MediaPipeLanguageModel = LanguageModelV3;
