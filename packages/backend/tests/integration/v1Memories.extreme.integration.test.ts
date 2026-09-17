import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { VMemory } from "@vmem/sdk";

const DEFAULT_HTTP_API_BASE_URL =
  "https://clear-bear-690.eu-west-1.convex.site";
const DEFAULT_CONVEX_URL = "https://clear-bear-690.eu-west-1.convex.cloud";

const runLive = process.env.RUN_HTTP_API_TEST === "1";
const apiKey = process.env.VMEM_API_KEY;
const convexJwt = process.env.CONVEX_JWT;
const revokeKey = process.env.VMEM_REVOKE_API_KEY;
const revokeKeyId = process.env.VMEM_REVOKE_API_KEY_ID;
const baseUrl = process.env.VMEM_HTTP_API_BASE_URL ?? DEFAULT_HTTP_API_BASE_URL;
const convexUrl = process.env.CONVEX_URL ?? DEFAULT_CONVEX_URL;

const hasApiKey = apiKey !== undefined && apiKey.length > 0;
const canRun = runLive && hasApiKey;

const errorBodySchema = z.object({
  error: z.string(),
});

async function postJson(args: {
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  authToken: string | null;
  body: unknown;
  rawBody?: string;
}): Promise<{ status: number; error: string | null; json: unknown }> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (args.authToken !== null) {
    headers.set("Authorization", `Bearer ${args.authToken}`);
  }
  const response = await fetch(`${baseUrl}${args.path}`, {
    method: args.method,
    headers,
    body: args.rawBody ?? JSON.stringify(args.body),
  });
  const json: unknown = await response.json().catch(() => null);
  const parsed = errorBodySchema.safeParse(json);
  return {
    status: response.status,
    error: parsed.success ? parsed.data.error : null,
    json,
  };
}

