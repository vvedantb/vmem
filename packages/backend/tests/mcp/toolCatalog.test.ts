import { describe, expect, it } from "vitest";
import { toolSpecs } from "../../convex/mcp/toolCatalog";

describe("MCP tool catalog", () => {
  it("exposes Convex memory tools and no codebase or Neo4j tools", () => {
    const names = Object.keys(toolSpecs);
    expect(names).toEqual(
      expect.arrayContaining([
        "memory_search",
        "memory_retrieve",
        "memory_add",
        "memory_add_instruction",
        "memory_update",
        "memory_delete",
        "memory_related",
      ]),
    );
    expect(names.some((name) => name.includes("codebase"))).toBe(false);
    expect(names.some((name) => name.includes("github"))).toBe(false);
    expect(names.some((name) => name.toLowerCase().includes("neo4j"))).toBe(
      false,
    );
  });
});
