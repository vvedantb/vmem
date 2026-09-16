import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { memoryToolSpecs } from "../../convex/mcp/toolsMemory";
import { toolSpecs } from "../../convex/mcp/toolCatalog";
import {
  catalogNamesForScope,
  CORE_TOOL_NAMES,
  FILES_TOOL_NAMES,
  MEMORY_GRAPH_TOOL,
  MEMORY_TOOL_NAMES,
  SKILLS_TOOL_NAMES,
  WIKI_TOOL_NAMES,
} from "./catalog";
import { assertServerToolRegistrationCompiles } from "./inProcess";

describe("MCP tool catalog", () => {
  it("registers every memory, core, skills, wiki, and files tool and no codebase tools", () => {
    const names = Object.keys(toolSpecs);
    expect(names).toEqual(
      expect.arrayContaining([
        ...CORE_TOOL_NAMES,
        ...MEMORY_TOOL_NAMES,
        ...SKILLS_TOOL_NAMES,
        ...WIKI_TOOL_NAMES,
        ...FILES_TOOL_NAMES,
      ]),
    );
    expect(names).toHaveLength(
      CORE_TOOL_NAMES.length +
        MEMORY_TOOL_NAMES.length +
        SKILLS_TOOL_NAMES.length +
        WIKI_TOOL_NAMES.length +
        FILES_TOOL_NAMES.length,
    );
    expect(names.some((name) => name.includes("codebase"))).toBe(false);
    expect(names.some((name) => name.includes("github"))).toBe(false);
    expect(names.some((name) => name.toLowerCase().includes("neo4j"))).toBe(
      false,
    );
    expect(toolSpecs.memory_search).toBe(memoryToolSpecs.memory_search);
  });

  it("exposes personal-only tools on personal scope and hides them on team", () => {
    const personal = catalogNamesForScope("personal");
    const team = catalogNamesForScope("team");
    expect(personal).toEqual(expect.arrayContaining([...SKILLS_TOOL_NAMES]));
    expect(personal).toEqual(expect.arrayContaining([...WIKI_TOOL_NAMES]));
    expect(personal).toEqual(expect.arrayContaining([...FILES_TOOL_NAMES]));
    expect(personal).toContain("context_prompt_get");
    expect(personal).toContain(MEMORY_GRAPH_TOOL);
    expect(team).toEqual(expect.arrayContaining([...MEMORY_TOOL_NAMES]));
    expect(team).toContain("ping");
    expect(team).toContain(MEMORY_GRAPH_TOOL);
    expect(team).not.toContain("context_prompt_get");
    expect(team.some((name) => name.startsWith("skills_"))).toBe(false);
    expect(team.some((name) => name.startsWith("wiki_"))).toBe(false);
    expect(team.some((name) => name.startsWith("files_"))).toBe(false);
  });

  it("registers tools onto an MCP server for personal and team scopes", () => {
    assertServerToolRegistrationCompiles("personal");
    assertServerToolRegistrationCompiles("team");
  });

  it("describes retrieve as hybrid ranking rather than substring-only", () => {
    expect(memoryToolSpecs.memory_retrieve.description).toContain("hybrid");
    expect(memoryToolSpecs.memory_retrieve.description).not.toContain(
      "substring",
    );
  });

  it("retrieve schema and handler pass type, tags, and status filters", () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../convex/mcp/toolsMemory.ts",
      ),
      "utf8",
    );
    const retrieveBlock = source.slice(
      source.indexOf("memory_retrieve:"),
      source.indexOf("memory_add:"),
    );
    expect(retrieveBlock).toContain("type: params.type");
    expect(retrieveBlock).toContain("tags: params.tags");
    expect(retrieveBlock).toContain("status: params.status");
    expect(source).toContain("Max results (default 10)");
    expect(
      memoryToolSpecs.memory_retrieve.schema.safeParse({
        query: "london",
        type: "profile",
        tags: ["pnpm"],
        status: "pinned",
      }).success,
    ).toBe(true);
  });
});
