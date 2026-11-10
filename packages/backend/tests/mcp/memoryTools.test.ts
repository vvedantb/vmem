import { describe, expect, it } from "vitest";
import { memoryToolSpecs } from "../../convex/mcp/toolsMemory";
import { toolSpecs } from "../../convex/mcp/toolCatalog";
import { MEMORY_TOOL_NAMES } from "./catalog";

describe("MCP memory tool surfaces", () => {
  it("registers search retrieve add batch get instruction update delete related", () => {
    expect(Object.keys(memoryToolSpecs)).toEqual([...MEMORY_TOOL_NAMES]);
    expect(toolSpecs.memory_search).toBe(memoryToolSpecs.memory_search);
  });

  it("parses personal and team-shaped arguments for every memory tool", () => {
    expect(
      memoryToolSpecs.memory_search.schema.safeParse({
        query: "package manager",
        type: "knowledge",
        tags: ["tooling"],
        source: "mcp",
        profileId: "profile_team",
        limit: 20,
        offset: 0,
      }).success,
    ).toBe(true);

    expect(
      memoryToolSpecs.memory_retrieve.schema.safeParse({
        query: "what editor does the user like",
        type: "knowledge",
        tags: ["editor"],
        profileId: "profile_personal",
        limit: 5,
      }).success,
    ).toBe(true);

    expect(
      memoryToolSpecs.memory_add.schema.safeParse({
        title: "Prefers pnpm",
        content: "Use pnpm",
        type: "knowledge",
        source: "mcp",
        tags: ["tooling"],
        confidence: 0.9,
        profileId: "profile_personal",
      }).success,
    ).toBe(true);

    expect(
      memoryToolSpecs.memory_add_instruction.schema.safeParse({
        instruction: "Remember the user prefers dark mode",
        profileId: "profile_personal",
      }).success,
    ).toBe(true);

    expect(
      memoryToolSpecs.memory_update.schema.safeParse({
        id: "mem_1",
        title: "Prefers pnpm workspaces",
        status: "pinned",
      }).success,
    ).toBe(true);

    expect(
      memoryToolSpecs.memory_delete.schema.safeParse({ id: "mem_1" }).success,
    ).toBe(true);

    expect(
      memoryToolSpecs.memory_related.schema.safeParse({
        memoryId: "mem_1",
      }).success,
    ).toBe(true);
  });

  it("describes retrieve as hybrid ranking rather than substring-only", () => {
    expect(memoryToolSpecs.memory_retrieve.description).toContain("hybrid");
    expect(memoryToolSpecs.memory_retrieve.description).not.toContain(
      "substring",
    );
  });

  it("retrieve schema and handler pass type, tags, and status filters", () => {
    expect(
      memoryToolSpecs.memory_retrieve.schema.safeParse({
        query: "london",
        type: "profile",
        tags: ["pnpm"],
        status: "pinned",
        source: "mcp",
        rerank: "jev",
      }).success,
    ).toBe(true);
    expect(
      memoryToolSpecs.memory_retrieve.schema.safeParse({
        query: "london",
        judge: "off",
      }).success,
    ).toBe(true);
    expect("judge" in memoryToolSpecs.memory_retrieve.schema.shape).toBe(false);
    expect(memoryToolSpecs.memory_retrieve.description).toContain(
      "AI_GATEWAY_API_KEY",
    );
    expect(memoryToolSpecs.memory_retrieve.description).not.toContain(
      'judge: "off"',
    );
  });

  it("instruction add documents the AI Gateway gate", () => {
    expect(memoryToolSpecs.memory_add_instruction.description).toContain(
      "AI_GATEWAY_API_KEY",
    );
    expect(memoryToolSpecs.memory_add_instruction.description).toContain(
      "openrouter_required",
    );
  });
});
