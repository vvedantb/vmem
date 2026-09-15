import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toolSpecs } from "../../convex/mcp/toolCatalog";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Neo4j runtime is gone", () => {
  it("backend package.json has no neo4j dependency", () => {
    const pkg = readFileSync(join(backendRoot, "package.json"), "utf8");
    expect(pkg.toLowerCase()).not.toContain("neo4j");
  });

  it("example env does not require NEO4J_* variables", () => {
    const example = readFileSync(join(backendRoot, ".env.example"), "utf8");
    expect(example.toUpperCase()).not.toContain("NEO4J");
  });

  it("MCP catalog has no neo4j or codebase tools", () => {
    const names = Object.keys(toolSpecs);
    expect(names.some((name) => name.toLowerCase().includes("neo4j"))).toBe(
      false,
    );
    expect(names.some((name) => name.includes("codebase"))).toBe(false);
  });
});
