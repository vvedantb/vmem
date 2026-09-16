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
  });
});
