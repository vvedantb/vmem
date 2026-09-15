// AI-generated (Claude), prompt: "live http api integration tests for v1 memories via the sdk"
// Modified by me: health/401 probes need no API key; CRUD stays key-gated
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { VMemory } from "@vmem/sdk";

const DEFAULT_HTTP_API_BASE_URL =
  "https://clear-bear-690.eu-west-1.convex.site";

const runLiveHttpApiTest = process.env.RUN_HTTP_API_TEST === "1";
const apiKey = process.env.VMEM_API_KEY;
const baseUrl = process.env.VMEM_HTTP_API_BASE_URL ?? DEFAULT_HTTP_API_BASE_URL;

const hasApiKey = apiKey !== undefined && apiKey.length > 0;
const canRunCrud = runLiveHttpApiTest && hasApiKey;

const errorBodySchema = z.object({
  error: z.string(),
});

const healthBodySchema = z.object({
  status: z.string(),
});

async function postJson(args: {
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  authToken: string | null;
  body: object;
}): Promise<{ status: number; error: string | null }> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (args.authToken !== null) {
    headers.set("Authorization", `Bearer ${args.authToken}`);
  }

  const response = await fetch(`${baseUrl}${args.path}`, {
    method: args.method,
    headers,
    body: JSON.stringify(args.body),
  });

  const json: unknown = await response.json().catch(() => null);
  const parsed = errorBodySchema.safeParse(json);
  return {
    status: response.status,
    error: parsed.success ? parsed.data.error : null,
  };
}

const storeAuthProbeBody = {
  title: "should fail",
  content: "probe",
  type: "knowledge",
  source: "vitest",
  tags: Array.of<string>(),
  confidence: 1,
};

describe.skipIf(!runLiveHttpApiTest)(
  "HTTP v1 memories API (live auth gate)",
  () => {
    it("GET /health returns ok", async () => {
      const response = await fetch(`${baseUrl}/health`);
      const json: unknown = await response.json().catch(() => null);
      const parsed = healthBodySchema.safeParse(json);
      expect(response.status).toBe(200);
      expect(parsed.success ? parsed.data.status : null).toBe("ok");
    });

    it.each([
      {
        label: "store without Authorization",
        path: "/api/v1/memories" as const,
        method: "POST" as const,
        authToken: null,
        body: storeAuthProbeBody,
      },
      {
        label: "store with an invalid API key",
        path: "/api/v1/memories" as const,
        method: "POST" as const,
        authToken: "vmem_sk_invalid_key_for_tests",
        body: storeAuthProbeBody,
      },
      {
        label: "retrieve without Authorization",
        path: "/api/v1/memories/retrieve" as const,
        method: "POST" as const,
        authToken: null,
        body: { query: "pnpm" },
      },
      {
        label: "update without Authorization",
        path: "/api/v1/memories" as const,
        method: "PATCH" as const,
        authToken: null,
        body: { id: "mem_missing", title: "x" },
      },
      {
        label: "delete without Authorization",
        path: "/api/v1/memories" as const,
        method: "DELETE" as const,
        authToken: null,
        body: { id: "mem_missing" },
      },
    ])("rejects $label", async ({ path, method, authToken, body }) => {
      const result = await postJson({ path, method, authToken, body });
      expect(result.status).toBe(401);
      expect(result.error).toBe("unauthorized");
    });
  },
);

describe.skipIf(!canRunCrud)("HTTP v1 memories API (live CRUD)", () => {
  const client =
    apiKey !== undefined && apiKey.length > 0
      ? new VMemory({ baseUrl, apiKey })
      : null;

  function vmem(): VMemory {
    if (client === null) {
      throw new Error("VMEM_API_KEY required for live HTTP tests");
    }
    return client;
  }

  it("rejects invalid store payloads", async () => {
    const result = await postJson({
      path: "/api/v1/memories",
      method: "POST",
      authToken: apiKey ?? "",
      body: { title: "missing required fields" },
    });
    expect(result.status).toBe(400);
    expect(result.error).toBe("invalid_request");
  });

  it("store → retrieve → patch → delete flow", async () => {
    const marker = randomUUID();
    let memoryId = "";
    const sdk = vmem();

    try {
      const stored = await sdk.createMemory({
        title: marker,
        content: marker,
        type: "knowledge",
        source: "vitest-http-api",
        tags: ["vitest", "http-api"],
        confidence: 1,
        externalId: marker,
        sourceType: "vitest-http-api",
      });

      expect(stored.id.length).toBeGreaterThan(0);
      expect(stored.content).toBe(marker);

      memoryId = stored.id;

      const retrieveResult = await sdk.searchMemories({
        query: marker,
        limit: 5,
      });

      expect(retrieveResult.memories.map((memory) => memory.id)).toContain(
        memoryId,
      );

      const updatedTitle = `${marker}-updated`;
      const updated = await sdk.patchMemory({
        id: memoryId,
        title: updatedTitle,
        content: `${marker}-patched`,
      });

      expect(updated.id).toBe(memoryId);
      expect(updated.title).toBe(updatedTitle);
      expect(updated.content).toBe(`${marker}-patched`);

      const deleted = await sdk.deleteMemory({ id: memoryId });
      expect(deleted.deleted).toBe(true);

      memoryId = "";
    } finally {
      if (memoryId.length > 0) {
        await sdk.deleteMemory({ id: memoryId });
      }
    }
  }, 30_000);
});

describe("HTTP v1 memories API (config)", () => {
  it("ignores empty or well-formed vmem API keys", () => {
    expect(
      apiKey === undefined ||
        apiKey.length === 0 ||
        apiKey.startsWith("vmem_sk_"),
    ).toBe(true);
  });
});
