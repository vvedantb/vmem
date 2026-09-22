import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AI_GATEWAY_CHAT_MODEL,
  AI_GATEWAY_EMBEDDING_MODEL,
  FLEX_GATEWAY_PROVIDER_OPTIONS,
  generateGatewayText,
  type GatewayTextCall,
  type GatewayTextResult,
} from "../../engine/llm/aiGateway";

const gatewaySource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../engine/llm/aiGateway.ts",
  ),
  "utf8",
);

describe("AI Gateway SDK client", () => {
  it("uses generateText and embedMany from the AI SDK", () => {
    expect(gatewaySource).toContain('from "ai"');
    expect(gatewaySource).toContain("generateText(");
    expect(gatewaySource).toContain("allowSystemInMessages: true");
    expect(gatewaySource).toContain("embedMany(");
    expect(gatewaySource).toContain(AI_GATEWAY_CHAT_MODEL);
    expect(gatewaySource).toContain(AI_GATEWAY_EMBEDDING_MODEL);
    expect(gatewaySource).toContain("FLEX_GATEWAY_PROVIDER_OPTIONS");
    expect(gatewaySource).toContain('serviceTier: "flex"');
    expect(FLEX_GATEWAY_PROVIDER_OPTIONS).toEqual({
      gateway: { serviceTier: "flex" },
    });
    expect(gatewaySource).not.toContain("ai-gateway.vercel.sh");
    expect(gatewaySource).not.toContain("baseURL");
    expect(gatewaySource).not.toContain("Authorization");
  });

  it("passes the chat model string to generateText without a gateway URL", async () => {
    const calls: GatewayTextCall[] = [];
    const generate = (call: GatewayTextCall): Promise<GatewayTextResult> => {
      calls.push(call);
      return Promise.resolve({
        text: '{"ok":true}',
        finishReason: "stop",
        responseId: "gen_1",
        promptTokens: 11,
        completionTokens: 4,
        totalTokens: 15,
        cachedTokens: 2,
        reasoningTokens: 1,
        costUsd: 0.00021,
      });
    };

    const result = await generateGatewayText(
      {
        model: AI_GATEWAY_CHAT_MODEL,
        messages: [{ role: "user", content: "hi" }],
      },
      generate,
    );

    expect(calls).toEqual([
      {
        model: "alibaba/qwen3.7-flash",
        messages: [{ role: "user", content: "hi" }],
        temperature: 0.1,
      },
    ]);
    expect(result.text).toBe('{"ok":true}');
    expect(result.costUsd).toBe(0.00021);
    expect(result.promptTokens).toBe(11);
  });
});
