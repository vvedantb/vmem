import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveThinking } from "../../convex/lib/openRouter/chat";
import { openRouterFeatureSchema } from "../../convex/lib/openRouter/schemas";
import {
  AI_GATEWAY_CHAT_MODEL,
  AI_GATEWAY_EMBEDDING_MODEL,
  buildChatProviderOptions,
  FLEX_GATEWAY_PROVIDER_OPTIONS,
  generateGatewayText,
  THINKING_OFF,
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

  it("forwards providerOptions only when the caller sets them", async () => {
    const calls: GatewayTextCall[] = [];
    const generate = (call: GatewayTextCall): Promise<GatewayTextResult> => {
      calls.push(call);
      return Promise.resolve({ text: "ok" });
    };
    const base = {
      model: AI_GATEWAY_CHAT_MODEL,
      messages: [{ role: "user" as const, content: "hi" }],
    };

    await generateGatewayText(base, generate);
    await generateGatewayText(
      { ...base, providerOptions: THINKING_OFF },
      generate,
    );

    expect(calls[0]).not.toHaveProperty("providerOptions");
    expect(calls[1]?.providerOptions).toEqual({
      alibaba: { enableThinking: false },
    });
  });

  it("keeps flex on and adds thinking off to the SDK provider options", () => {
    expect(buildChatProviderOptions(undefined)).toEqual({
      gateway: { serviceTier: "flex" },
    });
    expect(buildChatProviderOptions(THINKING_OFF)).toEqual({
      gateway: { serviceTier: "flex" },
      alibaba: { enableThinking: false },
    });
  });
});

describe("chat thinking defaults", () => {
  it("turns thinking off by default for rollup and dream only", () => {
    expect(resolveThinking("rollup", undefined)).toBe("off");
    expect(resolveThinking("dream", undefined)).toBe("off");
    expect(resolveThinking("enrichment", undefined)).toBe("on");
    expect(resolveThinking("chat", undefined)).toBe("on");
    expect(resolveThinking("dream-synthesis", undefined)).toBe("on");
  });

  it("lets the caller override the feature default", () => {
    expect(resolveThinking("enrichment", "off")).toBe("off");
    expect(resolveThinking("rollup", "on")).toBe("on");
  });
});

describe("openRouterFeatureSchema", () => {
  it("accepts the rollup and dream features", () => {
    expect(openRouterFeatureSchema.parse("rollup")).toBe("rollup");
    expect(openRouterFeatureSchema.parse("dream")).toBe("dream");
    expect(openRouterFeatureSchema.safeParse("rollups").success).toBe(false);
  });
});
