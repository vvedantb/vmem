import { describe, expect, it, vi } from "vitest";
import {
  AI_GATEWAY_BASE_URL,
  AI_GATEWAY_CHAT_MODEL,
  AI_GATEWAY_EMBEDDING_MODEL,
  createGatewayChatCompletion,
  createGatewayEmbeddings,
  parseGatewayUsage,
} from "../../engine/llm/aiGatewayClient";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    jsonResponse(body, status),
  );
}

function postedCall(fetchImpl: ReturnType<typeof mockFetch>): {
  url: string;
  init: RequestInit;
} {
  const call = fetchImpl.mock.calls[0];
  const input = call?.[0];
  const init = call?.[1];
  if (typeof input !== "string" || !init) {
    throw new Error("fetch was not called");
  }
  return { url: input, init };
}

function parsedBody(init: RequestInit): unknown {
  if (typeof init.body !== "string") {
    throw new Error("expected a string request body");
  }
  const parsed: unknown = JSON.parse(init.body);
  return parsed;
}

describe("AI Gateway client", () => {
  it("posts chat completions to the gateway with bearer auth", async () => {
    const fetchImpl = mockFetch({
      id: "gen_1",
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: '{"ok":true}' },
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 4,
        total_tokens: 15,
        prompt_tokens_details: { cached_tokens: 2 },
        completion_tokens_details: { reasoning_tokens: 1 },
      },
      providerMetadata: { gateway: { cost: "0.00021" } },
    });

    const result = await createGatewayChatCompletion({
      apiKey: "gw-test",
      model: AI_GATEWAY_CHAT_MODEL,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const { url, init } = postedCall(fetchImpl);
    expect(url).toBe(`${AI_GATEWAY_BASE_URL}/chat/completions`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer gw-test",
    );
    expect(parsedBody(init)).toEqual({
      model: "alibaba/qwen3.7-flash",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.1,
      stream: false,
    });
    expect(result).toEqual({
      id: "gen_1",
      content: '{"ok":true}',
      finishReason: "stop",
      usage: {
        promptTokens: 11,
        completionTokens: 4,
        totalTokens: 15,
        cachedTokens: 2,
        reasoningTokens: 1,
        costUsd: 0.00021,
      },
    });
  });

  it("posts embeddings to the gateway and keeps the embedding model", async () => {
    const fetchImpl = mockFetch({
      id: "emb_1",
      data: [{ index: 0, embedding: [0.1, 0.2] }],
      usage: { prompt_tokens: 3, total_tokens: 3 },
      providerMetadata: { gateway: { cost: "0.00000006" } },
    });

    const result = await createGatewayEmbeddings({
      apiKey: "gw-test",
      model: AI_GATEWAY_EMBEDDING_MODEL,
      input: ["hello"],
      dimensions: 1536,
      fetchImpl,
    });

    const { url, init } = postedCall(fetchImpl);
    expect(url).toBe(`${AI_GATEWAY_BASE_URL}/embeddings`);
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer gw-test",
    );
    expect(parsedBody(init)).toEqual({
      model: "openai/text-embedding-3-small",
      input: ["hello"],
      dimensions: 1536,
    });
    expect(result.id).toBe("emb_1");
    expect(result.data).toEqual([{ index: 0, embedding: [0.1, 0.2] }]);
    expect(result.usage.costUsd).toBe(0.00000006);
    expect(result.usage.promptTokens).toBe(3);
  });

  it("surfaces gateway error messages and omits missing usage fields", async () => {
    const fetchImpl = mockFetch({ error: { message: "Invalid API key" } }, 401);
    await expect(
      createGatewayChatCompletion({
        apiKey: "bad",
        model: AI_GATEWAY_CHAT_MODEL,
        messages: [{ role: "user", content: "hi" }],
        fetchImpl,
      }),
    ).rejects.toThrow("ai gateway http 401: Invalid API key");

    expect(parseGatewayUsage({ usage: { prompt_tokens: 1 } })).toEqual({
      promptTokens: 1,
      completionTokens: undefined,
      totalTokens: undefined,
      cachedTokens: undefined,
      reasoningTokens: undefined,
      costUsd: undefined,
    });
  });
});
