import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("memory surface inventory", () => {
  it("HTTP v1 memories routes stay on Convex http.ts", () => {
    const http = readFileSync(join(backendRoot, "convex/http.ts"), "utf8");
    expect(http).toContain('path: "/api/v1/memories"');
    expect(http).toContain('path: "/api/v1/memories/retrieve"');
    expect(http).toContain('method: "POST"');
    expect(http).toContain('method: "PATCH"');
    expect(http).toContain('method: "DELETE"');
    expect(http.toLowerCase()).not.toContain("neo4j");
  });

  it("SDK client covers instruction store/update, retrieve, and structured CRUD", () => {
    const sdk = readFileSync(
      join(backendRoot, "../sdk/src/vmemory.ts"),
      "utf8",
    );
    expect(sdk).toContain("async save(");
    expect(sdk).toContain("async update(");
    expect(sdk).toContain("async search(");
    expect(sdk).toContain("async createMemory(");
    expect(sdk).toContain("async patchMemory(");
    expect(sdk).toContain("async deleteMemory(");
    expect(sdk).toContain("async searchMemories(");
    expect(sdk).toContain("/api/v1/memories/retrieve");
    expect(sdk).toContain("options.status");
    expect(sdk).toContain("options.source");
  });

  it("HTTP instruction store/update return 422 openrouter_required without a key", () => {
    const store = readFileSync(
      join(backendRoot, "convex/http/v1Memories/store.ts"),
      "utf8",
    );
    const update = readFileSync(
      join(backendRoot, "convex/http/v1Memories/update.ts"),
      "utf8",
    );
    const retrieve = readFileSync(
      join(backendRoot, "convex/http/v1Memories/retrieve.ts"),
      "utf8",
    );
    expect(store).toContain("openRouterRequiredResponse");
    expect(update).toContain("openRouterRequiredResponse");
    expect(retrieve).toContain("summarizeRetrievedMemories");
    expect(retrieve).toContain("source: body.source");
    expect(retrieve).not.toContain("openRouterRequiredResponse");
  });

  it("API key usage accounting cannot fail the request", () => {
    const auth = readFileSync(
      join(backendRoot, "convex/http/v1Memories/apiKeyAuth.ts"),
      "utf8",
    );
    expect(auth).toContain("recordUsage failed");
  });
});
