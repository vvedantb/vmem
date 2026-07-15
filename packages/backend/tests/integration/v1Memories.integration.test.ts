// AI-generated (Claude), prompt: "live http api integration tests for v1 memories via the sdk"
// Modified by me: gated on http api test env and api key
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
  type: "knowledge",
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

  it.each([
    {
      label: "without Authorization",
      authToken: null,
      content: "no auth header",
    },
    {
      label: "with an invalid API key",
      authToken: "vmem_sk_invalid_key_for_tests",
      content: "bad key",
    },
  ])("rejects requests $label", async ({ authToken, content }) => {
    const result = await postMemoriesProbe({
      authToken,
      body: { ...storeAuthProbeBody, content },
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
  it("live-test gating matches environment", () => {
    expect(!runLiveHttpApiTest || apiKey?.startsWith("vmem_sk_") === true).toBe(
      true,
    );
  });
});
