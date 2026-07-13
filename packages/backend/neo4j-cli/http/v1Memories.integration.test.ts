import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createHttpMemoriesClient,
  DEFAULT_HTTP_API_BASE_URL,
  type HttpJsonResult,
} from "./v1MemoriesClient";

const runLiveHttpApiTest = process.env.RUN_HTTP_API_TEST === "1";
const apiKey = process.env.VMEM_API_KEY;
const baseUrl = process.env.VMEM_HTTP_API_BASE_URL ?? DEFAULT_HTTP_API_BASE_URL;

const canRun = runLiveHttpApiTest && apiKey !== undefined && apiKey.length > 0;

function expectOk<T>(
  result: HttpJsonResult<T>,
): asserts result is Extract<HttpJsonResult<T>, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(
      `expected ok response, got ${result.status} ${result.error}`,
    );
  }
}

function expectErr(
  result: HttpJsonResult<unknown>,
): asserts result is Extract<HttpJsonResult<unknown>, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected error response");
  }
}

describe.skipIf(!canRun)("HTTP v1 memories API (live)", () => {
  const client = createHttpMemoriesClient({
    baseUrl,
    apiKey: apiKey ?? "",
  });

  it("GET /health returns ok", async () => {
    const result = await client.health();
    expectOk(result);
    expect(result.status).toBe(200);
    expect(result.data.status).toBe("ok");
  });

  it("rejects requests without Authorization", async () => {
    const result = await client.storeWithoutAuth();
    expectErr(result);
    expect(result.status).toBe(401);
    expect(result.error).toBe("unauthorized");
  });

  it("rejects requests with an invalid API key", async () => {
    const result = await client.storeWithBadKey();
    expectErr(result);
    expect(result.status).toBe(401);
    expect(result.error).toBe("unauthorized");
  });

  it("rejects invalid store payloads", async () => {
    const result = await client.storeInvalidBody();
    expectErr(result);
    expect(result.status).toBe(400);
    expect(result.error).toBe("invalid_request");
  });

  it("store → retrieve → patch → delete flow", async () => {
    const marker = randomUUID();
    let memoryId = "";

    try {
      const storeResult = await client.storeStructured({
        title: marker,
        content: marker,
        type: "note",
        source: "vitest-http-api",
        tags: ["vitest", "http-api"],
        confidence: 1,
        externalId: marker,
        sourceType: "vitest-http-api",
      });

      expectOk(storeResult);
      expect(storeResult.status).toBe(200);
      expect(storeResult.data.id.length).toBeGreaterThan(0);
      expect(storeResult.data.content).toBe(marker);

      memoryId = storeResult.data.id;

      const retrieveResult = await client.retrieve({
        query: marker,
        limit: 5,
      });

      expectOk(retrieveResult);
      expect(retrieveResult.status).toBe(200);
      const ids = retrieveResult.data.memories.map((memory) => memory.id);
      expect(ids).toContain(memoryId);

      const updatedTitle = `${marker}-updated`;
      const updateResult = await client.updateStructured({
        memoryId,
        title: updatedTitle,
        content: `${marker}-patched`,
      });

      expectOk(updateResult);
      expect(updateResult.status).toBe(200);
      expect(updateResult.data.id).toBe(memoryId);
      expect(updateResult.data.title).toBe(updatedTitle);
      expect(updateResult.data.content).toBe(`${marker}-patched`);

      const deleteResult = await client.deleteStructured({ memoryId });

      expectOk(deleteResult);
      expect(deleteResult.status).toBe(200);
      expect(deleteResult.data.deleted).toBe(true);

      memoryId = "";
    } finally {
      if (memoryId.length > 0) {
        await client.deleteStructured({ memoryId });
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
