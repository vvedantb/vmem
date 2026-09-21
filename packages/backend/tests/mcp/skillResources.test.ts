import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  formatSkillResourceMarkdown,
  parseSkillResourceName,
  registerResources,
  skillResourceDescriptors,
  skillResourceUri,
} from "../../convex/mcp/resources";
import {
  createMockActionCtx,
  createMockStore,
  MOCK_CLERK_ID,
} from "./mockBackend";

function captureResourceServer(uris: string[]): McpServer {
  return {
    registerResource: (_name: string, uri: string) => {
      uris.push(String(uri));
    },
  } as unknown as McpServer;
}

describe("MCP skill resources", () => {
  it("builds vmem://skills/<name> URIs and round-trips encoded names", () => {
    expect(skillResourceUri("wiki-writeup")).toBe("vmem://skills/wiki-writeup");
    expect(parseSkillResourceName("vmem://skills/wiki-writeup")).toBe(
      "wiki-writeup",
    );
    const spaced = skillResourceUri("Code Review");
    expect(spaced).toBe("vmem://skills/Code%20Review");
    expect(parseSkillResourceName(spaced)).toBe("Code Review");
    expect(parseSkillResourceName("vmem://context_prompt")).toBeNull();
  });

  it("lists a descriptor per enabled skill and formats markdown with manifest metadata", () => {
    const descriptors = skillResourceDescriptors([
      { name: "wiki-writeup", description: "Write a wiki explainer" },
    ]);
    expect(descriptors).toEqual([
      {
        name: "skill_wiki_writeup",
        uri: "vmem://skills/wiki-writeup",
        title: "wiki-writeup",
        description: "Write a wiki explainer",
        mimeType: "text/markdown",
      },
    ]);
    const markdown = formatSkillResourceMarkdown({
      name: "wiki-writeup",
      description: "Write a wiki explainer",
      instructions: "1. Fetch the source\n2. Write chapters",
    });
    expect(markdown).toContain('name: "wiki-writeup"');
    expect(markdown).toContain('uri: "vmem://skills/wiki-writeup"');
    expect(markdown).toContain("1. Fetch the source");
  });

  it("registers context_prompt plus granted skill URIs on personal, skills only on team", async () => {
    const store = createMockStore();
    store.skills.push({
      name: "wiki-writeup",
      description: "Write a wiki explainer",
      instructions: "Write chapters",
      enabled: true,
      source: "personal",
      grant: "personal",
    });
    store.skills.push({
      name: "team-runbook",
      description: "Team deploy runbook",
      instructions: "Ship it",
      enabled: true,
      source: "personal",
      grant: "team",
    });

    const personalUris: string[] = [];
    await registerResources(
      captureResourceServer(personalUris),
      MOCK_CLERK_ID,
      createMockActionCtx(store),
      "personal",
    );
    expect(personalUris).toContain("vmem://context_prompt");
    expect(personalUris).toContain("vmem://skills/wiki-writeup");
    expect(personalUris).not.toContain("vmem://skills/team-runbook");

    const teamUris: string[] = [];
    await registerResources(
      captureResourceServer(teamUris),
      MOCK_CLERK_ID,
      createMockActionCtx(store),
      "team",
    );
    expect(teamUris).not.toContain("vmem://context_prompt");
    expect(teamUris).toContain("vmem://skills/team-runbook");
    expect(teamUris).not.toContain("vmem://skills/wiki-writeup");
  });
});
