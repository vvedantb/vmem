import { expectMcpToolCount } from "@vvedantb/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { memoryToolSpecs } from "../../convex/mcp/toolsMemory";
import {
  MCP_EXCLUDED_TOOL_NAMES,
  toolSpecs,
} from "../../convex/mcp/toolCatalog";
import {
  catalogNamesForScope,
  CONNECTORS_TOOL_NAMES,
  CONTEXT_TOOL_NAMES,
  CORE_TOOL_NAMES,
  FILES_TOOL_NAMES,
  INBOX_TOOL_NAMES,
  MEMORY_GRAPH_TOOL,
  MEMORY_MANAGE_TOOL_NAMES,
  MEMORY_TOOL_NAMES,
  PERSONAL_ONLY_ACCOUNT_TOOL_NAMES,
  PERSONAL_ONLY_INBOX_TOOL_NAMES,
  PROFILES_TOOL_NAMES,
  SETTINGS_TOOL_NAMES,
  SKILLS_TOOL_NAMES,
  TEAMS_TOOL_NAMES,
  USAGE_TOOL_NAMES,
} from "./catalog";

const ALL_TOOL_GROUPS = [
  CORE_TOOL_NAMES,
  CONTEXT_TOOL_NAMES,
  MEMORY_TOOL_NAMES,
  MEMORY_MANAGE_TOOL_NAMES,
  INBOX_TOOL_NAMES,
  SKILLS_TOOL_NAMES,
  FILES_TOOL_NAMES,
  PROFILES_TOOL_NAMES,
  TEAMS_TOOL_NAMES,
  SETTINGS_TOOL_NAMES,
  CONNECTORS_TOOL_NAMES,
  USAGE_TOOL_NAMES,
] as const;
import {
  assertServerToolRegistrationCompiles,
  createInProcessSession,
  InProcessMcpClient,
  MOCK_MCP_TOKEN,
} from "./inProcess";

describe("MCP tool catalog", () => {
  it("registers every catalogued tool and no codebase or wiki tools", () => {
    const names = Object.keys(toolSpecs);
    const catalogued = ALL_TOOL_GROUPS.flat();
    expect(names).toEqual(expect.arrayContaining(catalogued));
    expectMcpToolCount(names, catalogued.length);
    expect(names.some((name) => name.includes("codebase"))).toBe(false);
    expect(names.some((name) => name.startsWith("wiki_"))).toBe(false);
    expect(names.some((name) => name.includes("github"))).toBe(false);
    expect(names.some((name) => name.toLowerCase().includes("neo4j"))).toBe(
      false,
    );
    expect(toolSpecs.memory_search).toBe(memoryToolSpecs.memory_search);
  });

  it("exposes skills, files and teams on both scopes and keeps user-wide tools personal", () => {
    const personal = catalogNamesForScope("personal");
    const team = catalogNamesForScope("team");
    expect(personal).toEqual(expect.arrayContaining([...SKILLS_TOOL_NAMES]));
    expect(personal).toEqual(expect.arrayContaining([...FILES_TOOL_NAMES]));
    expect(personal).toContain("context_prompt_get");
    expect(personal).toContain(MEMORY_GRAPH_TOOL);
    expect(team).toEqual(expect.arrayContaining([...MEMORY_TOOL_NAMES]));
    expect(team).toEqual(expect.arrayContaining([...MEMORY_MANAGE_TOOL_NAMES]));
    expect(team).toEqual(expect.arrayContaining([...SKILLS_TOOL_NAMES]));
    expect(team).toContain("ping");
    expect(personal).toContain("context_pack");
    expect(team).toContain("context_pack");
    expect(team).toContain(MEMORY_GRAPH_TOOL);
    expect(team).not.toContain("context_prompt_get");
    expect(personal).toEqual(expect.arrayContaining([...INBOX_TOOL_NAMES]));
    expect(team).toContain("proposals_list");
    expect(team).toContain("proposals_resolve");
    for (const name of PERSONAL_ONLY_INBOX_TOOL_NAMES) {
      expect(team).not.toContain(name);
    }
    expect(team).toEqual(expect.arrayContaining([...FILES_TOOL_NAMES]));
    expect(team).toEqual(expect.arrayContaining([...TEAMS_TOOL_NAMES]));
    expect(personal).toEqual(expect.arrayContaining([...TEAMS_TOOL_NAMES]));
    expect(team).toContain("profiles_update");
    expect(team).toContain("usage_ai_logs");
    for (const name of PERSONAL_ONLY_ACCOUNT_TOOL_NAMES) {
      expect(personal).toContain(name);
      expect(team).not.toContain(name);
    }
  });

  it("never registers or lists the web-UI-only excluded tools", async () => {
    expect(MCP_EXCLUDED_TOOL_NAMES).toContain("memory_delete_all");
    const specNames = Object.values(toolSpecs).map((spec) => spec.name);
    const catalogued: string[] = ALL_TOOL_GROUPS.flat();
    for (const scope of ["personal", "team"] as const) {
      const listed = await new InProcessMcpClient({
        session: createInProcessSession(scope),
        token: MOCK_MCP_TOKEN,
      }).listTools();
      for (const name of MCP_EXCLUDED_TOOL_NAMES) {
        expect(Object.keys(toolSpecs)).not.toContain(name);
        expect(specNames).not.toContain(name);
        expect(catalogued).not.toContain(name);
        expect(catalogNamesForScope(scope)).not.toContain(name);
        expect(listed, `${scope} tools/list`).not.toContain(name);
      }
    }
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
    expect(retrieveBlock).toContain("source: params.source");
    expect(retrieveBlock).toContain("threshold: params.threshold");
    expect(retrieveBlock).toContain("rerank: params.rerank");
    expect(retrieveBlock).not.toContain("judge: params.judge");
    expect(retrieveBlock).toContain("referenceDate: params.referenceDate");
    expect(source).toContain("Max results (default 10)");
    expect(
      memoryToolSpecs.memory_retrieve.schema.safeParse({
        query: "london",
        type: "profile",
        tags: ["pnpm"],
        status: "pinned",
        source: "mcp",
      }).success,
    ).toBe(true);
  });
});
