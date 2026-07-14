import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { VMemory } from "@vmem/sdk";

const DEFAULT_HTTP_API_BASE_URL =
  "https://outgoing-reindeer-268.eu-west-1.convex.site";

const runLiveHttpApiTest = process.env.RUN_HTTP_API_TEST === "1";
const apiKey = process.env.VMEM_API_KEY;
const baseUrl = process.env.VMEM_HTTP_API_BASE_URL ?? DEFAULT_HTTP_API_BASE_URL;

const canRun = runLiveHttpApiTest && apiKey !== undefined && apiKey.length > 0;

const errorBodySchema = z.object({
  error: z.string(),
});

// authenticated-only sdk cannot probe missing/bad auth; keep a tiny raw post
async function postMemoriesProbe(args: {
  authToken: string | null;
  body: object;
}): Promise<{ status: number; error: string | null }> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (args.authToken !== null) {
    headers.set("Authorization", `Bearer ${args.authToken}`);
  }

  const response = await fetch(`${baseUrl}/api/v1/memories`, {
    method: "POST",
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
  type: "note",
  source: "vitest",
  tags: Array.of<string>(),
  confidence: 1,
};

describe.skipIf(!canRun)("HTTP v1 memories API (live)", () => {
  // Construct only when gated on — VMemory rejects an empty apiKey.
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

  it("GET /health returns ok", async () => {
    const result = await vmem().health();
    expect(result.status).toBe("ok");
  });

  it("rejects requests without Authorization", async () => {
    const result = await postMemoriesProbe({
      authToken: null,
      body: { ...storeAuthProbeBody, content: "no auth header" },
    });
    expect(result.status).toBe(401);
    expect(result.error).toBe("unauthorized");
  });

  it("rejects requests with an invalid API key", async () => {
    const result = await postMemoriesProbe({
      authToken: "vmem_sk_invalid_key_for_tests",
      body: { ...storeAuthProbeBody, content: "bad key" },
    });
    expect(result.status).toBe(401);
    expect(result.error).toBe("unauthorized");
  });

  it("rejects invalid store payloads", async () => {
    const result = await postMemoriesProbe({
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

      const ids = retrieveResult.memories.map((memory) => memory.id);
      expect(ids).toContain(memoryId);

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
  it("when live tests are enabled, API key has the expected prefix", () => {
    if (!canRun) return;
    expect(apiKey?.startsWith("vmem_sk_")).toBe(true);
  });

  it("when live tests are disabled, RUN_HTTP_API_TEST is not 1", () => {
    if (canRun) return;
    expect(process.env.RUN_HTTP_API_TEST).not.toBe("1");
  });
});
