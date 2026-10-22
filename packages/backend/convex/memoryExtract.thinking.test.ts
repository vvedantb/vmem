/// <reference types="vite/client" />
import type * as Ai from "ai";
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// no network: the AI SDK chat call is a spy with a canned reply
const generateText = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      text: '{"entities":[],"relatedMemoryIds":[]}',
      finishReason: "stop",
      response: { id: "gen_test" },
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        inputTokenDetails: {},
        outputTokenDetails: {},
      },
      providerMetadata: undefined,
    }),
  ),
);

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof Ai>()),
  generateText,
}));

const USER = "clerk_thinking_off_user";

describe("enrichment entity extraction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generateText.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("sends thinking off with the flex tier to the gateway", async () => {
    const t = convexTest(schema, modules);
    registerAuditLog(t);
    await t
      .withIdentity({ subject: USER })
      .mutation(api.auth.ensureUserExists, {});
    const memory = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      {
        userId: USER,
        profileId: "profile_a",
        title: "Prefers pnpm",
        content: "Use pnpm for vmem",
        type: "knowledge",
        source: "mcp",
        tags: [],
        confidence: 1,
      },
    );

    await t.action(internal.memoryExtract.extractMemoryEntitiesInternal, {
      clerkId: USER,
      memoryId: memory.id,
      profileId: "profile_a",
      updatedAt: memory.updatedAt,
    });

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0]).toEqual([
      expect.objectContaining({
        model: "alibaba/qwen3.7-flash",
        providerOptions: {
          gateway: { serviceTier: "flex" },
          alibaba: { enableThinking: false },
        },
      }),
    ]);
  });
});