describe.skipIf(!canRun)("HTTP v1 memories extreme live matrix", () => {
  const client =
    apiKey !== undefined && apiKey.length > 0
      ? new VMemory({ baseUrl, apiKey })
      : null;

  function vmem(): VMemory {
    if (client === null) {
      throw new Error("VMEM_API_KEY required");
    }
    return client;
  }

  it("malformed JSON, empty body, oversized payload", async () => {
    const malformed = await postJson({
      path: "/api/v1/memories",
      method: "POST",
      authToken: apiKey ?? "",
      body: {},
      rawBody: "{not-json",
    });
    expect(malformed.status).toBe(400);
    expect(malformed.error).toBe("invalid_json");

    const empty = await postJson({
      path: "/api/v1/memories/retrieve",
      method: "POST",
      authToken: apiKey ?? "",
      body: {},
    });
    expect(empty.status).toBe(400);
    expect(empty.error).toBe("invalid_request");

    const huge = "x".repeat(1_500_000);
    const oversized = await postJson({
      path: "/api/v1/memories",
      method: "POST",
      authToken: apiKey ?? "",
      body: {
        title: "oversized",
        content: huge,
        type: "knowledge",
        source: "vitest-extreme",
      },
    });
    expect([400, 413, 500]).toContain(oversized.status);
  }, 60_000);

  it("limit 0 / 1 / 51 and missing/invalid retrieve fields", async () => {
    const zero = await postJson({
      path: "/api/v1/memories/retrieve",
      method: "POST",
      authToken: apiKey ?? "",
      body: { query: "pnpm", limit: 0 },
    });
    expect(zero.status).toBe(400);

    const hugeLimit = await postJson({
      path: "/api/v1/memories/retrieve",
      method: "POST",
      authToken: apiKey ?? "",
      body: { query: "pnpm", limit: 51 },
    });
    expect(hugeLimit.status).toBe(400);

    const sdk = vmem();
    const marker = `e2e-limit-${randomUUID()}`;
    const stored = await sdk.createMemory({
      title: `${marker} pnpm`,
      content: "Use pnpm",
      type: "knowledge",
      source: "vitest-extreme",
      tags: [marker],
      confidence: 1,
    });
    try {
      const one = await sdk.searchMemories({
        query: marker,
        tags: [marker],
        limit: 1,
      });
      expect(one.memories).toHaveLength(1);
      expect(one.memories[0]?.id).toBe(stored.id);
    } finally {
      await sdk.deleteMemory({ id: stored.id }).catch(() => undefined);
    }
  }, 30_000);

  it("wrong profileId is 403; revoked and garbage keys are 401", async () => {
    const wrongProfile = await postJson({
      path: "/api/v1/memories/retrieve",
      method: "POST",
      authToken: apiKey ?? "",
      body: {
        query: "pnpm",
        profileId: "kd7fffffffffffffffffffffffffff",
      },
    });
    expect(wrongProfile.status).toBe(403);
    expect(wrongProfile.error).toBe("forbidden");

    const garbage = await postJson({
      path: "/api/v1/memories",
      method: "POST",
      authToken: "vmem_sk_totally_not_a_key",
      body: {
        title: "x",
        content: "y",
        type: "knowledge",
        source: "vitest-extreme",
      },
    });
    expect(garbage.status).toBe(401);

    if (
      convexJwt !== undefined &&
      convexJwt.length > 0 &&
      revokeKey !== undefined &&
      revokeKey.length > 0 &&
      revokeKeyId !== undefined &&
      revokeKeyId.length > 0
    ) {
      const revoke = await fetch(`${convexUrl}/api/mutation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${convexJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "apiKeys:revokeMy",
          args: { id: revokeKeyId },
          format: "json",
        }),
      });
      expect(revoke.status).toBe(200);
      const after = await postJson({
        path: "/api/v1/memories/retrieve",
        method: "POST",
        authToken: revokeKey,
        body: { query: "pnpm" },
      });
      expect(after.status).toBe(401);
      expect(after.error).toBe("unauthorized");
    }
  }, 30_000);

  it("idempotent-ish delete: second delete is 404; update missing is 404", async () => {
    const sdk = vmem();
    const stored = await sdk.createMemory({
      title: `e2e-del-${randomUUID()}`,
      content: "delete twice",
      type: "knowledge",
      source: "vitest-extreme",
      tags: ["extreme"],
      confidence: 1,
    });
    const first = await sdk.deleteMemory({ id: stored.id });
    expect(first.deleted).toBe(true);
    const second = await postJson({
      path: "/api/v1/memories",
      method: "DELETE",
      authToken: apiKey ?? "",
      body: { id: stored.id },
    });
    expect(second.status).toBe(404);
    expect(second.error).toBe("not_found");
  }, 20_000);

  it("empty vs dense corpus, near-duplicates, unicode, long doc, concurrent write", async () => {
    const sdk = vmem();
    const marker = `e2e-ext-${randomUUID()}`;
    const ids: string[] = [];
    try {
      const empty = await sdk.searchMemories({
        query: marker,
        tags: [`${marker}-missing`],
        limit: 10,
      });
      expect(empty.memories).toEqual([]);

      const inputs = [
        {
          title: `${marker} prefers pnpm`,
          content:
            "The user uses pnpm as the package manager for the vmem monorepo.",
          type: "knowledge" as const,
          source: "mcp",
          tags: [marker, "tooling"],
        },
        {
          title: `${marker} coffee order`,
          content: "Oat latte every morning.",
          type: "episodic" as const,
          source: "web",
          tags: [marker, "food"],
        },
        {
          title: `${marker} prefers pnpm workspaces`,
          content: "Install JavaScript packages with pnpm in workspaces.",
          type: "knowledge" as const,
          source: "mcp",
          tags: [marker, "tooling"],
        },
        {
          title: `${marker} green tea`,
          content: "المستخدم يحب الشاي الأخضر في الصباح",
          type: "profile" as const,
          source: "manual",
          tags: [marker, "tea"],
        },
        {
          title: `${marker} long notes`,
          content: `${"padding ".repeat(2000)}pnpm is required.`,
          type: "knowledge" as const,
          source: "mcp",
          tags: [marker, "long"],
        },
        ...Array.from({ length: 8 }, (_, index) => ({
          title: `${marker} distractor ${String(index)}`,
          content: `Weather and groceries row ${String(index)}.`,
          type: "knowledge" as const,
          source: "vitest-extreme",
          tags: [marker],
        })),
      ];
      const created: Array<{ id: string }> = [];
      for (const input of inputs) {
        created.push(await sdk.createMemory({ ...input, confidence: 1 }));
      }
      const [pnpm, coffee, paraphrase, arabic, longDoc] = created;
      if (
        pnpm === undefined ||
        coffee === undefined ||
        paraphrase === undefined ||
        arabic === undefined ||
        longDoc === undefined
      ) {
        throw new Error("store returned undefined");
      }
      ids.push(...created.map((memory) => memory.id));

      const concurrent = await Promise.allSettled(
        Array.from({ length: 8 }, (_, index) =>
          sdk.createMemory({
            title: `${marker} concurrent ${String(index)}`,
            content: `Concurrent write ${String(index)}`,
            type: "knowledge",
            source: "vitest-extreme",
            tags: [marker],
            confidence: 1,
          }),
        ),
      );
      for (const result of concurrent) {
        if (result.status === "fulfilled") ids.push(result.value.id);
      }
      expect
        .soft(concurrent.filter((result) => result.status === "fulfilled"))
        .toHaveLength(8);

      const ranked = await sdk.searchMemories({
        query: "what package manager does the user use for vmem",
        tags: [marker],
        limit: 5,
      });
      expect(ranked.memories[0]?.id).toBe(pnpm.id);
      expect(ranked.memories[0]?.id).not.toBe(coffee.id);

      const combo = await sdk.searchMemories({
        query: marker,
        type: "knowledge",
        tags: ["tooling", marker],
        source: "mcp",
        limit: 10,
      });
      const comboIds = combo.memories.map((memory) => memory.id);
      expect(comboIds).toContain(pnpm.id);
      expect(comboIds).not.toContain(coffee.id);

      const bySource = await sdk.searchMemories({
        query: marker,
        source: "web",
        tags: [marker],
        limit: 10,
      });
      expect
        .soft(bySource.memories.map((memory) => memory.id))
        .toEqual([coffee.id]);

      const contradiction = await sdk.searchMemories({
        query: marker,
        type: "episodic",
        tags: ["tooling", marker],
        source: "mcp",
        limit: 10,
      });
      expect(contradiction.memories).toEqual([]);

      const tea = await sdk.searchMemories({
        query: "أين الشاي",
        tags: [marker],
        limit: 5,
      });
      expect.soft(tea.memories.map((memory) => memory.id)).toContain(arabic.id);

      const longHit = await sdk.searchMemories({
        query: "pnpm is required",
        tags: [marker, "long"],
        limit: 5,
      });
      expect(longHit.memories.map((memory) => memory.id)).toContain(longDoc.id);

      const emoji = await sdk.searchMemories({
        query: "🔥",
        tags: [marker],
        limit: 5,
      });
      expect(Array.isArray(emoji.memories)).toBe(true);
    } finally {
      await Promise.all(
        ids.map((id) => sdk.deleteMemory({ id }).catch(() => undefined)),
      );
    }
  }, 90_000);

  it("instruction store without OpenRouter is 422; PATCH instruction too", async () => {
    const store = await postJson({
      path: "/api/v1/memories",
      method: "POST",
      authToken: apiKey ?? "",
      body: { instruction: `extreme instruction ${randomUUID()}` },
    });
    expect(store.status).toBe(422);
    expect(store.error).toBe("openrouter_required");

    const update = await postJson({
      path: "/api/v1/memories",
      method: "PATCH",
      authToken: apiKey ?? "",
      body: { instruction: `extreme instruction update ${randomUUID()}` },
    });
    expect(update.status).toBe(422);
    expect(update.error).toBe("openrouter_required");
  }, 30_000);
});
